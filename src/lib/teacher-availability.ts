import { supabase } from "@/lib/supabase";
import {
  WorkingAvailability,
  RestBlock,
  WEEKDAYS_MAP,
  fetchTeacherWorkingAvailability,
  fetchTeacherRestBlocks,
} from "@/lib/availability-engine";
import {
  TeacherTimeOff,
  fetchTeacherTimeOff,
  checkDateIsNonWorking,
} from "@/lib/time-off-engine";

export type { WorkingAvailability, RestBlock, TeacherTimeOff };
export { WEEKDAYS_MAP };

export const WEEKDAY_KEYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export interface TeacherAvailabilitySnapshot {
  teacherId: string;
  /** Base weekly availability (settings.working_availability) */
  days: WorkingAvailability[];
  /** Recurring rest blocks (settings.rest_blocks) */
  restBlocks: RestBlock[];
  /** Date exceptions (teacher_time_off) */
  timeOff: TeacherTimeOff[];
  /** settings.default_class_duration */
  defaultDuration: number;
  /** teacher_profiles.timezone — SINGLE source of truth for timezone */
  timezone: string;
  /** true when the teacher has never configured any working day */
  isConfigured: boolean;
  fetchedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, TeacherAvailabilitySnapshot>();

export function invalidateTeacherAvailability(teacherId?: string) {
  if (teacherId) cache.delete(teacherId);
  else cache.clear();
}

/** Reads the teacher timezone from teacher_profiles (fallback: profiles). Never invents a new source. */
export async function fetchTeacherTimezone(teacherId: string): Promise<string> {
  if (!teacherId) return "America/Sao_Paulo";
  try {
    const { data } = await supabase
      .from("teacher_profiles")
      .select("timezone")
      .eq("id", teacherId)
      .maybeSingle();
    if (data?.timezone) return data.timezone as string;

    const { data: legacy } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", teacherId)
      .maybeSingle();
    if (legacy?.timezone) return legacy.timezone as string;
  } catch (err) {
    console.warn("[teacher-availability] Could not read timezone:", err);
  }
  return "America/Sao_Paulo";
}

/**
 * Single entry point for every module that depends on teacher availability.
 * Supabase is the operational source of truth; the in-memory cache is short lived
 * and is always replaced by fresh server data.
 */
export async function getTeacherAvailability(
  teacherId: string,
  opts: { force?: boolean } = {}
): Promise<TeacherAvailabilitySnapshot> {
  const empty: TeacherAvailabilitySnapshot = {
    teacherId,
    days: [],
    restBlocks: [],
    timeOff: [],
    defaultDuration: 60,
    timezone: "America/Sao_Paulo",
    isConfigured: false,
    fetchedAt: Date.now(),
  };
  if (!teacherId) return empty;

  const cached = cache.get(teacherId);
  if (!opts.force && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  const [days, restBlocks, timeOff, timezone, settingsRes] = await Promise.all([
    fetchTeacherWorkingAvailability(teacherId),
    fetchTeacherRestBlocks(teacherId),
    fetchTeacherTimeOff(teacherId),
    fetchTeacherTimezone(teacherId),
    supabase
      .from("settings")
      .select("default_class_duration")
      .eq("teacher_id", teacherId)
      .maybeSingle(),
  ]);

  const snapshot: TeacherAvailabilitySnapshot = {
    teacherId,
    days: days || [],
    restBlocks: restBlocks || [],
    timeOff: timeOff || [],
    defaultDuration: settingsRes?.data?.default_class_duration || 60,
    timezone,
    isConfigured: (days || []).some((d) => d.enabled),
    fetchedAt: Date.now(),
  };

  cache.set(teacherId, snapshot);
  return snapshot;
}

export function timeToMinutes(t?: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function weekdayKeyFromDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return WEEKDAY_KEYS[d.getDay()];
}

export interface UnavailableReason {
  kind: "day_off" | "outside_hours" | "rest_block" | "time_off" | "not_configured";
  message: string;
}

/** Free (non-rest) working intervals for a weekday, in minutes since midnight. */
export function getWorkingSegments(
  snapshot: TeacherAvailabilitySnapshot,
  weekday: string
): Array<{ start: number; end: number }> {
  const day = snapshot.days.find(
    (d) => d.day.toLowerCase() === weekday.toLowerCase() && d.enabled
  );
  if (!day || !day.startTime || !day.endTime) return [];

  const start = timeToMinutes(day.startTime);
  const end = timeToMinutes(day.endTime);
  if (start >= end) return [];

  const rests = snapshot.restBlocks
    .filter((b) => b.day.toLowerCase() === weekday.toLowerCase())
    .map((b) => ({
      start: Math.max(start, timeToMinutes(b.startTime)),
      end: Math.min(end, timeToMinutes(b.endTime)),
    }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  const segments: Array<{ start: number; end: number }> = [];
  let cursor = start;
  for (const r of rests) {
    if (r.start > cursor) segments.push({ start: cursor, end: r.start });
    cursor = Math.max(cursor, r.end);
  }
  if (cursor < end) segments.push({ start: cursor, end });
  return segments;
}

/** Bookable start times for a weekday, stepped by lesson duration. */
export function getAvailableSlots(
  snapshot: TeacherAvailabilitySnapshot,
  weekday: string,
  durationMinutes?: number
): string[] {
  const step = durationMinutes || snapshot.defaultDuration || 60;
  const slots: string[] = [];
  for (const seg of getWorkingSegments(snapshot, weekday)) {
    for (let t = seg.start; t + step <= seg.end; t += step) {
      slots.push(minutesToTime(t));
    }
  }
  return slots;
}

/** Validates a concrete date+time against the teacher's single source of truth. */
export function isSlotAvailable(
  snapshot: TeacherAvailabilitySnapshot,
  dateStr: string,
  startTime: string,
  endTime: string
): { available: boolean; reason?: UnavailableReason } {
  if (!snapshot.isConfigured) {
    return {
      available: false,
      reason: {
        kind: "not_configured",
        message: "Você ainda não configurou sua disponibilidade de trabalho.",
      },
    };
  }

  const off = checkDateIsNonWorking(dateStr, snapshot.timeOff);
  if (off) {
    return {
      available: false,
      reason: {
        kind: "time_off",
        message: `Data marcada como período sem aula (${off.title || off.type}).`,
      },
    };
  }

  const weekday = weekdayKeyFromDate(dateStr);
  const day = snapshot.days.find(
    (d) => d.day.toLowerCase() === weekday.toLowerCase() && d.enabled
  );
  if (!day) {
    return {
      available: false,
      reason: { kind: "day_off", message: "Você não trabalha neste dia da semana." },
    };
  }

  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);
  if (s < timeToMinutes(day.startTime) || e > timeToMinutes(day.endTime)) {
    return {
      available: false,
      reason: {
        kind: "outside_hours",
        message: `Fora do seu horário de trabalho (${day.startTime}–${day.endTime}).`,
      },
    };
  }

  const rest = snapshot.restBlocks.find(
    (b) =>
      b.day.toLowerCase() === weekday.toLowerCase() &&
      s < timeToMinutes(b.endTime) &&
      timeToMinutes(b.startTime) < e
  );
  if (rest) {
    return {
      available: false,
      reason: {
        kind: "rest_block",
        message: `Conflita com sua pausa (${rest.label || "Descanso"} ${rest.startTime}–${rest.endTime}).`,
      },
    };
  }

  return { available: true };
}

export interface BookingConflict {
  kind: "student" | "class";
  name: string;
  weekday: string;
  timeRange: string;
}

/**
 * Detects double-booking against other students' and classes' recurring schedules.
 * teacherId always comes from the authenticated session, never from a form field.
 */
export async function findRecurringConflicts(
  teacherId: string,
  weekday: string,
  startTime: string,
  endTime: string,
  ignoreStudentId?: string
): Promise<BookingConflict[]> {
  if (!teacherId || !weekday) return [];
  const conflicts: BookingConflict[] = [];
  const s = timeToMinutes(startTime);
  const e = timeToMinutes(endTime);

  try {
    const { data: students } = await supabase
      .from("students")
      .select("id, full_name, status")
      .eq("teacher_id", teacherId)
      .neq("status", "Inactive");

    const ids = (students || [])
      .map((st) => st.id)
      .filter((id) => id !== ignoreStudentId);

    if (ids.length > 0) {
      const { data: schedules } = await supabase
        .from("student_schedules")
        .select("student_id, weekday, start_time, end_time")
        .in("student_id", ids);

      for (const sch of schedules || []) {
        if (sch.weekday?.toLowerCase() !== weekday.toLowerCase()) continue;
        if (s < timeToMinutes(sch.end_time) && timeToMinutes(sch.start_time) < e) {
          const st = (students || []).find((x) => x.id === sch.student_id);
          conflicts.push({
            kind: "student",
            name: st?.full_name || "Aluno",
            weekday: sch.weekday,
            timeRange: `${(sch.start_time || "").slice(0, 5)}–${(sch.end_time || "").slice(0, 5)}`,
          });
        }
      }
    }

    const { data: classes } = await supabase
      .from("classes")
      .select("id, name, status")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const classIds = (classes || []).map((c) => c.id);
    if (classIds.length > 0) {
      const { data: cSchedules } = await supabase
        .from("class_schedules")
        .select("class_id, weekday, start_time, end_time")
        .in("class_id", classIds);

      for (const sch of cSchedules || []) {
        if (sch.weekday?.toLowerCase() !== weekday.toLowerCase()) continue;
        if (s < timeToMinutes(sch.end_time) && timeToMinutes(sch.start_time) < e) {
          const cls = (classes || []).find((x) => x.id === sch.class_id);
          conflicts.push({
            kind: "class",
            name: `Turma: ${cls?.name || ""}`,
            weekday: sch.weekday,
            timeRange: `${(sch.start_time || "").slice(0, 5)}–${(sch.end_time || "").slice(0, 5)}`,
          });
        }
      }
    }
  } catch (err) {
    console.warn("[teacher-availability] Error checking recurring conflicts:", err);
  }

  return conflicts;
}

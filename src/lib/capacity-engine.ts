import { supabase } from "@/lib/supabase";
import {
  getTeacherAvailability, getAvailableSlots, isSlotAvailable, minutesToTime,
  type TeacherAvailabilitySnapshot,
} from "@/lib/teacher-availability";
import { type WorkingAvailability, type RestBlock, WEEKDAYS_MAP } from "@/lib/availability-engine";
import { rowDurationMinutes } from "@/lib/student-schedules";

export interface DayCapacity {
  day: string; // "Monday", "Tuesday", etc.
  dayLabelPt: string; // "Seg", "Ter", etc.
  fullPt: string; // "Segunda-feira", etc.
  enabled: boolean;
  workStartTime?: string;
  workEndTime?: string;
  validSlots: number;
  occupiedSlots: number;
  remainingSlots: number;
  restBlocksCount: number;
  date: string;
  availableSlots: Array<{ startTime: string; endTime: string }>;
}

export interface RealCapacityResult {
  hasWorkingHours: boolean;
  totalValidSlots: number;
  totalOccupiedSlots: number;
  totalRemainingSlots: number;
  occupancyPct: number;
  /** Real weekly teaching availability (working hours minus rest blocks), in minutes. */
  availableWeeklyMinutes: number;
  slotDurationMinutes: number;
  days: DayCapacity[];
}

/**
 * Converts HH:MM time string to total minutes since midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Computes available non-rest working intervals for a day.
 * Subtracts rest blocks from the main [workStart, workEnd] window.
 */
export function getWorkingSegments(
  workStartStr: string,
  workEndStr: string,
  restBlocks: RestBlock[]
): Array<{ start: number; end: number }> {
  const workStart = timeToMinutes(workStartStr);
  const workEnd = timeToMinutes(workEndStr);

  if (workStart >= workEnd) return [];

  // Sort and filter rest blocks that intersect workStart..workEnd
  const validRest = restBlocks
    .map((b) => ({
      start: Math.max(workStart, timeToMinutes(b.startTime)),
      end: Math.min(workEnd, timeToMinutes(b.endTime)),
    }))
    .filter((b) => b.start < b.end)
    .sort((a, b) => a.start - b.start);

  if (validRest.length === 0) {
    return [{ start: workStart, end: workEnd }];
  }

  const segments: Array<{ start: number; end: number }> = [];
  let currentStart = workStart;

  for (const rb of validRest) {
    if (rb.start > currentStart) {
      segments.push({ start: currentStart, end: rb.start });
    }
    currentStart = Math.max(currentStart, rb.end);
  }

  if (currentStart < workEnd) {
    segments.push({ start: currentStart, end: workEnd });
  }

  return segments;
}

export interface CapacityBooking {
  id: string;
  weekday?: string;
  start_time: string | null;
  end_time?: string | null;
  duration?: number | null;
  duration_minutes?: number | null;
}
export interface CapacityEvent extends CapacityBooking {
  date: string;
  status: string;
  schedule_id?: string | null;
  class_schedule_id?: string | null;
  original_date?: string | null;
}

/** One dated, canonical slot list drives both the Growth counts and their drill-down. */
export function buildCapacityDays(
  snapshot: TeacherAvailabilitySnapshot,
  students: CapacityBooking[],
  classes: CapacityBooking[],
  events: CapacityEvent[],
  today: string,
): DayCapacity[] {
  return WEEKDAYS_MAP.map((weekday) => {
    const date = new Date(`${today}T12:00:00Z`);
    const targetDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].indexOf(weekday.key);
    date.setUTCDate(date.getUTCDate() + (targetDay - date.getUTCDay() + 7) % 7);
    const dateStr = date.toISOString().slice(0, 10);
    const day = snapshot.days.find((d) => d.day.toLowerCase() === weekday.key.toLowerCase());
    const slots = day?.enabled ? getAvailableSlots(snapshot, weekday.key) : [];
    const restricted = slots.filter((startTime) =>
      isSlotAvailable(snapshot, dateStr, startTime, minutesToTime(timeToMinutes(startTime) + snapshot.defaultDuration)).available
    );
    // A saved occurrence (including a cancellation or moved original date) replaces
    // its recurring placeholder. Do not reserve the old slot after rescheduling.
    const recurring = (rows: CapacityBooking[], key: "schedule_id" | "class_schedule_id") => rows.filter((row) =>
      row.weekday?.toLowerCase() === weekday.key.toLowerCase() &&
      !events.some((event) => event[key] === row.id && (event.date === dateStr || event.original_date === dateStr))
    );
    const booked = [
      ...recurring(students, "schedule_id"), ...recurring(classes, "class_schedule_id"),
      ...events.filter((event) => event.date === dateStr && event.status !== "Cancelled"),
    ];
    const intervals = booked.map((row) => {
      const start = timeToMinutes(row.start_time || "");
      const duration = row.duration ?? rowDurationMinutes({ duration_minutes: row.duration_minutes ?? null, start_time: row.start_time, end_time: row.end_time ?? null });
      const end = duration && duration > 0 ? start + duration : timeToMinutes(row.end_time || "");
      if (!row.start_time || end <= start) throw new Error("Invalid booked lesson interval");
      return { start, end };
    });
    const availableSlots = restricted.filter((startTime) => {
      const start = timeToMinutes(startTime);
      return !intervals.some((interval) => start < interval.end && interval.start < start + snapshot.defaultDuration);
    }).map((startTime) => ({ startTime, endTime: minutesToTime(timeToMinutes(startTime) + snapshot.defaultDuration) }));
    return {
      day: weekday.key, dayLabelPt: weekday.labelPt, fullPt: weekday.fullPt,
      date: dateStr, enabled: Boolean(day?.enabled),
      workStartTime: day?.startTime, workEndTime: day?.endTime,
      validSlots: restricted.length, occupiedSlots: restricted.length - availableSlots.length,
      remainingSlots: availableSlots.length, availableSlots,
      restBlocksCount: snapshot.restBlocks.filter((b) => b.day.toLowerCase() === weekday.key.toLowerCase()).length,
    };
  });
}

export async function calculateRealCapacity(teacherId: string): Promise<RealCapacityResult> {
  const empty: RealCapacityResult = {
    hasWorkingHours: false, totalValidSlots: 0, totalOccupiedSlots: 0,
    totalRemainingSlots: 0, occupancyPct: 0, availableWeeklyMinutes: 0,
    slotDurationMinutes: 60, days: [],
  };
  if (!teacherId) return empty;
  const [snapshot, settingsRes] = await Promise.all([
    getTeacherAvailability(teacherId, { force: true }),
    supabase.from("settings").select("working_availability, rest_blocks, default_class_duration").eq("teacher_id", teacherId).maybeSingle(),
  ]);
  // Capacity must not advertise slots from an old rest-block browser cache or a failed read.
  if (settingsRes.error) throw settingsRes.error;
  snapshot.days = (settingsRes.data?.working_availability || []) as WorkingAvailability[];
  snapshot.restBlocks = (settingsRes.data?.rest_blocks || []) as RestBlock[];
  snapshot.defaultDuration = settingsRes.data?.default_class_duration || 60;
  snapshot.isConfigured = snapshot.days.some((day) => day.enabled);
  if (!snapshot.isConfigured) return empty;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: snapshot.timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  const lastDay = new Date(`${today}T12:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() + 6);
  const until = lastDay.toISOString().slice(0, 10);
  const [studentsRes, classesRes, eventsRes] = await Promise.all([
    supabase.from("students").select("id").eq("teacher_id", teacherId).neq("status", "Inactive"),
    supabase.from("classes").select("id").eq("teacher_id", teacherId).eq("status", "active"),
    supabase.from("calendar_events")
      .select("id, date, start_time, end_time, duration, status, schedule_id, class_schedule_id, original_date")
      .eq("teacher_id", teacherId)
      .or(`and(date.gte.${today},date.lte.${until}),and(original_date.gte.${today},original_date.lte.${until})`),
  ]);
  for (const result of [studentsRes, classesRes, eventsRes]) if (result.error) throw result.error;
  const studentIds = (studentsRes.data || []).map((row) => row.id);
  const classIds = (classesRes.data || []).map((row) => row.id);
  const [studentSchedules, classSchedules] = await Promise.all([
    studentIds.length ? supabase.from("student_schedules").select("id, weekday, start_time, end_time, duration_minutes").in("student_id", studentIds) : { data: [], error: null },
    classIds.length ? supabase.from("class_schedules").select("id, weekday, start_time, end_time, duration").in("class_id", classIds) : { data: [], error: null },
  ]);
  if (studentSchedules.error) throw studentSchedules.error;
  if (classSchedules.error) throw classSchedules.error;
  const days = buildCapacityDays(snapshot, studentSchedules.data || [], classSchedules.data || [], eventsRes.data || [], today);
  const totalValidSlots = days.reduce((sum, day) => sum + day.validSlots, 0);
  const totalOccupiedSlots = days.reduce((sum, day) => sum + day.occupiedSlots, 0);
  // Keep weekly working-hour metrics independent from temporary date exceptions.
  const availableWeeklyMinutes = snapshot.days.filter((day) => day.enabled).reduce((sum, day) =>
    sum + getWorkingSegments(day.startTime, day.endTime, snapshot.restBlocks.filter((b) => b.day.toLowerCase() === day.day.toLowerCase()))
      .reduce((minutes, segment) => minutes + segment.end - segment.start, 0), 0);
  return {
    hasWorkingHours: true, totalValidSlots, totalOccupiedSlots,
    totalRemainingSlots: days.reduce((sum, day) => sum + day.availableSlots.length, 0),
    occupancyPct: totalValidSlots ? Math.round(totalOccupiedSlots / totalValidSlots * 100) : 0,
    availableWeeklyMinutes, slotDurationMinutes: snapshot.defaultDuration, days,
  };
}

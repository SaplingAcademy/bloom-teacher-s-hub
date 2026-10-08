/**
 * Student recurring schedule (student_schedules) — canonical source of the
 * weekly agenda. Each row is one lesson slot identified by its own id; several
 * slots may share the same weekday. calendar_events only holds derived copies.
 */
import { supabase } from "@/lib/supabase";

export type DeliveryMode = "Online" | "In person";

export interface StudentScheduleRow {
  id: string;
  student_id: string;
  weekday: string;
  start_time: string | null;
  end_time: string | null;
  meeting_url: string | null;
  delivery_mode: string | null;
  duration_minutes: number | null;
  created_at?: string;
}

export interface ScheduleFormInput {
  id?: string;
  weekday: string;
  startTime: string;
  duration: number;
  deliveryMode: DeliveryMode;
  locationLink: string;
}

export type MeetingUrlResult = { ok: true; value: string | null } | { ok: false; value: null };

/** Empty → null; http(s) kept; bare host normalized to https://; anything else invalid. */
export function normalizeMeetingUrl(raw: string | null | undefined): MeetingUrlResult {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (/\s/.test(trimmed)) return { ok: false, value: null };
  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasProtocol && !/^https?:\/\//i.test(trimmed)) return { ok: false, value: null };
  const candidate = hasProtocol ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, value: null };
    // Require a dotted host (or localhost) so free text like "sala 3" is rejected.
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return { ok: false, value: null };
    return { ok: true, value: candidate };
  } catch {
    return { ok: false, value: null };
  }
}

function toHHMMSS(time: string): string {
  const [h = "09", m = "00", s = "00"] = (time || "09:00").split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${s.padStart(2, "0")}`;
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}:00`;
}

/** Duration of a stored slot: explicit column, else derived from start/end, else null (legacy unknown). */
export function rowDurationMinutes(row: Pick<StudentScheduleRow, "duration_minutes" | "start_time" | "end_time">): number | null {
  if (row.duration_minutes && row.duration_minutes > 0) return row.duration_minutes;
  if (row.start_time && row.end_time) {
    const [sh, sm] = row.start_time.split(":").map(Number);
    const [eh, em] = row.end_time.split(":").map(Number);
    const diff = eh * 60 + em - (sh * 60 + sm);
    if (diff > 0) return diff;
  }
  return null;
}

/** Map a DB row to the form shape. Legacy NULLs only get UI display defaults, never written back unless the teacher saves. */
export function rowToFormInput(row: StudentScheduleRow): ScheduleFormInput & { endTime: string } {
  return {
    id: row.id,
    weekday: row.weekday,
    startTime: (row.start_time || "").slice(0, 5),
    endTime: (row.end_time || "").slice(0, 5),
    duration: rowDurationMinutes(row) ?? 60,
    deliveryMode: row.delivery_mode === "In person" ? "In person" : "Online",
    locationLink: row.meeting_url || "",
  };
}

export interface ScheduleRowPayload {
  weekday: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  delivery_mode: DeliveryMode;
  meeting_url: string | null;
}

export class InvalidMeetingUrlError extends Error {
  constructor(public readonly index: number) {
    super(`Invalid meeting URL for lesson ${index + 1}`);
    this.name = "InvalidMeetingUrlError";
  }
}

/** Validate form inputs; throws InvalidMeetingUrlError with the offending lesson index. */
export function formInputToPayload(input: ScheduleFormInput, index: number): ScheduleRowPayload {
  const url = normalizeMeetingUrl(input.locationLink);
  if (!url.ok) throw new InvalidMeetingUrlError(index);
  const start = toHHMMSS(input.startTime);
  const duration = Number(input.duration) > 0 ? Number(input.duration) : 60;
  return {
    weekday: input.weekday,
    start_time: start,
    end_time: addMinutes(start, duration),
    duration_minutes: duration,
    delivery_mode: input.deliveryMode === "In person" ? "In person" : "Online",
    meeting_url: url.value,
  };
}

/** Returns the index of the first invalid meeting URL, or -1. */
export function findInvalidMeetingUrl(inputs: ScheduleFormInput[]): number {
  return inputs.findIndex((s) => !normalizeMeetingUrl(s.locationLink).ok);
}

export interface ScheduleDiff {
  toUpdate: Array<{ id: string; payload: ScheduleRowPayload }>;
  toInsert: ScheduleRowPayload[];
  toDeleteIds: string[];
}

/** Diff strictly by id — never by (student_id, weekday). */
export function planScheduleDiff(existingIds: string[], inputs: ScheduleFormInput[]): ScheduleDiff {
  const existing = new Set(existingIds);
  const kept = new Set<string>();
  const diff: ScheduleDiff = { toUpdate: [], toInsert: [], toDeleteIds: [] };
  inputs.forEach((input, idx) => {
    const payload = formInputToPayload(input, idx);
    if (input.id && existing.has(input.id) && !kept.has(input.id)) {
      kept.add(input.id);
      diff.toUpdate.push({ id: input.id, payload });
    } else {
      diff.toInsert.push(payload);
    }
  });
  diff.toDeleteIds = existingIds.filter((id) => !kept.has(id));
  return diff;
}

/**
 * Persist a student's schedule list: UPDATE by id, INSERT new, DELETE removed.
 * Returns the resulting rows (in form order) and the deleted ids.
 */
export async function persistStudentSchedules(
  studentId: string,
  inputs: ScheduleFormInput[],
): Promise<{ rows: StudentScheduleRow[]; deletedIds: string[] }> {
  const { data: current, error: fetchErr } = await supabase
    .from("student_schedules")
    .select("id")
    .eq("student_id", studentId);
  if (fetchErr) throw fetchErr;

  const diff = planScheduleDiff((current || []).map((r: any) => r.id as string), inputs);
  const rows: StudentScheduleRow[] = [];

  for (const { id, payload } of diff.toUpdate) {
    const { data, error } = await supabase
      .from("student_schedules")
      .update(payload)
      .eq("id", id)
      .eq("student_id", studentId)
      .select()
      .single();
    if (error) throw error;
    rows.push(data as StudentScheduleRow);
  }

  if (diff.toInsert.length > 0) {
    const { data, error } = await supabase
      .from("student_schedules")
      .insert(diff.toInsert.map((p) => ({ ...p, student_id: studentId })))
      .select();
    if (error) throw error;
    rows.push(...((data || []) as StudentScheduleRow[]));
  }

  if (diff.toDeleteIds.length > 0) {
    const { error } = await supabase
      .from("student_schedules")
      .delete()
      .in("id", diff.toDeleteIds)
      .eq("student_id", studentId);
    if (error) throw error;
  }

  return { rows, deletedIds: diff.toDeleteIds };
}

/** Insert brand-new schedules (e.g. lead conversion). */
export async function insertStudentSchedules(studentId: string, inputs: ScheduleFormInput[]): Promise<StudentScheduleRow[]> {
  if (inputs.length === 0) return [];
  const payload = inputs.map((s, idx) => ({ ...formInputToPayload(s, idx), student_id: studentId }));
  const { data, error } = await supabase.from("student_schedules").insert(payload).select();
  if (error) throw error;
  return (data || []) as StudentScheduleRow[];
}

export interface FutureEventLite {
  id: string;
  date: string;
  status: string | null;
  schedule_id: string | null;
  is_recurring?: boolean | null;
}

export interface DesiredOccurrence {
  scheduleId: string | null;
  date: string;
}

export interface EventReconcilePlan {
  updateIds: Array<{ id: string; scheduleId: string | null }>;
  deleteIds: string[];
  insert: DesiredOccurrence[];
}

const LOCKED_STATUSES = new Set(["Completed", "Closed"]);

/**
 * Reconcile future events against desired occurrences per schedule_id.
 * - Completed/Closed events are never touched.
 * - Existing open event for (schedule_id, date) → update in place (keeps id & lesson-plan links).
 * - Open recurring events with no match (removed schedule, moved weekday, legacy null schedule) → delete.
 * - Non-recurring manual events without schedule_id are left alone.
 */
export function planEventReconcile(existing: FutureEventLite[], desired: DesiredOccurrence[]): EventReconcilePlan {
  const plan: EventReconcilePlan = { updateIds: [], deleteIds: [], insert: [] };
  const desiredKeys = new Set(desired.map((d) => `${d.scheduleId}|${d.date}`));
  const covered = new Set<string>();

  for (const evt of existing) {
    const key = `${evt.schedule_id}|${evt.date}`;
    if (LOCKED_STATUSES.has(evt.status || "")) {
      covered.add(key);
      continue;
    }
    if (!evt.schedule_id && evt.is_recurring === false) continue;
    if (evt.schedule_id && desiredKeys.has(key) && !covered.has(key)) {
      covered.add(key);
      plan.updateIds.push({ id: evt.id, scheduleId: evt.schedule_id });
    } else {
      plan.deleteIds.push(evt.id);
    }
  }

  for (const d of desired) {
    const key = `${d.scheduleId}|${d.date}`;
    if (!covered.has(key)) {
      covered.add(key);
      plan.insert.push(d);
    }
  }
  return plan;
}

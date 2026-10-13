import { supabase } from "@/lib/supabase";
import { calculateEndTime, formatTimeHHMMSS } from "@/lib/calendar-sync";
import { fetchTeacherTimeOff, checkDateIsNonWorking } from "@/lib/time-off-engine";

/* =============================================================================
   Single-occurrence reschedule.
   Moves ONE calendar_events row (same id) and its linked lesson_plans row.
   Recurring student_schedules / class_schedules are never touched; the
   reschedule-aware sync treats rescheduled_at IS NOT NULL as satisfied.
   ========================================================================== */

export type RescheduleResult =
  | { ok: true; eventId: string; lessonPlanUpdated: boolean }
  | {
      ok: false;
      reason: "not_found" | "invalid_input" | "locked" | "non_working_day" | "conflict" | "save_failed";
      conflictEventIds?: string[];
      message?: string;
    };

const LOCKED = new Set(["Completed", "Closed", "Cancelled"]);

const toMinutes = (t: string) => {
  const [h, m] = String(t || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Half-open interval overlap [aStart, aEnd) vs [bStart, bEnd). */
export function intervalsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const a1 = toMinutes(aStart), a2 = toMinutes(aEnd), b1 = toMinutes(bStart), b2 = toMinutes(bEnd);
  return a1 < b2 && b1 < a2;
}

/** First reschedule stores the original slot; later ones keep it. */
export function buildRescheduleUpdate(
  event: { date: string; start_time: string; end_time?: string | null; duration?: number | null; original_date?: string | null; original_start_time?: string | null; rescheduled_at?: string | null },
  newDate: string,
  newStartTime: string,
  nowIso: string
) {
  const start = formatTimeHHMMSS(newStartTime);
  const span = event.end_time ? toMinutes(event.end_time) - toMinutes(event.start_time) : 0;
  const duration = Number(event.duration) || (span > 0 ? span : 60);
  const end = calculateEndTime(start, duration);
  const firstTime = !event.rescheduled_at && !event.original_date;
  return {
    date: newDate,
    start_time: start,
    end_time: end,
    rescheduled_at: nowIso,
    original_date: firstTime ? event.date : event.original_date ?? event.date,
    original_start_time: firstTime ? formatTimeHHMMSS(event.start_time) : event.original_start_time ?? formatTimeHHMMSS(event.start_time),
  };
}

export async function rescheduleOccurrence(eventId: string, newDate: string, newStartTime: string): Promise<RescheduleResult> {
  if (!eventId || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || !/^\d{1,2}:\d{2}/.test(newStartTime || "")) {
    return { ok: false, reason: "invalid_input" };
  }

  const { data: auth } = await supabase.auth.getUser();
  const teacherId = auth?.user?.id;
  if (!teacherId) return { ok: false, reason: "not_found" };

  const { data: event, error: loadErr } = await supabase
    .from("calendar_events")
    .select("*")
    .eq("id", eventId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (loadErr || !event) return { ok: false, reason: "not_found" };
  if (LOCKED.has(event.status || "")) return { ok: false, reason: "locked" };

  // Existing time-off / day-off rule (same one used by the generators).
  const timeOff = await fetchTeacherTimeOff(teacherId);
  if (checkDateIsNonWorking(newDate, timeOff)) return { ok: false, reason: "non_working_day" };

  const update = buildRescheduleUpdate(event, newDate, newStartTime, new Date().toISOString());

  // Overlap conflict check against the teacher's other occurrences that day.
  const { data: sameDay, error: dayErr } = await supabase
    .from("calendar_events")
    .select("id, start_time, end_time, status")
    .eq("teacher_id", teacherId)
    .eq("date", newDate)
    .neq("id", eventId);
  if (dayErr) return { ok: false, reason: "save_failed", message: dayErr.message };
  const conflicts = (sameDay || []).filter(
    (e: any) => e.status !== "Cancelled" && intervalsOverlap(update.start_time, update.end_time, e.start_time, e.end_time)
  );
  if (conflicts.length > 0) {
    return { ok: false, reason: "conflict", conflictEventIds: conflicts.map((c: any) => c.id) };
  }

  const { data: plan } = await supabase
    .from("lesson_plans")
    .select("id")
    .eq("event_id", eventId)
    .maybeSingle();

  // Single atomic RPC: moves the occurrence (same id), preserves the original
  // slot, stamps rescheduled_at and moves the linked lesson plan — all or nothing.
  const { error: rpcErr } = await supabase.rpc("reschedule_calendar_occurrence", {
    p_event_id: eventId,
    p_new_date: update.date,
    p_new_start_time: update.start_time,
    p_new_end_time: update.end_time,
  });
  if (rpcErr) {
    const msg = String(rpcErr.message || "");
    if (/completed|closed|cancel|locked/i.test(msg)) return { ok: false, reason: "locked", message: msg };
    if (/not found|not belong|permission|denied/i.test(msg)) return { ok: false, reason: "not_found", message: msg };
    return { ok: false, reason: "save_failed", message: msg };
  }

  return { ok: true, eventId, lessonPlanUpdated: Boolean(plan) };
}

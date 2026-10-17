import { supabase } from "@/lib/supabase";

export type HomeworkStatus = "unrecorded" | "pending" | "posted";
export type HomeworkStatuses = Record<string, boolean | null>;
export const HOMEWORK_STATUS_CHANGED = "bloom:homework-status-changed";

export function homeworkStatusValue(posted?: boolean | null): HomeworkStatus {
  return posted === true ? "posted" : posted === false ? "pending" : "unrecorded";
}

export function homeworkPostedValue(status: HomeworkStatus): boolean | null {
  return status === "posted" ? true : status === "pending" ? false : null;
}

export async function fetchHomeworkStatuses(teacherId: string, eventIds: string[]): Promise<HomeworkStatuses> {
  if (!teacherId || eventIds.length === 0) return {};
  const { data, error } = await supabase.from("lesson_plans")
    .select("event_id, homework_posted")
    .eq("teacher_id", teacherId)
    .in("event_id", eventIds);
  if (error) throw error;
  return Object.fromEntries((data || []).map((plan) => [plan.event_id, plan.homework_posted ?? null]));
}

/** Patch only the existing plan's status; never resave schedules, attendance or description. */
export async function saveHomeworkStatus(teacherId: string, eventId: string, status: HomeworkStatus): Promise<boolean | null> {
  if (!teacherId || !eventId) throw new Error("Missing homework occurrence");
  const { data, error } = await supabase.from("lesson_plans")
    .update({ homework_posted: homeworkPostedValue(status) })
    .eq("teacher_id", teacherId)
    .eq("event_id", eventId)
    .select("event_id, homework_posted")
    .single();
  if (error) throw error;
  if (!data) throw new Error("Missing linked lesson plan");
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(HOMEWORK_STATUS_CHANGED, { detail: { teacherId, eventId } }));
  }
  return data.homework_posted ?? null;
}
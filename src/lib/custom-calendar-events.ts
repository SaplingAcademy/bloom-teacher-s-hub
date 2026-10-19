import { supabase } from "@/lib/supabase";
export const CUSTOM_EVENT_CATEGORIES = ["appointment", "meeting", "personal", "blocked", "other"] as const;
export interface CustomEventInput { title: string; category: string; date: string; startTime: string; endTime: string; locationLink: string; notes: string; }
export class CustomEventValidationError extends Error {}
export function customEventInterval(date: string, startTime: string, endTime: string) {
  const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || !validTime.test(startTime) || !validTime.test(endTime)) throw new CustomEventValidationError("invalidInterval");
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const duration = minutes(endTime) - minutes(startTime);
  if (duration <= 0) throw new CustomEventValidationError("invalidInterval");
  return { date, start_time: startTime, end_time: endTime, duration };
}
export function customEventPayload(input: CustomEventInput) {
  if (!input.title.trim()) throw new CustomEventValidationError("requiredTitle");
  if (!CUSTOM_EVENT_CATEGORIES.some((category) => category === input.category)) throw new CustomEventValidationError("invalidCategory");
  return { ...customEventInterval(input.date, input.startTime, input.endTime), title: input.title.trim(), category: input.category, location_link: input.locationLink.trim() || null, notes: input.notes.trim() || null };
}
// Owner/type-scoped writes never enter lesson-plan or academic rescheduling paths.
export async function saveCustomEvent(teacherId: string, input: CustomEventInput, eventId?: string) {
  if (!teacherId) throw new Error("unauthenticated");
  const payload = customEventPayload(input);
  const query = eventId
    ? supabase.from("calendar_events").update(payload).eq("teacher_id", teacherId).eq("event_type", "custom").eq("id", eventId)
    : supabase.from("calendar_events").insert({ ...payload, teacher_id: teacherId, event_type: "custom", status: "Scheduled", student_id: null, class_id: null, schedule_id: null, class_schedule_id: null, is_recurring: false, recurrence_series_id: null });
  const { data, error } = await query.select("id").single();
  if (error) throw error;
  return data.id as string;
}
export async function moveCustomEvent(teacherId: string, eventId: string, date: string, startTime: string, duration: number) {
  if (!teacherId) throw new Error("unauthenticated");
  if (!Number.isInteger(duration) || duration <= 0) throw new CustomEventValidationError("invalidInterval");
  const end = Number(startTime.slice(0, 2)) * 60 + Number(startTime.slice(3, 5)) + duration;
  if (end >= 1440) throw new CustomEventValidationError("invalidInterval");
  const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  const { error } = await supabase.from("calendar_events").update(customEventInterval(date, startTime, endTime)).eq("teacher_id", teacherId).eq("event_type", "custom").eq("id", eventId).select("id").single();
  if (error) throw error;
}
export async function deleteCustomEvent(teacherId: string, eventId: string) {
  if (!teacherId) throw new Error("unauthenticated");
  const { error } = await supabase.from("calendar_events").delete().eq("teacher_id", teacherId).eq("event_type", "custom").eq("id", eventId).select("id").single();
  if (error) throw error;
}
export function customEventErrorKey(error: unknown): string {
  if (error instanceof CustomEventValidationError) return error.message;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["42703", "PGRST204", "23514"].includes(code)) return "schemaRequired";
  return "saveError";
}

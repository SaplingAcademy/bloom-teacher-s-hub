import { supabase } from "@/lib/supabase";
import { t, type Language } from "@/lib/i18n";
import type { ClassMember } from "@/types/classes";

export type ClassRemovalMode = "delete" | "archive";
export interface ClassRemovalReview {
  mode: ClassRemovalMode;
  activeMembers: ClassMember[];
}

export function teacherCalendarDate(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find((p) => p.type === name)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function requireClass(teacherId: string, classId: string) {
  if (!teacherId || !classId) throw new Error("Missing class owner");
  const { data, error } = await supabase.from("classes").select("id, status")
    .eq("teacher_id", teacherId).eq("id", classId).single();
  if (error) throw error;
  if (!data) throw new Error("Class not found");
  return data;
}

/** Read failures always prevent permanent deletion. All history checks use exact counts. */
export async function reviewClassRemoval(teacherId: string, classId: string, today: string): Promise<ClassRemovalReview> {
  const cls = await requireClass(teacherId, classId);
  const { data: members, error } = await supabase.from("class_members")
    .select("*, students(full_name)").eq("teacher_id", teacherId).eq("class_id", classId);
  if (error) throw error;
  const historyReads = await Promise.all([
    supabase.from("calendar_events").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("class_id", classId)
      .or(`date.lte.${today},status.neq.Scheduled`),
    supabase.from("lesson_plans").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("class_id", classId),
    supabase.from("lesson_plan_documents").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("class_id", classId),
    supabase.from("attendance_records").select("id, calendar_events!inner(class_id)", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("calendar_events.class_id", classId),
    supabase.from("class_sessions").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("class_id", classId),
    supabase.from("invoices").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("class_id", classId),
    supabase.from("class_members").select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId).eq("class_id", classId).or("status.neq.active,left_at.not.is.null"),
  ]);
  for (const result of historyReads) {
    if (result.error) throw result.error;
    if (result.count === null) throw new Error("History could not be verified");
  }
  return {
    mode: cls.status === "archived" || historyReads.some((r) => (r.count || 0) > 0) ? "archive" : "delete",
    activeMembers: (members || []).filter((m) => m.status === "active" && !m.left_at)
      .map((m) => ({ ...m, student_name: m.students?.full_name || "" } as ClassMember)),
  };
}

/** Idempotent archival: no historical deletes, no changes to student or financial records. */
export async function removeClassSafely(
  teacherId: string, classId: string, today: string, confirmedMode: ClassRemovalMode, lang: Language,
): Promise<ClassRemovalReview> {
  // Re-read immediately before any mutation; never silently turn archive consent into hard deletion.
  const review = await reviewClassRemoval(teacherId, classId, today);
  if (review.mode !== confirmedMode) throw new Error(t("classRemoval.changed", lang));
  if (review.mode === "delete") {
    // Explicitly remove only verified-unused future scheduled events, avoiding polymorphic SET NULL FKs.
    const events = await supabase.from("calendar_events").delete().eq("teacher_id", teacherId)
      .eq("class_id", classId).gt("date", today).eq("status", "Scheduled");
    if (events.error) throw events.error;
    const recheck = await reviewClassRemoval(teacherId, classId, today);
    if (recheck.mode !== "delete") throw new Error(t("classRemoval.changed", lang));
    const result = await supabase.from("classes").delete().eq("teacher_id", teacherId)
      .eq("id", classId).select("id").single();
    if (result.error) throw result.error;
    if (!result.data) throw new Error(t("classRemoval.saveError", lang));
    return review;
  }
  // Archive first to stop recurrence/billing consumers. If a later write fails, report failure and allow retry.
  const archived = await supabase.from("classes").update({ status: "archived" })
    .eq("teacher_id", teacherId).eq("id", classId).select("id").single();
  if (archived.error) throw archived.error;
  if (!archived.data) throw new Error(t("classRemoval.saveError", lang));
  const ended = await supabase.from("class_members").update({ status: "removed", left_at: today })
    .eq("teacher_id", teacherId).eq("class_id", classId).eq("status", "active").is("left_at", null);
  if (ended.error) throw ended.error;
  // Cancelled is the existing non-blocking occurrence state; Closed still participates in conflict checks.
  const closed = await supabase.from("calendar_events").update({ status: "Cancelled" })
    .eq("teacher_id", teacherId).eq("class_id", classId).gt("date", today).eq("status", "Scheduled");
  if (closed.error) throw closed.error;
  // Retain schedule rows/IDs: archived status disables recurrence in every scheduling consumer.
  return review;
}

export interface StudentClassParticipation {
  id: string; class_id: string; joined_at: string; left_at: string | null;
  class_name: string; class_start_date: string; class_status: string;
}

export interface ParticipationEvent {
  id: string; class_id: string; date: string; start_time: string; status: string;
  attendance_status: string | null;
}
export interface ParticipationInvoice {
  id: string; class_id: string; due_date: string; status: string; amount_cents: number;
  payments: Array<{ id: string; received_at: string; amount_cents: number }>;
}

/** Historical class charges remain class-level amounts, never apportioned to a student. */
export async function fetchParticipationHistory(teacherId: string, studentId: string, memberships: StudentClassParticipation[]) {
  const classIds = memberships.map((m) => m.class_id);
  if (!classIds.length) return { events: [] as ParticipationEvent[], invoices: [] as ParticipationInvoice[] };
  const [events, invoices] = await Promise.all([
    supabase.from("calendar_events").select("id, class_id, date, start_time, status, attendance_records(student_id, status)")
      .eq("teacher_id", teacherId).in("class_id", classIds).order("date", { ascending: false }),
    supabase.from("invoices").select("id, class_id, due_date, status, amount_cents, payments(id, received_at, amount_cents)")
      .eq("teacher_id", teacherId).in("class_id", classIds).order("due_date", { ascending: false }),
  ]);
  if (events.error) throw events.error;
  if (invoices.error) throw invoices.error;
  const participated = (classId: string, date: string) => memberships.some((m) =>
    m.class_id === classId && (!m.joined_at || date >= m.joined_at) && (!m.left_at || date <= m.left_at));
  return {
    events: (events.data || []).filter((e) => participated(e.class_id, e.date)).map((e: any) => ({
      id: e.id, class_id: e.class_id, date: e.date, start_time: e.start_time, status: e.status,
      attendance_status: (e.attendance_records || []).find((a: any) => a.student_id === studentId)?.status || null,
    })) as ParticipationEvent[],
    invoices: (invoices.data || []) as ParticipationInvoice[],
  };
}

export async function fetchStudentClassParticipation(teacherId: string, studentId: string): Promise<StudentClassParticipation[]> {
  const { data, error } = await supabase.from("class_members")
    .select("id, class_id, joined_at, left_at, classes(name, start_date, status)")
    .eq("teacher_id", teacherId).eq("student_id", studentId).order("joined_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    id: row.id, class_id: row.class_id, joined_at: row.joined_at, left_at: row.left_at,
    class_name: row.classes?.name || "", class_start_date: row.classes?.start_date || "",
    class_status: row.classes?.status || "",
  }));
}
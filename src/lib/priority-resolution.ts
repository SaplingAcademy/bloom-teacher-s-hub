import { supabase } from "@/lib/supabase";
import { fetchCalendarClassAttendance } from "@/lib/calendar-class-attendance";
import { fetchAttendanceForEvents, saveAttendanceRecords, type AttendanceStatus } from "@/lib/lesson-plans";
import { homeworkStatusValue, saveHomeworkStatus, type HomeworkStatus } from "@/lib/homework-status";
import type { DailyPriorityItem } from "@/lib/daily-priorities";
import { normalizeLeadStage, type Lead } from "@/lib/automation-engine";
import { formatCentsToBRL, type RealInvoice } from "@/lib/finance-engine";

/**
 * Today priorities resolution: thin adapters over the canonical attendance and
 * homework-status flows (the same ones Calendar and the Lesson Plans use). Nothing is
 * stored separately; a priority disappears only when its source condition is resolved
 * and the priorities are re-read.
 */

export interface AttendanceRosterEntry {
  studentId: string;
  name: string;
  status: AttendanceStatus | null;
  notes: string;
}

export interface AttendanceRoster {
  eventId: string;
  classId: string | null;
  entries: AttendanceRosterEntry[];
}

/** Expected attendees with their current records (class: members active on that date). */
export async function loadAttendanceRoster(teacherId: string, item: DailyPriorityItem): Promise<AttendanceRoster> {
  const { eventId, classId, studentId } = item.ref;
  if (!teacherId || !eventId) throw new Error("Missing attendance scope");
  if (classId) {
    const current = await fetchCalendarClassAttendance(teacherId, classId, eventId);
    const byStudent = new Map(current.records.map((r) => [r.student_id, r]));
    return {
      eventId,
      classId,
      entries: current.members.map((m) => ({
        studentId: m.student_id,
        name: m.student_name,
        status: byStudent.get(m.student_id)?.status ?? null,
        notes: byStudent.get(m.student_id)?.notes || "",
      })),
    };
  }
  if (!studentId) throw new Error("Missing attendance scope");
  const records = (await fetchAttendanceForEvents([eventId], teacherId))[eventId] || [];
  const record = records.find((r) => r.student_id === studentId);
  return {
    eventId,
    classId: null,
    entries: [{ studentId, name: item.title, status: record?.status ?? null, notes: record?.notes || "" }],
  };
}

/**
 * Saves the chosen statuses through saveAttendanceRecords (upsert + attendance_recorded
 * sync). Class occurrences are re-validated like saveCalendarClassAttendance: not
 * cancelled, and only students expected on that date.
 */
export async function saveRosterAttendance(
  teacherId: string,
  roster: AttendanceRoster,
  statuses: Record<string, AttendanceStatus | null>,
): Promise<void> {
  let allowed = new Map(roster.entries.map((e) => [e.studentId, e]));
  if (roster.classId) {
    const current = await fetchCalendarClassAttendance(teacherId, roster.classId, roster.eventId);
    if (current.status === "Cancelled") throw new Error("Cancelled occurrence");
    const expected = new Set(current.members.map((m) => m.student_id));
    allowed = new Map([...allowed].filter(([id]) => expected.has(id)));
  }
  const rows = [...allowed.values()].flatMap((entry) => {
    const status = statuses[entry.studentId];
    return status ? [{ student_id: entry.studentId, status, notes: entry.notes }] : [];
  });
  if (rows.length === 0) throw new Error("No attendance selected");
  await saveAttendanceRecords(teacherId, roster.eventId, rows);
}

export interface LessonHomework {
  eventId: string;
  homework: string;
  status: HomeworkStatus;
}

/** Planned homework and its teacher-recorded status, read from the lesson plan row. */
export async function loadLessonHomework(teacherId: string, eventId: string): Promise<LessonHomework> {
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("event_id, homework, homework_posted")
    .eq("teacher_id", teacherId)
    .eq("event_id", eventId)
    .single();
  if (error) throw error;
  return { eventId, homework: data?.homework || "", status: homeworkStatusValue(data?.homework_posted) };
}

/**
 * Records that the teacher sent the homework to the student(s). Bloom itself does not
 * deliver homework; this is the same status the Lesson Plan's homework control saves.
 */
export async function markHomeworkSent(teacherId: string, eventId: string): Promise<void> {
  const saved = await saveHomeworkStatus(teacherId, eventId, "posted");
  if (saved !== true) throw new Error("Homework status not saved");
}

// ---------------------------------------------------------------------------
// Stage 2: read-only loaders for module flows reused on Today (lead, payment)
// ---------------------------------------------------------------------------

/** Reads one owned lead with its canonical stage, for the reused LeadDetailSheet. */
export async function loadPriorityLead(teacherId: string, leadId: string): Promise<Lead> {
  const { data, error } = await supabase.from("leads").select("*").eq("id", leadId).eq("teacher_id", teacherId).single();
  if (error) throw error;
  return { ...(data as Lead), stage: normalizeLeadStage((data as Lead).stage) };
}

/** Owner-scoped update of only the changed lead columns, read back (shared with the Leads page). */
export async function saveLeadProfile(teacherId: string, leadId: string, patch: Record<string, unknown>): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .eq("teacher_id", teacherId)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    console.error("Failed to save lead profile:", error);
    return null;
  }
  return { ...(data as Lead), stage: normalizeLeadStage((data as Lead).stage) };
}

/**
 * Read-only view of one charge in the shape PaymentConfirmationDialog displays.
 * It never generates, syncs or updates receivables (unlike the Finance sync read).
 */
export async function loadPriorityInvoice(teacherId: string, invoiceId: string): Promise<RealInvoice> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, student_id, amount_cents, due_date, status, paid_at, charge_kind, sequence_number, sequence_count, student:students(full_name), payments(method, received_at)")
    .eq("teacher_id", teacherId)
    .eq("id", invoiceId)
    .single();
  if (error) throw error;
  const row = data as any;
  const student = Array.isArray(row.student) ? row.student[0] : row.student;
  const payment = Array.isArray(row.payments) ? row.payments[0] : null;
  const installment = row.charge_kind === "installment" && row.sequence_number && row.sequence_count
    ? `Parcela ${row.sequence_number} de ${row.sequence_count}`
    : undefined;
  return {
    id: row.id,
    studentId: row.student_id,
    targetName: student?.full_name || "",
    amountCents: row.amount_cents,
    amountFormatted: formatCentsToBRL(row.amount_cents || 0),
    dueDate: row.due_date,
    status: row.status,
    paidAt: row.paid_at ?? null,
    paymentMethod: payment?.method ?? null,
    currentInstallmentLabel: installment,
  } as unknown as RealInvoice;
}

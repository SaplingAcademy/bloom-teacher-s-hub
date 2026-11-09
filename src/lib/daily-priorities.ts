import { supabase } from "@/lib/supabase";
import { formatLocalDateStr } from "@/lib/time-off-engine";
import { calculateLastDueDate } from "@/lib/finance-engine";
import { billingModelFromAgreement } from "@/lib/billing-domain";
import { renewalAlertStage, teacherSetContinuousEndDate } from "@/lib/package-renewal";
import { fetchInactiveLeadCandidates } from "@/lib/lead-inactivity-data";
import { inactivityReference } from "@/lib/lead-inactivity";

/**
 * Unified, categorized Today priorities data layer (Phase 1).
 * Read-only: every item is derived from canonical records; nothing is persisted.
 * Display text is produced later through t() using `reason` + `params`.
 */

export type DailyPriorityCategory = "attendance" | "payment" | "contract" | "task" | "lead";
export type DailyPriorityUrgency = "critical" | "today" | "upcoming" | "stale";

export type DailyPriorityReason =
  | "attendance_missing"
  | "payment_overdue"
  | "payment_due_today"
  | "payment_reminder"
  | "contract_ended"
  | "contract_ending_10d"
  | "contract_ending_30d"
  | "homework_not_posted"
  | "task_overdue"
  | "task_due_today"
  | "lead_task_overdue"
  | "lead_task_due_today"
  | "lead_trial_soon"
  | "lead_proposal_pending"
  | "lead_stale";

export interface DailyPriorityItem {
  id: string;
  category: DailyPriorityCategory;
  urgency: DailyPriorityUrgency;
  reason: DailyPriorityReason;
  /** Entity display name (student, lead or task title). */
  title: string;
  /** Raw values the UI interpolates into the localized description. */
  params: Record<string, string | number>;
  /** YYYY-MM-DD used to sort oldest overdue first. */
  date: string | null;
  time?: string | null;
  ref: {
    studentId?: string;
    leadId?: string;
    classId?: string;
    eventId?: string;
    invoiceId?: string;
    studentPackageId?: string;
    taskId?: string;
  };
  action: { route: string; params?: Record<string, string> };
}

export interface DailyPrioritiesResult {
  items: DailyPriorityItem[];
  /** Categories whose query failed; surfaced instead of silently empty. */
  failed: DailyPriorityCategory[];
}

export const PAYMENT_REMINDER_DAYS = 5;
export const ATTENDANCE_CRITICAL_DAYS = 5;
export const TRIAL_LOOKAHEAD_DAYS = 2;
const PROPOSAL_STAGES = ["Proposta enviada", "proposal"];
const RESOLVED_INVOICE_STATUSES = ["paid", "Paid", "Pago", "cancelled", "Cancelled"];

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Pure classifiers (unit-tested)
// ---------------------------------------------------------------------------

/** Pending attendance: normal ("today") until more than 5 calendar days late, then critical. */
export function attendanceUrgency(lessonDate: string, todayStr: string): DailyPriorityUrgency {
  return daysBetween(lessonDate, todayStr) > ATTENDANCE_CRITICAL_DAYS ? "critical" : "today";
}

/** Returns null when an invoice is not actionable for Today. */
export function paymentReason(dueDate: string, todayStr: string): DailyPriorityReason | null {
  const diff = daysBetween(todayStr, dueDate);
  if (diff < 0) return "payment_overdue";
  if (diff === 0) return "payment_due_today";
  if (diff <= PAYMENT_REMINDER_DAYS) return "payment_reminder";
  return null;
}

export function paymentUrgency(reason: DailyPriorityReason): DailyPriorityUrgency {
  return reason === "payment_overdue" ? "critical" : reason === "payment_due_today" ? "today" : "upcoming";
}

/** Shared renewal windows (package-renewal.ts): ended, ≤10 days, ≤30 days. */
export function contractReason(daysRemaining: number): DailyPriorityReason | null {
  const stage = renewalAlertStage(daysRemaining);
  if (stage === "expired") return "contract_ended";
  if (stage === "urgent") return "contract_ending_10d";
  if (stage === "priority") return "contract_ending_30d";
  return null;
}

/** Homework is actionable only when something was assigned and it is explicitly not posted. */
export function homeworkRequiresAction(plan: { homework?: string | null; homework_posted?: boolean | null }): boolean {
  return plan.homework_posted === false && Boolean((plan.homework || "").trim());
}

/** Lead-level alerts are suppressed when a pending task already represents the lead. */
export function suppressCoveredLeadItems(items: DailyPriorityItem[], leadsWithPendingTask: Set<string>): DailyPriorityItem[] {
  return items.filter((item) => {
    if (item.category !== "lead" || item.ref.taskId || !item.ref.leadId) return true;
    if (item.reason === "lead_trial_soon") return true;
    return !leadsWithPendingTask.has(item.ref.leadId);
  });
}

const URGENCY_ORDER: Record<DailyPriorityUrgency, number> = { critical: 0, today: 1, upcoming: 2, stale: 3 };

/** Urgency first, then oldest date first. */
export function sortDailyPriorities(items: DailyPriorityItem[]): DailyPriorityItem[] {
  return [...items].sort((a, b) =>
    URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
    (a.date || "9999").localeCompare(b.date || "9999") ||
    (a.time || "").localeCompare(b.time || "")
  );
}

// ---------------------------------------------------------------------------
// Category fetchers
// ---------------------------------------------------------------------------

async function fetchAttendance(teacherId: string, todayStr: string, nowHHMM: string): Promise<DailyPriorityItem[]> {
  // calendar_events.attendance_recorded is the canonical completion flag (maintained on every
  // attendance save/clear and backfilled historically). One filtered query, no age cutoff.
  const { data, error } = await supabase
    .from("calendar_events")
    .select("id, student_id, class_id, student_name, date, start_time, end_time, event_type, lesson_plans!inner(event_id), classes(name)")
    .eq("teacher_id", teacherId)
    .eq("attendance_recorded", false)
    .in("event_type", ["individual", "class"])
    .lte("date", todayStr)
    .not("status", "in", "(Cancelled,cancelled,Closed,closed)")
    .order("date", { ascending: true });
  if (error) throw error;
  return buildAttendanceItems((data || []) as any[], todayStr, nowHHMM);
}

/** Pure: past, attendance-workflow occurrences (individual with student / class with class) → items. */
export function buildAttendanceItems(rows: any[], todayStr: string, nowHHMM: string): DailyPriorityItem[] {
  const isPast = (e: any) => e.date < todayStr || (e.end_time || e.start_time || "23:59").slice(0, 5) <= nowHHMM;
  const items: DailyPriorityItem[] = [];
  for (const e of rows) {
    const isIndividual = e.event_type === "individual" && !!e.student_id;
    const isClass = e.event_type === "class" && !!e.class_id;
    if ((!isIndividual && !isClass) || !isPast(e)) continue;
    items.push({
      id: `attendance:${e.id}`,
      category: "attendance",
      urgency: attendanceUrgency(e.date, todayStr),
      reason: "attendance_missing",
      title: isClass ? (e.classes?.name || "") : (e.student_name || ""),
      params: { date: e.date, time: (e.start_time || "").slice(0, 5), daysLate: Math.max(0, daysBetween(e.date, todayStr)) },
      date: e.date,
      time: e.start_time,
      ref: { studentId: isIndividual ? e.student_id : undefined, eventId: e.id, classId: e.class_id || undefined },
      action: isClass
        ? { route: "/students", params: { classId: e.class_id, eventId: e.id } }
        : { route: "/calendar", params: { eventId: e.id } },
    });
  }
  return items;
}

async function fetchPayments(teacherId: string, todayStr: string, reminderEndStr: string): Promise<DailyPriorityItem[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, student_id, amount_cents, due_date, status, students(full_name)")
    .eq("teacher_id", teacherId)
    .not("status", "in", `(${RESOLVED_INVOICE_STATUSES.join(",")})`)
    .lte("due_date", reminderEndStr)
    .order("due_date", { ascending: true });
  if (error) throw error;
  const items: DailyPriorityItem[] = [];
  for (const inv of (data || []) as any[]) {
    const reason = paymentReason(inv.due_date, todayStr);
    if (!reason) continue;
    items.push({
      id: `payment:${inv.id}`,
      category: "payment",
      urgency: paymentUrgency(reason),
      reason,
      title: inv.students?.full_name || "",
      params: { amountCents: inv.amount_cents || 0, dueDate: inv.due_date, daysLate: Math.max(0, daysBetween(inv.due_date, todayStr)) },
      date: inv.due_date,
      ref: { studentId: inv.student_id, invoiceId: inv.id },
      action: { route: "/finance", params: { invoiceId: inv.id, studentId: inv.student_id } },
    });
  }
  return items;
}

/** Same end-date semantics as checkPackageExpirationAlerts; null = open-ended/unknown. */
export function contractEndDate(sp: any): string | null {
  if (sp.ended_at) return String(sp.ended_at).slice(0, 10);
  if (billingModelFromAgreement(sp) === "monthly" && sp.billing_duration_type !== "fixed") return teacherSetContinuousEndDate(sp);
  if (sp.last_due_date) return sp.last_due_date;
  if (sp.first_due_date && sp.installment_count) return calculateLastDueDate(sp.first_due_date, sp.installment_count, sp.due_day);
  return null;
}

/** Strict variant: query errors throw so the category is reported as failed, never as empty. */
async function fetchContracts(teacherId: string, todayStr: string): Promise<DailyPriorityItem[]> {
  const { data, error } = await supabase
    .from("student_packages")
    .select("*, student:students(full_name, status), package:packages(name)")
    .eq("teacher_id", teacherId)
    .eq("status", "active");
  if (error) throw error;
  return buildContractItems((data || []) as any[], todayStr);
}

export function buildContractItems(rows: any[], todayStr: string): DailyPriorityItem[] {
  return rows.flatMap((sp): DailyPriorityItem[] => {
    if (sp.student?.status === "Paused" || sp.student?.status === "Inactive") return [];
    const endDate = contractEndDate(sp);
    if (!endDate) return [];
    const days = daysBetween(todayStr, endDate);
    // Prioridades holds the 30→11 day window; from 10 days (and after the end) the
    // contract moves to Urgente, so it never appears in both lists.
    if (renewalAlertStage(days) !== "priority") return [];
    const reason = contractReason(days);
    if (!reason) return [];
    return [{
      id: `contract:${sp.id}`,
      category: "contract",
      urgency: reason === "contract_ended" ? "critical" : "upcoming",
      reason,
      title: sp.student?.full_name || "",
      params: { endDate, daysRemaining: days, packageName: sp.snapshot_package_name || sp.package?.name || "" },
      date: endDate,
      ref: { studentId: sp.student_id, studentPackageId: sp.id },
      action: { route: "/finance", params: { studentId: sp.student_id, action: "renew" } },
    }];
  });
}

async function fetchHomework(teacherId: string, todayStr: string): Promise<DailyPriorityItem[]> {
  // Homework source is lesson_plans (1:1 with a calendar occurrence), never public.tasks.
  // Only occurrences whose attendance is recorded can prove the lesson took place.
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("event_id, student_id, class_id, lesson_number, scheduled_date, homework, homework_posted, students(full_name), classes(name), calendar_events!inner(date, status, attendance_recorded, attendance_records(status))")
    .eq("teacher_id", teacherId)
    .not("homework_posted", "is", true)
    .neq("homework", "")
    .not("homework", "is", null)
    .eq("calendar_events.attendance_recorded", true)
    .lte("calendar_events.date", todayStr);
  if (error) throw error;
  return buildHomeworkItems((data || []) as any[], todayStr);
}

/**
 * After a held lesson, planned homework is pending until it is marked published
 * (homework_posted = true). "Unrecorded" (null) counts as not published here, because
 * the held-lesson proof removes the ambiguity that homeworkRequiresAction guards against.
 */
export function homeworkPendingPublication(plan: { homework?: string | null; homework_posted?: boolean | null }): boolean {
  return plan.homework_posted !== true && Boolean((plan.homework || "").trim());
}

const CLOSED_OCCURRENCE_STATUSES = new Set(["cancelled", "closed"]);
const HELD_ATTENDANCE_STATUSES = new Set(["present", "late"]);

/**
 * A lesson counts as held only with a reliable record: attendance recorded for the
 * occurrence and at least one student present or late. Past dates alone, cancelled or
 * archived occurrences, and all-absent/excused lessons never qualify.
 */
export function lessonWasHeld(event: any): boolean {
  if (!event || event.attendance_recorded !== true) return false;
  if (CLOSED_OCCURRENCE_STATUSES.has(String(event.status || "").toLowerCase())) return false;
  return (event.attendance_records || []).some((r: any) => HELD_ATTENDANCE_STATUSES.has(r?.status));
}

/**
 * Pure: unpublished homework from held lessons of a lesson plan. The occurrence date is
 * canonical (rescheduling moves it), and one item per occurrence avoids duplicates.
 */
export function buildHomeworkItems(rows: any[], todayStr: string): DailyPriorityItem[] {
  const seen = new Set<string>();
  const items: DailyPriorityItem[] = [];
  for (const p of rows) {
    const event = Array.isArray(p.calendar_events) ? p.calendar_events[0] : p.calendar_events;
    if (!p.event_id || seen.has(p.event_id) || !homeworkPendingPublication(p) || !lessonWasHeld(event)) continue;
    const date = String(event.date || p.scheduled_date || "").slice(0, 10);
    if (!date || date > todayStr) continue;
    seen.add(p.event_id);
    items.push({
      id: `homework:${p.event_id}`,
      category: "task",
      urgency: date < todayStr ? "critical" : "today",
      reason: "homework_not_posted",
      title: p.class_id ? (p.classes?.name || "") : (p.students?.full_name || ""),
      params: { date, lesson: p.lesson_number ?? "—" },
      date,
      ref: { studentId: p.student_id || undefined, classId: p.class_id || undefined, eventId: p.event_id },
      action: p.class_id
        ? { route: "/students", params: { classId: p.class_id, eventId: p.event_id } }
        : { route: "/students", params: { studentId: p.student_id, tab: "Lessons" } },
    });
  }
  return items;
}

async function fetchPendingTasks(teacherId: string, todayStr: string, tomorrowStartIso: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date, lead_id")
    .eq("teacher_id", teacherId)
    .eq("status", "pending");
  if (error) throw error;
  return buildPendingTaskItems((data || []) as any[], todayStr, tomorrowStartIso);
}

/**
 * Rows in public.tasks are commercial activities (follow-ups, trial confirmation and
 * feedback, re-contact), linked to their lead by tasks.lead_id. They are classified by
 * that relationship as Leads — never as "Tarefas", which is reserved for student
 * homework (lesson_plans). Rows without a lead have no identifiable origin category and
 * are not shown as homework.
 */
export function buildPendingTaskItems(rows: any[], todayStr: string, tomorrowStartIso: string): DailyPriorityItem[] {
  const items: DailyPriorityItem[] = [];
  for (const t of rows) {
    if (!t.due_date || !t.lead_id) continue;
    const dueDate = new Date(t.due_date);
    if (!Number.isFinite(dueDate.getTime()) || dueDate.getTime() >= new Date(tomorrowStartIso).getTime()) continue;
    const day = formatLocalDateStr(dueDate);
    const overdue = day < todayStr;
    items.push({
      id: `task:${t.id}`,
      category: "lead",
      urgency: overdue ? "critical" : "today",
      reason: overdue ? "lead_task_overdue" : "lead_task_due_today",
      title: t.title || "",
      params: { dueDate: day },
      date: day,
      ref: { taskId: t.id, leadId: t.lead_id },
      action: { route: "/leads", params: { leadId: t.lead_id } },
    });
  }
  return items;
}

async function fetchLeads(teacherId: string, todayStr: string, now: Date): Promise<DailyPriorityItem[]> {
  // No trial alert without a confirmed persisted lead/occurrence relationship.
  // Names and free-text notes cannot establish that association.
  const [proposals, stale] = await Promise.all([
    supabase.from("leads").select("id, full_name, updated_at").eq("teacher_id", teacherId).in("stage", PROPOSAL_STAGES),
    fetchInactiveLeadCandidates(teacherId, now),
  ]);
  if (proposals.error) throw proposals.error;

  const items: DailyPriorityItem[] = [];
  const proposalIds = new Set<string>();
  for (const l of (proposals.data || []) as any[]) {
    proposalIds.add(l.id);
    const since = formatLocalDateStr(new Date(l.updated_at));
    items.push({
      id: `lead-proposal:${l.id}`,
      category: "lead",
      urgency: "upcoming",
      reason: "lead_proposal_pending",
      title: l.full_name || "",
      params: { since },
      date: since,
      ref: { leadId: l.id },
      action: { route: "/leads", params: { leadId: l.id } },
    });
  }
  for (const l of stale.leads) {
    if (proposalIds.has(l.id)) continue; // one priority per lead condition
    const reference = inactivityReference(l);
    if (!reference) continue;
    const since = formatLocalDateStr(reference);
    items.push({
      id: `lead-stale:${l.id}`,
      category: "lead",
      urgency: "stale",
      reason: "lead_stale",
      title: l.full_name || "",
      params: { since, days: daysBetween(since, todayStr) },
      date: since,
      ref: { leadId: l.id },
      action: { route: "/leads", params: { leadId: l.id } },
    });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function fetchDailyPriorities(teacherId: string, now: Date = new Date()): Promise<DailyPrioritiesResult> {
  if (!teacherId) return { items: [], failed: [] };
  const todayStr = formatLocalDateStr(now);
  const nowHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const reminderEndStr = formatLocalDateStr(addDays(now, PAYMENT_REMINDER_DAYS));
  const tomorrowStartIso = addDays(now, 1).toISOString();

  const [attendance, payments, contracts, homework, tasks, leads] = await Promise.allSettled([
    fetchAttendance(teacherId, todayStr, nowHHMM),
    fetchPayments(teacherId, todayStr, reminderEndStr),
    fetchContracts(teacherId, todayStr),
    fetchHomework(teacherId, todayStr),
    fetchPendingTasks(teacherId, todayStr, tomorrowStartIso),
    fetchLeads(teacherId, todayStr, now),
  ]);

  const failed = new Set<DailyPriorityCategory>();
  const items: DailyPriorityItem[] = [];
  const take = (r: PromiseSettledResult<DailyPriorityItem[]>, cat: DailyPriorityCategory) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else { failed.add(cat); console.error(`[daily-priorities] ${cat} failed:`, r.reason); }
  };
  take(attendance, "attendance");
  take(payments, "payment");
  take(contracts, "contract");
  // Tarefas = student homework only; commercial tasks belong to Leads.
  take(homework, "task");
  take(tasks, "lead");
  take(leads, "lead");

  // One priority per lead: a pending commercial task represents its lead, so the
  // lead-level stale/proposal alert for the same lead is not shown twice.
  const leadsWithPendingTask = new Set(items.filter((i) => i.ref.taskId && i.ref.leadId).map((i) => i.ref.leadId!));
  return { items: sortDailyPriorities(suppressCoveredLeadItems(items, leadsWithPendingTask)), failed: [...failed] };
}

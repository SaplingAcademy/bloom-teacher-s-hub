import { supabase } from "@/lib/supabase";
import { formatLocalDateStr } from "@/lib/time-off-engine";
import { calculateLastDueDate } from "@/lib/finance-engine";
import { billingModelFromAgreement } from "@/lib/billing-domain";

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
  | "contract_ending_15d"
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
export const LEAD_STALE_DAYS = 7;
export const TRIAL_LOOKAHEAD_DAYS = 2;
const CLOSED_LEAD_STAGES = ["Convertido", "won", "Perdido", "lost"];
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

/** Mirrors checkPackageExpirationAlerts thresholds: ended, ≤15 days, ≤30 days. */
export function contractReason(daysRemaining: number): DailyPriorityReason | null {
  if (daysRemaining <= 0) return "contract_ended";
  if (daysRemaining <= 15) return "contract_ending_15d";
  if (daysRemaining <= 30) return "contract_ending_30d";
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
  if (billingModelFromAgreement(sp) === "monthly" && sp.billing_duration_type !== "fixed") return null;
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
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("event_id, student_id, class_id, lesson_number, scheduled_date, homework, homework_posted, students(full_name)")
    .eq("teacher_id", teacherId)
    .eq("homework_posted", false)
    .neq("homework", "")
    .not("homework", "is", null)
    .lte("scheduled_date", todayStr)
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return ((data || []) as any[]).filter(homeworkRequiresAction).map((p): DailyPriorityItem => ({
    id: `homework:${p.event_id}`,
    category: "task" as const,
    urgency: p.scheduled_date < todayStr ? "critical" as const : "today" as const,
    reason: "homework_not_posted" as const,
    title: p.students?.full_name || "",
    params: { date: p.scheduled_date },
    date: p.scheduled_date,
    ref: { studentId: p.student_id || undefined, classId: p.class_id || undefined, eventId: p.event_id },
    action: p.class_id
      ? { route: "/students", params: { classId: p.class_id, eventId: p.event_id } }
      : { route: "/students", params: { studentId: p.student_id, tab: "Lessons" } },
  }));
}

async function fetchPendingTasks(teacherId: string, todayStr: string, tomorrowStartIso: string) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_date")
    .eq("teacher_id", teacherId)
    .eq("status", "pending");
  if (error) throw error;
  const rows = (data || []) as any[];
  const items: DailyPriorityItem[] = [];
  for (const t of rows) {
    if (!t.due_date) continue;
    const dueDate = new Date(t.due_date);
    if (!Number.isFinite(dueDate.getTime()) || dueDate.getTime() >= new Date(tomorrowStartIso).getTime()) continue;
    const day = formatLocalDateStr(dueDate);
    const overdue = day < todayStr;
    items.push({
      id: `task:${t.id}`,
      category: "task",
      urgency: overdue ? "critical" : "today",
      reason: overdue ? "task_overdue" : "task_due_today",
      title: t.title || "",
      params: { dueDate: day },
      date: day,
      ref: { taskId: t.id },
      action: { route: "/" },
    });
  }
  return items;
}

async function fetchLeads(teacherId: string, todayStr: string, staleBeforeIso: string): Promise<DailyPriorityItem[]> {
  const closed = `(${CLOSED_LEAD_STAGES.map((s) => `"${s}"`).join(",")})`;
  // No trial alert without a confirmed persisted lead/occurrence relationship.
  // Names and free-text notes cannot establish that association.
  const [proposals, stale] = await Promise.all([
    supabase.from("leads").select("id, full_name, updated_at").eq("teacher_id", teacherId).in("stage", PROPOSAL_STAGES),
    supabase
      .from("leads")
      .select("id, full_name, updated_at, stage")
      .eq("teacher_id", teacherId)
      .not("stage", "in", closed)
      .lt("updated_at", staleBeforeIso),
  ]);
  for (const r of [proposals, stale]) if (r.error) throw r.error;

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
  for (const l of (stale.data || []) as any[]) {
    if (proposalIds.has(l.id)) continue; // one priority per lead condition
    const since = formatLocalDateStr(new Date(l.updated_at));
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
  const staleBeforeIso = addDays(now, -LEAD_STALE_DAYS).toISOString();

  const [attendance, payments, contracts, homework, tasks, leads] = await Promise.allSettled([
    fetchAttendance(teacherId, todayStr, nowHHMM),
    fetchPayments(teacherId, todayStr, reminderEndStr),
    fetchContracts(teacherId, todayStr),
    fetchHomework(teacherId, todayStr),
    fetchPendingTasks(teacherId, todayStr, tomorrowStartIso),
    fetchLeads(teacherId, todayStr, staleBeforeIso),
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
  take(homework, "task");

  take(tasks, "task");
  take(leads, "lead");

  return { items: sortDailyPriorities(items), failed: [...failed] };
}

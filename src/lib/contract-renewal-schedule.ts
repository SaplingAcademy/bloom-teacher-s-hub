import { billingDateForMonth, isValidBillingDate, normalizeDueDay } from "@/lib/billing-domain";

/**
 * Pure rules for early (scheduled) contract renewals.
 * - A renewal requested while a contract is in force never shortens it: the new
 *   agreement is stored as `scheduled` and starts the day after the current end.
 * - Without an end date (continuous plans) the teacher chooses the transition date.
 * - `started_at` (validity) and `first_due_date` (first charge) are independent; the
 *   first due date is only suggested from the start and the chosen due day.
 */

/** RPC that atomically activates due scheduled agreements (docs/migrations); no parameters, server date. */
export const ACTIVATE_SCHEDULED_CONTRACTS_RPC = "activate_due_scheduled_contracts";

export const SCHEDULED_STATUS = "scheduled";

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Contract end as Bloom displays it: ended_at, else last_due_date; null = open-ended. */
export function agreementEnd(sp: { ended_at?: string | null; last_due_date?: string | null } | null | undefined): string | null {
  const end = sp?.ended_at || sp?.last_due_date || null;
  return end ? String(end).slice(0, 10) : null;
}

/** Suggested start of the renewal: the day after the current agreement ends. */
export function suggestedRenewalStart(currentEnd: string | null): string | null {
  return currentEnd && isValidBillingDate(currentEnd) ? addDays(currentEnd, 1) : null;
}

/**
 * First occurrence of the due day on or after the start (option 1): start 26/11 with due
 * day 10 → 10/12; start 05/11 with due day 10 → 10/11. Short months clamp to their last day.
 */
export function suggestFirstDueDate(startDate: string, dueDay: number | null | undefined): string | null {
  const day = normalizeDueDay(dueDay ?? null);
  if (!day || !isValidBillingDate(startDate)) return null;
  const [y, m] = startDate.split("-").map(Number);
  const sameMonth = billingDateForMonth(y, m - 1, day);
  return sameMonth >= startDate ? sameMonth : billingDateForMonth(y, m, day);
}

export interface RenewalTiming {
  /** "scheduled" whenever a contract is in force; "immediate" only without one. */
  mode: "immediate" | "scheduled";
  /** Scheduled renewal whose start is already due (activated right after saving). */
  activateNow: boolean;
  error: "start_before_current_end" | "start_not_after_current_start" | null;
}

export function planRenewalTiming(input: {
  hasCurrent: boolean;
  currentStart?: string | null;
  currentEnd?: string | null;
  startDate: string;
  today: string;
}): RenewalTiming {
  if (!input.hasCurrent) return { mode: "immediate", activateNow: false, error: null };
  // Never overlap the agreement in force: a fixed end means the start must come after it.
  if (input.currentEnd && input.startDate <= input.currentEnd) {
    return { mode: "scheduled", activateNow: false, error: "start_before_current_end" };
  }
  if (input.currentStart && input.startDate <= String(input.currentStart).slice(0, 10)) {
    return { mode: "scheduled", activateNow: false, error: "start_not_after_current_start" };
  }
  return { mode: "scheduled", activateNow: input.startDate <= input.today, error: null };
}

export interface ChargeConflict {
  id: string;
  dueDate: string;
  amountCents: number;
  status: string;
}

/**
 * Open charges of the current agreement falling on/after the new start. They are never
 * cancelled or changed; the teacher must explicitly acknowledge them before saving.
 */
export function findChargeConflicts(
  invoices: { id: string; due_date: string; amount_cents?: number | null; status?: string | null }[],
  startDate: string,
): ChargeConflict[] {
  return invoices
    .filter((i) => (i.status === "pending" || i.status === "overdue") && String(i.due_date).slice(0, 10) >= startDate)
    .map((i) => ({ id: i.id, dueDate: String(i.due_date).slice(0, 10), amountCents: i.amount_cents || 0, status: i.status || "" }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Active agreements that already have a scheduled renewal do not need renewal alerts. */
export function agreementsWithScheduledRenewal(rows: { status?: string | null; renewed_from_id?: string | null }[]): Set<string> {
  return new Set(rows.filter((r) => r.status === SCHEDULED_STATUS && r.renewed_from_id).map((r) => r.renewed_from_id as string));
}

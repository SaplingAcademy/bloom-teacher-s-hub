/**
 * Bloom roles & subscription plans — pure domain rules.
 *
 * Roles (who the user is) and plans (what the user pays for) are independent:
 * - `super_admin`: platform administrators.
 * - `teacher`: teachers using Bloom.
 * - `free`: up to FREE_PLAN_ACTIVE_STUDENT_LIMIT active students at once.
 * - `pro`: full access.
 *
 * The database is the authority (user_roles + teacher_subscriptions + trigger
 * on students). Everything here is presentation/pre-flight only and must never
 * be the sole protection for privileged or paid functionality.
 */

export type UserRole = "super_admin" | "teacher";
export type SubscriptionPlan = "free" | "pro";

/** Maximum simultaneous active students on the free plan. */
export const FREE_PLAN_ACTIVE_STUDENT_LIMIT = 5;

/**
 * Statuses that consume a slot of the active-student limit.
 * Active and Trial students occupy a slot; Inactive, Paused and Archived do not.
 */
const ACTIVE_LIMIT_STATUSES = new Set(["active", "trial"]);

/** Whether a student status counts toward the free-plan active-student limit. */
export function countsTowardActiveLimit(status: string | null | undefined): boolean {
  return ACTIVE_LIMIT_STATUSES.has((status ?? "").trim().toLowerCase());
}

/** Count students occupying active-limit slots. */
export function countActiveStudents(statuses: Array<string | null | undefined>): number {
  return statuses.reduce((total, status) => total + (countsTowardActiveLimit(status) ? 1 : 0), 0);
}

/**
 * Pre-flight check: may this plan add/reactivate one more student with the
 * given target status, given how many active slots are already occupied?
 * Unknown plan (read failure) is not blocked here — the database trigger is
 * the authority and will reject if needed.
 */
export function canAddActiveStudent(
  plan: SubscriptionPlan | null,
  currentActiveCount: number,
  targetStatus: string | null | undefined,
): boolean {
  if (!countsTowardActiveLimit(targetStatus)) return true;
  if (plan !== "free") return true;
  return currentActiveCount < FREE_PLAN_ACTIVE_STUDENT_LIMIT;
}

/** Academy full content is exclusive to pro plans and super admins. */
export function canAccessAcademy(
  plan: SubscriptionPlan | null,
  isSuperAdmin: boolean,
): boolean {
  return isSuperAdmin || plan === "pro";
}

/**
 * Stable marker raised by the students limit trigger in the database.
 * Kept as a constant so the UI can recognize the rejection without
 * depending on a translated message.
 */
export const FREE_PLAN_LIMIT_ERROR_MARKER = "FREE_PLAN_ACTIVE_STUDENT_LIMIT";

/** Detects the database trigger rejection for the free-plan limit. */
export function isFreePlanLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = String((error as { message?: unknown }).message ?? "");
  const details = String((error as { details?: unknown }).details ?? "");
  return message.includes(FREE_PLAN_LIMIT_ERROR_MARKER) || details.includes(FREE_PLAN_LIMIT_ERROR_MARKER);
}

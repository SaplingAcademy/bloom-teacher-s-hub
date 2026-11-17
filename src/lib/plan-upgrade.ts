import { supabase } from "@/lib/supabase";
import type { SubscriptionPlan } from "@/lib/plans";

/**
 * Plan-upgrade celebration — reads the upgrade event recorded by the database on
 * public.teacher_subscriptions (docs/migrations/20261117120000_plan_upgrade_celebration_manual.sql).
 * The trigger only records a real change from a lower to a higher plan, with its origin
 * (admin grant, confirmed purchase or unknown) and the facts at that moment (effective time on
 * Free, registered students). Renewals, downgrades and rows created already on a plan never
 * produce an event. This module never changes the plan.
 */
export type UpgradeSource = "admin_grant" | "purchase" | "unknown";

export interface PlanUpgradeRow {
  plan: string | null;
  upgraded_at: string | null;
  upgraded_to_plan: string | null;
  upgrade_source: string | null;
  upgrade_free_seconds: number | null;
  upgrade_student_count: number | null;
  upgrade_acknowledged_at: string | null;
}

export interface PendingPlanUpgrade {
  /** Identifies the event; sent back when acknowledging so only this event is marked as seen. */
  upgradedAt: string;
  plan: string;
  source: UpgradeSource;
  freeSeconds: number | null;
  studentCount: number | null;
}

/** Which welcome message to show. */
export type UpgradeScenario = "admin_gift" | "after_free" | "early" | "default";

/** Effective time on the Free plan that makes a purchase an "upgrade after trying Free". */
export const AFTER_FREE_MIN_SECONDS = 24 * 60 * 60;
/** A purchase before registering this many students is a "Premium right at the start". */
export const EARLY_MAX_STUDENTS = 3;

function normalizeSource(value: string | null): UpgradeSource {
  return value === "admin_grant" || value === "purchase" ? value : "unknown";
}

/** Pure: a pending celebration exists only for an unseen event whose plan is still the current one. */
export function pendingPlanUpgrade(row: PlanUpgradeRow | null | undefined): PendingPlanUpgrade | null {
  if (!row?.upgraded_at || row.upgrade_acknowledged_at || !row.upgraded_to_plan) return null;
  if (row.plan !== row.upgraded_to_plan) return null; // downgraded again before seeing it
  return {
    upgradedAt: row.upgraded_at,
    plan: row.upgraded_to_plan,
    source: normalizeSource(row.upgrade_source),
    freeSeconds: typeof row.upgrade_free_seconds === "number" ? row.upgrade_free_seconds : null,
    studentCount: typeof row.upgrade_student_count === "number" ? row.upgrade_student_count : null,
  };
}

/**
 * Pure classification, in priority order: admin grant → purchase after ≥24 h effective on Free →
 * purchase before 3 students → default. Only a confirmed purchase can reach A or B; an unknown
 * origin always gets the default message, and missing facts never qualify for A or B.
 */
export function upgradeScenario(event: Pick<PendingPlanUpgrade, "source" | "freeSeconds" | "studentCount">): UpgradeScenario {
  if (event.source === "admin_grant") return "admin_gift";
  if (event.source !== "purchase") return "default";
  if (event.freeSeconds !== null && event.freeSeconds >= AFTER_FREE_MIN_SECONDS) return "after_free";
  if (event.studentCount !== null && event.studentCount < EARLY_MAX_STUDENTS) return "early";
  return "default";
}

/** Columns from the manual migration are missing: the feature is simply not deployed yet. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || /upgraded_at|upgrade_source|upgrade_acknowledged_at|upgraded_to_plan/.test(error.message ?? "");
}

export async function fetchPendingPlanUpgrade(teacherId: string): Promise<PendingPlanUpgrade | null> {
  const { data, error } = await supabase
    .from("teacher_subscriptions")
    .select("plan, upgraded_at, upgraded_to_plan, upgrade_source, upgrade_free_seconds, upgrade_student_count, upgrade_acknowledged_at")
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) {
    if (isMissingColumn(error)) return null;
    throw error;
  }
  return pendingPlanUpgrade(data as PlanUpgradeRow | null);
}

/** Marks only the shown event as seen (idempotent in the database). */
export async function acknowledgePlanUpgrade(upgradedAt: string): Promise<void> {
  const { error } = await supabase.rpc("acknowledge_plan_upgrade", { p_upgraded_at: upgradedAt });
  if (error) throw error;
}

/** Commercial name of a plan (internal `pro` is shown as PREMIUM); unknown plans in capitals. */
export function planDisplayName(plan: SubscriptionPlan | string, t: (key: string) => string): string {
  const key = `planUpgrade.planNames.${plan}`;
  const name = t(key);
  return name && name !== key ? name : plan.toUpperCase();
}

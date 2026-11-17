import { supabase } from "@/lib/supabase";
import type { SubscriptionPlan } from "@/lib/plans";

/**
 * Plan-upgrade celebration — reads the upgrade event recorded by the database on
 * public.teacher_subscriptions (docs/migrations/20261117120000_plan_upgrade_celebration_manual.sql).
 * The trigger only records a real change from a lower to a higher plan; renewals, downgrades and
 * rows created already on a plan never produce an event. This module never changes the plan.
 */
export interface PlanUpgradeRow {
  plan: string | null;
  upgraded_at: string | null;
  upgraded_to_plan: string | null;
  upgrade_acknowledged_at: string | null;
}

export interface PendingPlanUpgrade {
  /** Identifies the event; sent back when acknowledging so only this event is marked as seen. */
  upgradedAt: string;
  plan: string;
}

/** Pure: a pending celebration exists only for an unseen event whose plan is still the current one. */
export function pendingPlanUpgrade(row: PlanUpgradeRow | null | undefined): PendingPlanUpgrade | null {
  if (!row?.upgraded_at || row.upgrade_acknowledged_at || !row.upgraded_to_plan) return null;
  if (row.plan !== row.upgraded_to_plan) return null; // downgraded again before seeing it
  return { upgradedAt: row.upgraded_at, plan: row.upgraded_to_plan };
}

/** Columns from the manual migration are missing: the feature is simply not deployed yet. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || /upgraded_at|upgrade_acknowledged_at|upgraded_to_plan/.test(error.message ?? "");
}

export async function fetchPendingPlanUpgrade(teacherId: string): Promise<PendingPlanUpgrade | null> {
  const { data, error } = await supabase
    .from("teacher_subscriptions")
    .select("plan, upgraded_at, upgraded_to_plan, upgrade_acknowledged_at")
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

/** Display name of a plan: translated when known, otherwise the stored value in capitals. */
export function planDisplayName(plan: SubscriptionPlan | string, t: (key: string) => string): string {
  const key = `planUpgrade.planNames.${plan}`;
  const name = t(key);
  return name && name !== key ? name : plan.toUpperCase();
}

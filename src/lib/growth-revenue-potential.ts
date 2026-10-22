import type { RealCapacityResult } from "@/lib/capacity-engine";
import type { EffectiveHourlyResult, MRRResult } from "@/lib/growth-engine";

/** Card-only estimate: do not change the shared hourly or opportunities formulas. */
export const REVENUE_POTENTIAL_WEEKS_PER_MONTH = 4.33;

export interface RevenuePotentialInput {
  mrr: Pick<MRRResult, "totalMRR" | "hasBillingData">;
  hourly: Pick<EffectiveHourlyResult, "weeklyTeachingMinutes" | "hasEnoughData">;
  capacity: Pick<RealCapacityResult, "hasWorkingHours" | "availableWeeklyMinutes" | "days">;
}

export interface RevenuePotential {
  currentProjectedRevenue: number;
  weeklyFreeHours: number;
  monthlyOccupiedHours: number;
  effectiveRevenuePerHour: number;
  additionalMonthlyPotential: number;
  estimatedRevenuePotential: number;
}

function clockMinutes(time: string): number | null {
  if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Sum only the engine's bookable intervals for its next-seven-day window. */
export function weeklyFreeTeachingHours(capacity: RevenuePotentialInput["capacity"]): number | null {
  if (!capacity.hasWorkingHours || !Number.isFinite(capacity.availableWeeklyMinutes) ||
      capacity.availableWeeklyMinutes <= 0 || !capacity.days.some((day) => day.enabled)) return null;

  let minutes = 0;
  for (const day of capacity.days) {
    if (!day.enabled) continue;
    for (const slot of day.availableSlots) {
      const start = clockMinutes(slot.startTime);
      const end = clockMinutes(slot.endTime);
      if (start === null || end === null || end <= start) return null;
      minutes += end - start;
    }
  }
  if (minutes > capacity.availableWeeklyMinutes) return null;
  return minutes / 60;
}

/** Receives canonical revenue and class-once teaching hours; never fetches or writes. */
export function calculateRevenuePotential(input: RevenuePotentialInput): RevenuePotential | null {
  const { mrr, hourly, capacity } = input;
  const weeklyFreeHours = weeklyFreeTeachingHours(capacity);
  if (!mrr.hasBillingData || !Number.isFinite(mrr.totalMRR) || mrr.totalMRR <= 0 ||
      !hourly.hasEnoughData || !Number.isFinite(hourly.weeklyTeachingMinutes) ||
      hourly.weeklyTeachingMinutes <= 0 || weeklyFreeHours === null) return null;

  const monthlyOccupiedHours = hourly.weeklyTeachingMinutes / 60 * REVENUE_POTENTIAL_WEEKS_PER_MONTH;
  const effectiveRevenuePerHour = mrr.totalMRR / monthlyOccupiedHours;
  const additionalMonthlyPotential = weeklyFreeHours * REVENUE_POTENTIAL_WEEKS_PER_MONTH * effectiveRevenuePerHour;
  const estimatedRevenuePotential = mrr.totalMRR + additionalMonthlyPotential;
  if (![monthlyOccupiedHours, effectiveRevenuePerHour, additionalMonthlyPotential, estimatedRevenuePotential].every(Number.isFinite)) return null;

  return {
    currentProjectedRevenue: mrr.totalMRR,
    weeklyFreeHours,
    monthlyOccupiedHours,
    effectiveRevenuePerHour,
    additionalMonthlyPotential,
    estimatedRevenuePotential,
  };
}
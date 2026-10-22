import { calculateReceivedCentsForMonth, lastMonthKeys, type ReceivedRevenueInvoice } from "@/lib/finance-cashflow";
import { WEEKS_PER_MONTH, type RecurringSlot } from "@/lib/growth-engine";

/**
 * Growth opportunity engine (V1). Pure: receives normalized Growth data and returns
 * strategic opportunities. Every rule fails closed — missing/zero/ambiguous data or
 * negligible impact returns no opportunity (precision over quantity).
 */

export interface GrowthOpportunityInput {
  /** Monthly revenue goal (BRL); null when not set. */
  goal: number | null;
  /** Contracted recurring monthly revenue (BRL) — never cash received. */
  mrr: number;
  hasBillingData: boolean;
  /** Real weekly availability from the capacity engine, minutes. */
  weeklyCapacityMinutes: number;
  /** Real recurring teaching minutes; a group class block counts once. */
  weeklyOccupiedMinutes: number;
  slots: RecurringSlot[];
  studentRevenue: Record<string, number>;
  classRevenue: Record<string, number>;
  /** Canonical received revenue (cents) for the last complete months, oldest → newest. */
  receivedHistoryCents: number[];
}

export type OpportunityFamily = "pricing" | "capacity" | "goal" | "efficiency";

export interface PricingOpportunity {
  family: "pricing";
  tone: "direct" | "cautious";
  occupancyPct: number;
  goal: number;
  goalGap: number;
  currentPerHour: number;
  increasePerHour: number;
  increasePct: number;
  impact: number;
}

export interface CapacityOpportunity {
  family: "capacity";
  mode: "reachGoal" | "potential";
  occupancyPct: number;
  goal: number;
  freeWeeklyHours: number;
  hoursNeeded: number;
  potentialRevenue: number;
  impact: number;
}

export interface GoalOpportunity {
  family: "goal";
  trigger: "capacity" | "growth";
  occupancyPct: number;
  goal: number;
  progressPct: number;
  suggestedGoal: number;
  impact: number;
}

export interface EfficiencySlot {
  ownerType: RecurringSlot["ownerType"];
  weekday: string;
  startTime: string;
  perHour: number;
  belowPct: number;
}

export interface EfficiencyOpportunity {
  family: "efficiency";
  referencePerHour: number;
  avgBelowPct: number;
  slots: EfficiencySlot[];
  hasGroupSlot: boolean;
  impact: number;
}

export type GrowthOpportunity = PricingOpportunity | CapacityOpportunity | GoalOpportunity | EfficiencyOpportunity;

export const OPPORTUNITY_RULES = {
  highOccupancyPct: 85,
  lowOccupancyPct: 65,
  farFromGoalRatio: 0.65,
  nearGoalRatio: 0.85,
  directPricingMaxPct: 15,
  cautiousPricingMaxPct: 25,
  suggestedGoalUplift: 0.1,
  efficiencyMinSlots: 5,
  efficiencyBelowPct: 15,
  efficiencyMinMatches: 2,
  efficiencyMaxShown: 3,
  growthMonths: 3,
  /** Materiality floors: below these the insight is not worth the teacher's attention. */
  minMonthlyImpact: 100,
  minPricingIncreasePct: 3,
  minFreeWeeklyHours: 2,
  minConservativeFreeHours: 5,
  maxOpportunities: 5,
} as const;

const R = OPPORTUNITY_RULES;
const ok = (n: number) => Number.isFinite(n) && n > 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Round a monetary amount up to a clean, user-friendly value. */
export function roundGoalAmount(value: number): number {
  const step = value < 1000 ? 50 : value < 10000 ? 100 : 500;
  return Math.ceil(value / step) * step;
}

/** Canonical received revenue for the last `months` complete months (current month excluded). */
export function receivedHistoryCents(invoices: ReceivedRevenueInvoice[], months = R.growthMonths, now = new Date()): number[] {
  const keys = lastMonthKeys(months + 1, now).slice(0, months);
  return keys.map((k) => calculateReceivedCentsForMonth(invoices, k));
}

/** Revenue per occupied hour for each recurring slot; monthly revenue is split across the owner's slots by duration. */
export function allocateSlotRevenue(
  slots: RecurringSlot[],
  studentRevenue: Record<string, number>,
  classRevenue: Record<string, number>,
): (RecurringSlot & { monthlyRevenue: number; perHour: number })[] {
  const ownerMinutes = new Map<string, number>();
  const key = (s: RecurringSlot) => `${s.ownerType}:${s.ownerId}`;
  for (const s of slots) if (ok(s.minutes)) ownerMinutes.set(key(s), (ownerMinutes.get(key(s)) || 0) + s.minutes);
  const out: (RecurringSlot & { monthlyRevenue: number; perHour: number })[] = [];
  for (const s of slots) {
    const revenue = s.ownerType === "class" ? classRevenue[s.ownerId] : studentRevenue[s.ownerId];
    const total = ownerMinutes.get(key(s)) || 0;
    if (!ok(s.minutes) || !ok(revenue) || !ok(total)) continue;
    const monthlyRevenue = (revenue * s.minutes) / total;
    const monthlyHours = (s.minutes / 60) * WEEKS_PER_MONTH;
    out.push({ ...s, monthlyRevenue, perHour: monthlyRevenue / monthlyHours });
  }
  return out;
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function buildGrowthOpportunities(input: GrowthOpportunityInput): GrowthOpportunity[] {
  const goal = input.goal ?? 0;
  const { mrr } = input;
  const capH = input.weeklyCapacityMinutes / 60;
  const occH = input.weeklyOccupiedMinutes / 60;
  const financialOk = input.hasBillingData && ok(mrr) && ok(occH);
  const capacityOk = ok(capH);
  const occupancyPct = capacityOk && ok(occH) ? Math.round((occH / capH) * 100) : null;
  const freeH = capacityOk ? Math.max(0, capH - occH) : 0;
  const monthlyOccH = occH * WEEKS_PER_MONTH;
  const perHour = financialOk ? mrr / monthlyOccH : 0;
  const candidates: GrowthOpportunity[] = [];

  // 1. High occupancy → pricing
  if (financialOk && ok(goal) && occupancyPct !== null && occupancyPct >= R.highOccupancyPct && mrr < goal) {
    const goalGap = goal - mrr;
    const increasePerHour = goalGap / monthlyOccH;
    const increasePct = (increasePerHour / perHour) * 100;
    if (increasePct <= R.cautiousPricingMaxPct && increasePct >= R.minPricingIncreasePct && goalGap >= R.minMonthlyImpact) {
      candidates.push({
        family: "pricing", tone: increasePct <= R.directPricingMaxPct ? "direct" : "cautious",
        occupancyPct, goal, goalGap: round2(goalGap), currentPerHour: round2(perHour),
        increasePerHour: round2(increasePerHour), increasePct: Math.round(increasePct), impact: goalGap,
      });
    }
  }

  // 3. Conservative goal (evaluated before capacity: trigger A outranks it)
  let goalOpp: GoalOpportunity | null = null;
  if (financialOk && ok(goal) && occupancyPct !== null) {
    const progress = mrr / goal;
    const triggerA = progress >= R.nearGoalRatio && occupancyPct <= R.lowOccupancyPct && freeH >= R.minConservativeFreeHours;
    const h = input.receivedHistoryCents;
    const triggerB = progress >= R.nearGoalRatio && h.length >= R.growthMonths &&
      h.slice(-R.growthMonths).every((v, i, arr) => ok(v) && (i === 0 || v > arr[i - 1]));
    const suggestedGoal = roundGoalAmount(mrr * (1 + R.suggestedGoalUplift));
    if ((triggerA || triggerB) && suggestedGoal > goal && suggestedGoal - goal >= R.minMonthlyImpact) {
      goalOpp = {
        family: "goal", trigger: triggerA ? "capacity" : "growth", occupancyPct, goal,
        progressPct: Math.round(progress * 100), suggestedGoal, impact: suggestedGoal - goal,
      };
    }
  }

  // 2. Available capacity
  if (financialOk && ok(goal) && occupancyPct !== null && occupancyPct <= R.lowOccupancyPct &&
      mrr <= goal * R.farFromGoalRatio && freeH >= R.minFreeWeeklyHours && !(goalOpp?.trigger === "capacity")) {
    const goalGap = goal - mrr;
    const hoursNeeded = goalGap / (perHour * WEEKS_PER_MONTH);
    const potentialRevenue = freeH * perHour * WEEKS_PER_MONTH;
    const mode = hoursNeeded <= freeH ? "reachGoal" : "potential";
    const impact = mode === "reachGoal" ? goalGap : potentialRevenue;
    if (ok(hoursNeeded) && impact >= R.minMonthlyImpact) {
      candidates.push({
        family: "capacity", mode, occupancyPct, goal, freeWeeklyHours: round1(freeH),
        hoursNeeded: round1(hoursNeeded), potentialRevenue: round2(potentialRevenue), impact,
      });
    }
  }

  // Pricing and a conservative-goal suggestion would contradict each other; pricing wins.
  if (goalOpp && !candidates.some((c) => c.family === "pricing")) candidates.push(goalOpp);

  // 4. Schedule efficiency
  const valid = allocateSlotRevenue(input.slots, input.studentRevenue, input.classRevenue);
  if (valid.length >= R.efficiencyMinSlots) {
    const ref = median(valid.map((s) => s.perHour));
    const below = valid
      .map((s) => ({ s, belowPct: ((ref - s.perHour) / ref) * 100 }))
      .filter((x) => x.belowPct >= R.efficiencyBelowPct)
      .sort((a, b) => b.belowPct - a.belowPct);
    if (ok(ref) && below.length >= R.efficiencyMinMatches) {
      const impact = below.reduce((acc, x) => acc + (ref - x.s.perHour) * (x.s.minutes / 60) * WEEKS_PER_MONTH, 0);
      if (impact >= R.minMonthlyImpact) {
        const shown = below.slice(0, R.efficiencyMaxShown);
        candidates.push({
          family: "efficiency", referencePerHour: round2(ref),
          avgBelowPct: Math.round(below.reduce((a, x) => a + x.belowPct, 0) / below.length),
          slots: shown.map(({ s, belowPct }) => ({ ownerType: s.ownerType, weekday: s.weekday, startTime: s.startTime, perHour: round2(s.perHour), belowPct: Math.round(belowPct) })),
          hasGroupSlot: shown.some((x) => x.s.ownerType === "class"),
          impact,
        });
      }
    }
  }

  const seen = new Set<OpportunityFamily>();
  return candidates
    .sort((a, b) => b.impact - a.impact)
    .filter((c) => (seen.has(c.family) ? false : (seen.add(c.family), true)))
    .slice(0, R.maxOpportunities);
}

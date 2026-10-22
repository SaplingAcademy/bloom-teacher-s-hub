import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { allocateSlotRevenue, buildGrowthOpportunities, receivedHistoryCents, type GrowthOpportunityInput } from "@/lib/growth-opportunities";
import type { RecurringSlot } from "@/lib/growth-engine";

const W = 52 / 12;
const slot = (ownerType: RecurringSlot["ownerType"], ownerId: string, weekday = "Monday", startTime = "10:00", minutes = 60): RecurringSlot =>
  ({ ownerType, ownerId, weekday, startTime, minutes });

const base = (o: Partial<GrowthOpportunityInput>): GrowthOpportunityInput => ({
  goal: 10000, mrr: 5000, hasBillingData: true, weeklyCapacityMinutes: 40 * 60, weeklyOccupiedMinutes: 20 * 60,
  slots: [], studentRevenue: {}, classRevenue: {}, receivedHistoryCents: [], ...o,
});
const fam = (r: { family: string }[]) => r.map((x) => x.family);

describe("growth opportunities", () => {
  it("90% occupancy + small goal gap → direct pricing opportunity", () => {
    const r = buildGrowthOpportunities(base({ goal: 10000, mrr: 9200, weeklyOccupiedMinutes: 36 * 60 }));
    const p = r.find((x) => x.family === "pricing")!;
    expect(p).toBeDefined();
    expect(p.occupancyPct).toBe(90);
    expect(p.tone).toBe("direct");
    expect(p.increasePct).toBe(9); // 800 / 9200
    expect(fam(r)).not.toContain("capacity");
  });

  it("pricing between 15% and 25% uses cautious tone; above 25% is suppressed", () => {
    expect((buildGrowthOpportunities(base({ goal: 10000, mrr: 8300, weeklyOccupiedMinutes: 36 * 60 }))[0] as any).tone).toBe("cautious");
    expect(fam(buildGrowthOpportunities(base({ goal: 10000, mrr: 7000, weeklyOccupiedMinutes: 36 * 60 })))).not.toContain("pricing");
  });

  it("low occupancy + far from goal + enough capacity → capacity opportunity reaching goal", () => {
    // 20h/week occupied, 5000/month → ~57.7/h; gap 1500 → ~6h needed; 20h free
    const r = buildGrowthOpportunities(base({ goal: 6500, mrr: 4000, weeklyOccupiedMinutes: 20 * 60 }));
    const c = r.find((x) => x.family === "capacity") as any;
    expect(c.mode).toBe("reachGoal");
    expect(c.hoursNeeded).toBeLessThanOrEqual(c.freeWeeklyHours);
    expect(fam(r)).not.toContain("pricing");
  });

  it("capacity insufficient to reach goal → realistic potential, no false claim", () => {
    // 30h occupied of 40h, 3000 → 23.1/h; free 10h → ~1000 potential; gap 7000
    const r = buildGrowthOpportunities(base({ goal: 10000, mrr: 3000, weeklyOccupiedMinutes: 26 * 60 }));
    const c = r.find((x) => x.family === "capacity") as any;
    expect(c.mode).toBe("potential");
    expect(c.potentialRevenue).toBeCloseTo(14 * (3000 / (26 * W)) * W, 1);
    expect(c.potentialRevenue).toBeLessThan(7000);
  });

  it("near goal + low occupancy → conservative goal, generic capacity suppressed", () => {
    const r = buildGrowthOpportunities(base({ goal: 9500, mrr: 9000, weeklyOccupiedMinutes: 20 * 60 }));
    const g = r.find((x) => x.family === "goal") as any;
    expect(g.trigger).toBe("capacity");
    expect(g.suggestedGoal).toBe(9900);
    expect(fam(r)).not.toContain("capacity");
    // suggestion not above the current goal → no weak recommendation
    expect(fam(buildGrowthOpportunities(base({ goal: 10000, mrr: 9000, weeklyOccupiedMinutes: 20 * 60 })))).not.toContain("goal");
  });

  it("near goal + low occupancy with goal below 10% uplift → suggests ~10% above revenue", () => {
    const r = buildGrowthOpportunities(base({ goal: 8000, mrr: 7600, weeklyOccupiedMinutes: 20 * 60 }));
    const g = r.find((x) => x.family === "goal") as any;
    expect(g.suggestedGoal).toBe(8400); // 8360 → 8400
    expect(fam(r)).not.toContain("capacity");
  });

  it("3 months of sustained received growth → conservative goal (growth trigger)", () => {
    const r = buildGrowthOpportunities(base({ goal: 8000, mrr: 7600, weeklyOccupiedMinutes: 30 * 60, receivedHistoryCents: [600000, 680000, 750000] }));
    expect((r.find((x) => x.family === "goal") as any).trigger).toBe("growth");
    const flat = buildGrowthOpportunities(base({ goal: 8000, mrr: 7600, weeklyOccupiedMinutes: 30 * 60, receivedHistoryCents: [600000, 580000, 750000] }));
    expect(fam(flat)).not.toContain("goal");
  });

  it("received history uses canonical paid invoices of the last complete months", () => {
    const inv = [
      { id: "a", status: "paid", amountCents: 100, receivedAt: "2026-07-10", paidAt: null },
      { id: "b", status: "paid", amountCents: 200, receivedAt: "2026-09-02", paidAt: null },
      { id: "c", status: "paid", amountCents: 999, receivedAt: "2026-10-02", paidAt: null },
    ] as any;
    expect(receivedHistoryCents(inv, 3, new Date(2026, 9, 22))).toEqual([100, 0, 200]);
  });

  it("group with several paying students counts one block and sums revenue once", () => {
    const out = allocateSlotRevenue([slot("class", "g1")], {}, { g1: 800 });
    expect(out).toHaveLength(1);
    expect(out[0].perHour).toBeCloseTo(800 / W, 5);
  });

  it("monthly revenue is split across a student's recurring slots, not duplicated", () => {
    const out = allocateSlotRevenue([slot("student", "s1", "Monday"), slot("student", "s1", "Thursday")], { s1: 400 }, {});
    expect(out.map((s) => s.monthlyRevenue)).toEqual([200, 200]);
    expect(out.reduce((a, s) => a + s.monthlyRevenue, 0)).toBe(400);
  });

  it(">=5 valid slots with 2 below median by ≥15% → efficiency opportunity", () => {
    const slots = ["a", "b", "c", "d", "e"].map((id, i) => slot("student", id, "Wednesday", `1${i}:00`));
    const rev = { a: 400, b: 400, c: 400, d: 200, e: 250 };
    const r = buildGrowthOpportunities(base({ goal: null, slots, studentRevenue: rev }));
    const e = r.find((x) => x.family === "efficiency") as any;
    expect(e.slots).toHaveLength(2);
    expect(e.slots[0].belowPct).toBe(50);
  });

  it("fewer than 5 valid slots → no efficiency opportunity", () => {
    const slots = ["a", "b", "c", "d"].map((id) => slot("student", id));
    const r = buildGrowthOpportunities(base({ goal: null, slots, studentRevenue: { a: 400, b: 400, c: 100, d: 100 } }));
    expect(fam(r)).not.toContain("efficiency");
  });

  it("missing financial data or goal → nothing fabricated", () => {
    expect(buildGrowthOpportunities(base({ hasBillingData: false, mrr: 0, weeklyOccupiedMinutes: 36 * 60 }))).toEqual([]);
    expect(buildGrowthOpportunities(base({ goal: null, mrr: 9200, weeklyOccupiedMinutes: 36 * 60 }))).toEqual([]);
    expect(buildGrowthOpportunities(base({ weeklyCapacityMinutes: 0, mrr: 9200 }))).toEqual([]);
  });

  it("healthy business with no material condition → empty list (neutral empty state)", () => {
    expect(buildGrowthOpportunities(base({ goal: 10000, mrr: 7500, weeklyOccupiedMinutes: 30 * 60 }))).toEqual([]);
  });
});

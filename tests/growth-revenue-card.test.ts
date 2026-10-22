import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { computeGrowthMetrics, type MRRResult } from "@/lib/growth-engine";

const revenue = (totalMRR: number): MRRResult => ({
  totalMRR,
  contributingStudentRevenues: [],
  activeStudentCount: 0,
  payingStudentCount: 0,
  hasBillingData: true,
  studentRevenue: {},
  classRevenue: {},
});

describe("existing Growth goal metrics reused by the revenue card", () => {
  it("uses goal minus projected revenue for the remaining amount", () => {
    expect(computeGrowthMetrics(10000, revenue(7500)).remaining).toBe(2500);
  });

  it("never reports a negative gap above the saved goal", () => {
    expect(computeGrowthMetrics(10000, revenue(12500)).remaining).toBe(0);
  });

  it("marks an exactly met goal as achieved", () => {
    expect(computeGrowthMetrics(10000, revenue(10000)).goalReached).toBe(true);
  });

  it("keeps the real projected revenue / goal percentage above 100", () => {
    expect(computeGrowthMetrics(10000, revenue(12500)).progressPct).toBe(125);
  });
});
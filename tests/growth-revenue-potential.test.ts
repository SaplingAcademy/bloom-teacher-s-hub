import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { buildCapacityDays } from "@/lib/capacity-engine";
import type { TeacherAvailabilitySnapshot } from "@/lib/teacher-availability";
import { calculateRevenuePotential, type RevenuePotentialInput } from "@/lib/growth-revenue-potential";

const snapshot: TeacherAvailabilitySnapshot = {
  teacherId: "teacher", days: [{ day: "Monday", enabled: true, startTime: "09:00", endTime: "12:00" }],
  restBlocks: [], timeOff: [], defaultDuration: 60, timezone: "America/Sao_Paulo", isConfigured: true, fetchedAt: 0,
};
const makeInput = (): RevenuePotentialInput => ({
  mrr: { totalMRR: 400, hasBillingData: true },
  hourly: { weeklyTeachingMinutes: 60, hasEnoughData: true },
  capacity: { hasWorkingHours: true, availableWeeklyMinutes: 180,
    days: buildCapacityDays(snapshot, [], [{ id: "group", weekday: "Monday", start_time: "09:00", duration: 60 }], [], "2026-10-19") },
});

describe("Growth revenue potential card calculations", () => {
  it("uses exactly 4.33 weeks for monthly occupied hours", () => {
    expect(calculateRevenuePotential(makeInput())?.monthlyOccupiedHours).toBe(4.33);
  });
  it("uses current projected revenue divided by unrounded monthly occupied hours", () => {
    expect(calculateRevenuePotential(makeInput())?.effectiveRevenuePerHour).toBeCloseTo(400 / 4.33, 10);
  });
  it("adds free weekly hours × 4.33 × revenue/hour to current revenue", () => {
    const result = calculateRevenuePotential(makeInput());
    expect(result?.weeklyFreeHours).toBe(2);
    expect(result?.additionalMonthlyPotential).toBeCloseTo(800, 10);
    expect(result?.estimatedRevenuePotential).toBeCloseTo(1200, 10);
  });
  it("counts a one-hour class of four paying students once, keeping all member revenue", () => {
    const input = makeInput();
    input.mrr.totalMRR = [100, 100, 100, 100].reduce((sum, revenue) => sum + revenue, 0);
    const result = calculateRevenuePotential(input);
    expect(result?.monthlyOccupiedHours).toBe(4.33);
    expect(result?.estimatedRevenuePotential).toBeCloseTo(1200, 10);
  });
  it("returns no estimate without valid projected revenue", () => {
    for (const revenue of [0, -1, NaN, Infinity]) {
      const input = makeInput(); input.mrr.totalMRR = revenue;
      expect(calculateRevenuePotential(input)).toBeNull();
    }
    const input = makeInput(); input.mrr.hasBillingData = false;
    expect(calculateRevenuePotential(input)).toBeNull();
  });
  it("returns no estimate without known positive occupied teaching hours", () => {
    for (const minutes of [0, -1, NaN, Infinity]) {
      const input = makeInput(); input.hourly.weeklyTeachingMinutes = minutes;
      expect(calculateRevenuePotential(input)).toBeNull();
    }
    const input = makeInput(); input.hourly.hasEnoughData = false;
    expect(calculateRevenuePotential(input)).toBeNull();
  });
  it("returns no estimate without configured capacity", () => {
    const input = makeInput(); input.capacity.hasWorkingHours = false;
    expect(calculateRevenuePotential(input)).toBeNull();
  });
  it("returns no estimate for invalid free-hours intervals instead of treating them as zero", () => {
    const input = makeInput();
    const day = input.capacity.days.find((day) => day.enabled);
    if (!day) throw new Error("Missing fixture day");
    day.availableSlots = [{ startTime: "invalid", endTime: "12:00" }];
    expect(calculateRevenuePotential(input)).toBeNull();
  });
  it("uses current revenue with zero additional potential when no slots are free", () => {
    const input = makeInput();
    input.capacity.days = buildCapacityDays(snapshot, [], [{ id: "full", weekday: "Monday", start_time: "09:00", duration: 180 }], [], "2026-10-19");
    expect(calculateRevenuePotential(input)?.additionalMonthlyPotential).toBe(0);
    expect(calculateRevenuePotential(input)?.estimatedRevenuePotential).toBe(400);
  });
  it("uses the existing capacity result after custom events, not recurring capacity minus teaching hours", () => {
    const input = makeInput();
    input.capacity.days = buildCapacityDays(snapshot, [], [{ id: "group", weekday: "Monday", start_time: "09:00", duration: 60 }],
      [{ id: "meeting", date: "2026-10-19", start_time: "10:00", duration: 60, status: "Scheduled" }], "2026-10-19");
    expect(calculateRevenuePotential(input)?.weeklyFreeHours).toBe(1);
    expect(calculateRevenuePotential(input)?.estimatedRevenuePotential).toBeCloseTo(800, 10);
  });
  it("keeps time-off slots unavailable using the existing capacity engine", () => {
    const input = makeInput();
    input.capacity.days = buildCapacityDays({ ...snapshot, timeOff: [{ id: "off", teacherId: "teacher", startDate: "2026-10-19", endDate: "2026-10-19", type: "Férias", createdAt: "" }] }, [], [], [], "2026-10-19");
    expect(calculateRevenuePotential(input)?.weeklyFreeHours).toBe(0);
    expect(calculateRevenuePotential(input)?.estimatedRevenuePotential).toBe(400);
  });
  it("uses saved 30-minute slot intervals without assuming one-hour lessons", () => {
    const input = makeInput();
    input.capacity.days = buildCapacityDays({ ...snapshot, defaultDuration: 30 }, [], [{ id: "group", weekday: "Monday", start_time: "09:00", duration: 60 }], [], "2026-10-19");
    expect(calculateRevenuePotential(input)?.weeklyFreeHours).toBe(2);
  });
});
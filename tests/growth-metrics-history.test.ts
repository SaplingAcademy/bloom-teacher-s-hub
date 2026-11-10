import { afterEach, describe, expect, it, vi } from "vitest";

const tables = vi.hoisted(() => ({ students: [] as any[], student_packages: [] as any[], invoices: [] as any[] }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: keyof typeof tables) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        then: (resolve: (v: unknown) => void) => resolve({ data: tables[table], error: null }),
      };
      return chain;
    },
  },
}));

import { fetchGrowthMetrics, GROWTH_HISTORY_MONTHS } from "../src/lib/growth-metrics";

afterEach(() => {
  vi.useRealTimers();
  tables.students = [];
  tables.student_packages = [];
  tables.invoices = [];
});

const paid = (id: string, studentId: string, cents: number, date: string) => ({
  id, status: "paid", student_id: studentId, amount_cents: cents, paid_at: `${date}T12:00:00`, payments: [],
});

describe("growth metrics monthly history", () => {
  it("rebuilds the last months with the current formulas; last point equals the current value", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12)); // Nov 2026
    tables.students = [
      { id: "a", status: "Active", created_at: "2026-08-05T10:00:00" },
      { id: "b", status: "Active", created_at: "2026-08-20T10:00:00" },
      { id: "c", status: "Active", created_at: "2026-10-02T10:00:00" },
      { id: "d", status: "Active", created_at: "2026-11-03T10:00:00" },
    ];
    tables.invoices = [
      paid("i1", "a", 20000, "2026-09-10"),
      paid("i2", "a", 20000, "2026-10-10"),
      paid("i3", "b", 30000, "2026-10-12"),
      paid("i4", "a", 25000, "2026-11-05"),
    ];

    const m = await fetchGrowthMetrics("t-1");
    expect(m.history.months).toEqual(["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
    expect(m.history.months).toHaveLength(GROWTH_HISTORY_MONTHS);
    // Before the first student: no data (null), not zero; after it, real counts (0 is a real zero).
    expect(m.history.newStudents).toEqual([null, null, 2, 0, 1, 1]);
    // Months without paying students have no value.
    expect(m.history.avgRevenuePerStudent).toEqual([null, null, null, 200, 250, 250]);
    // Growth: none before the first revenue month or when the previous month had no revenue.
    expect(m.history.monthlyGrowthRate).toEqual([null, null, null, null, 150, -50]);

    expect(m.history.newStudents.at(-1)).toBe(m.newStudentsThisMonth.value);
    expect(m.history.avgRevenuePerStudent.at(-1)).toBe(m.avgRevenuePerStudent.value);
    expect(m.history.monthlyGrowthRate.at(-1)).toBe(m.monthlyGrowthRate.value);
  });

  it("without any record every month is empty (never zero-filled)", async () => {
    const m = await fetchGrowthMetrics("t-1");
    expect(m.history.newStudents.every((v) => v === null)).toBe(true);
    expect(m.history.avgRevenuePerStudent.every((v) => v === null)).toBe(true);
    expect(m.history.monthlyGrowthRate.every((v) => v === null)).toBe(true);
  });
});

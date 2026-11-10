import { afterEach, describe, expect, it, vi } from "vitest";

// Brazil time zone: a "YYYY-MM-DD" start date parsed as UTC would fall into the previous month.
process.env.TZ = "America/Sao_Paulo";

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
      { id: "a", status: "Active", created_at: "2026-08-05T10:00:00", course_start_date: "2026-08-05" },
      { id: "b", status: "Active", created_at: "2026-08-20T10:00:00", course_start_date: "2026-08-20" },
      { id: "c", status: "Active", created_at: "2026-10-02T10:00:00", course_start_date: "2026-10-02" },
      { id: "d", status: "Active", created_at: "2026-11-03T10:00:00", course_start_date: "2026-11-01" },
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

  it("new students use the real start date, not the registration date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12)); // Nov 2026
    tables.students = [
      // Registered in Bloom this month, but studying since 2024: not a new student of Nov 2026.
      { id: "old", status: "Active", created_at: "2026-11-05T10:00:00", course_start_date: "2024-03-10" },
      // Registered in July, started in September.
      { id: "late", status: "Active", created_at: "2026-07-20T10:00:00", course_start_date: "2026-09-01" },
      // Started on the first day of this month (local calendar date).
      { id: "first", status: "Active", created_at: "2026-11-02T10:00:00", course_start_date: "2026-11-01" },
      // Starts next month: not counted yet.
      { id: "future", status: "Active", created_at: "2026-11-08T10:00:00", course_start_date: "2026-12-01" },
      // No start date: not counted anywhere (no fallback to created_at), reported separately.
      { id: "nodate", status: "Active", created_at: "2026-11-06T10:00:00", course_start_date: null },
    ];

    const m = await fetchGrowthMetrics("t-1");
    // History starts at the earliest real start (2024), so every visible month has a real count.
    expect(m.history.newStudents).toEqual([0, 0, 0, 1, 0, 1]);
    expect(m.newStudentsThisMonth.value).toBe(1);
    expect(m.newStudentsThisMonth.change).toBeNull(); // October had 0 new students
    expect(m.newStudentsWithoutStartDate).toBe(1);
  });

  it("students without any start date give no value and no history", async () => {
    tables.students = [{ id: "x", status: "Active", created_at: "2026-11-06T10:00:00", course_start_date: null }];
    const m = await fetchGrowthMetrics("t-1");
    expect(m.newStudentsThisMonth.value).toBeNull();
    expect(m.history.newStudents.every((v) => v === null)).toBe(true);
    expect(m.newStudentsWithoutStartDate).toBe(1);
  });

  it("without any record every month is empty (never zero-filled)", async () => {
    const m = await fetchGrowthMetrics("t-1");
    expect(m.history.newStudents.every((v) => v === null)).toBe(true);
    expect(m.history.avgRevenuePerStudent.every((v) => v === null)).toBe(true);
    expect(m.history.monthlyGrowthRate.every((v) => v === null)).toBe(true);
  });
});

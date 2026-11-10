import { afterEach, describe, expect, it, vi } from "vitest";

// Brazil time zone: UTC parsing of a date-only value would move the 1st into the previous month.
process.env.TZ = "America/Sao_Paulo";

const db = vi.hoisted(() => ({
  students: [] as any[],
  calls: [] as { op: string; filters: [string, string, unknown][]; patch?: any }[],
  updateError: null as null | { message: string },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const call = { op: "select", filters: [] as [string, string, unknown][], patch: undefined as any };
      db.calls.push(call);
      const rows = () => (table === "students" ? db.students : []).filter((r) =>
        call.filters.every(([kind, col, val]) => (kind === "is" ? (r[col] ?? null) === val : r[col] === val)));
      const chain: any = {
        select: () => chain,
        update: (patch: any) => { call.op = "update"; call.patch = patch; return chain; },
        eq: (col: string, val: unknown) => { call.filters.push(["eq", col, val]); return chain; },
        neq: () => chain, in: () => chain, gte: () => chain, order: () => chain,
        is: (col: string, val: unknown) => { call.filters.push(["is", col, val]); return chain; },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => {
          if (call.op === "update") {
            if (db.updateError) return resolve({ data: null, error: db.updateError });
            rows().forEach((r) => Object.assign(r, call.patch));
            return resolve({ data: null, error: null });
          }
          return resolve({ data: table === "students" ? db.students : [], error: null });
        },
      };
      return chain;
    },
  },
}));
vi.mock("@/lib/finance-engine", () => ({ fetchTeacherReceivedInvoices: async () => [] }));

import { localMonthKey, studentStartDate, studentStartMonth, todayLocalDate } from "../src/lib/student-start-date";
import { saveConvertedStudentStartDate } from "../src/lib/converted-student-start-date";
import { fetchDashboardMetrics } from "../src/lib/dashboard-metrics";

afterEach(() => {
  vi.useRealTimers();
  db.students = [];
  db.calls = [];
  db.updateError = null;
});

describe("shared start-date interpretation", () => {
  it("reads the stored calendar date without any time-zone shift", () => {
    expect(studentStartDate("2026-11-01")).toBe("2026-11-01");
    expect(studentStartMonth("2026-11-01")).toBe("2026-11");
    expect(studentStartMonth("2026-11-01T00:00:00+00:00")).toBe("2026-11");
    expect(studentStartDate("2026-02-30")).toBeNull();
    expect(studentStartDate("")).toBeNull();
    expect(studentStartDate(null)).toBeNull();
    expect(localMonthKey(new Date(2026, 0, 31, 23, 30))).toBe("2026-01");
  });

  it("'Hoje' uses the local date, not the UTC one", () => {
    // 30 Nov 22:30 in São Paulo is already 1 Dec in UTC.
    expect(todayLocalDate(new Date(2026, 10, 30, 22, 30))).toBe("2026-11-30");
  });
});

describe("start date after a lead conversion", () => {
  it("stores the date on the created student and confirms it by reading back", async () => {
    db.students = [{ id: "s1", teacher_id: "t-1", course_start_date: null }];
    await expect(saveConvertedStudentStartDate("t-1", "s1", "2025-03-10")).resolves.toBe(true);
    expect(db.students[0].course_start_date).toBe("2025-03-10");
    const update = db.calls.find((c) => c.op === "update")!;
    expect(update.filters).toEqual([["eq", "id", "s1"], ["eq", "teacher_id", "t-1"], ["is", "course_start_date", null]]);
  });

  it("never overwrites an existing date and reports it as not saved", async () => {
    db.students = [{ id: "s1", teacher_id: "t-1", course_start_date: "2024-01-15" }];
    await expect(saveConvertedStudentStartDate("t-1", "s1", "2025-03-10")).resolves.toBe(false);
    expect(db.students[0].course_start_date).toBe("2024-01-15");
  });

  it("reports failure when the update fails or the date is invalid", async () => {
    db.students = [{ id: "s1", teacher_id: "t-1", course_start_date: null }];
    db.updateError = { message: "permission denied" };
    await expect(saveConvertedStudentStartDate("t-1", "s1", "2025-03-10")).resolves.toBe(false);
    db.updateError = null;
    await expect(saveConvertedStudentStartDate("t-1", "s1", "")).resolves.toBe(false);
    await expect(saveConvertedStudentStartDate("t-1", "other", "2025-03-10")).resolves.toBe(false);
  });
});

describe("Dashboard new students (active only, by real start)", () => {
  it("counts currently active students that started this month; never the registration date", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12)); // Nov 2026
    db.students = [
      { id: "a", status: "Active", created_at: "2026-11-05T10:00:00", course_start_date: "2026-11-01" }, // counts
      { id: "b", status: "Active", created_at: "2026-11-05T10:00:00", course_start_date: "2023-02-01" }, // old student, registered now
      { id: "c", status: "Inactive", created_at: "2026-11-02T10:00:00", course_start_date: "2026-11-03" }, // not active
      { id: "d", status: "Active", created_at: "2026-11-06T10:00:00", course_start_date: null }, // no start date
    ];
    const m = await fetchDashboardMetrics("t-1");
    expect(m.activeStudents).toBe(3);
    expect(m.activeStudentsTrend).toEqual({ value: "+1", positive: true });
  });

  it("shows no trend when nobody started before this month", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 10, 12));
    db.students = [
      { id: "a", status: "Active", created_at: "2026-11-05T10:00:00", course_start_date: "2026-11-02" },
      { id: "d", status: "Active", created_at: "2025-01-06T10:00:00", course_start_date: null },
    ];
    const m = await fetchDashboardMetrics("t-1");
    expect(m.activeStudentsTrend).toBeNull();
  });
});

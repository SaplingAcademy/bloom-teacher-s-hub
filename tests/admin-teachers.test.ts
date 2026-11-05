import { describe, expect, it } from "vitest";
import {
  canDowngradeToFree,
  computeAdminStats,
  filterAdminTeachers,
  isAdminOnlyError,
  isDowngradeBlockedError,
  matchesAdminSearch,
  type AdminTeacher,
} from "@/lib/admin";
import { FREE_PLAN_ACTIVE_STUDENT_LIMIT } from "@/lib/plans";

const teacher = (overrides: Partial<AdminTeacher>): AdminTeacher => ({
  teacher_id: "t1",
  full_name: "Ana Souza",
  email: "ana@example.com",
  plan: "free",
  created_at: "2026-01-10T00:00:00Z",
  active_students: 2,
  ...overrides,
});

describe("matchesAdminSearch", () => {
  it("matches by name or email, case-insensitive", () => {
    const t = teacher({});
    expect(matchesAdminSearch(t, "ANA")).toBe(true);
    expect(matchesAdminSearch(t, "example.com")).toBe(true);
    expect(matchesAdminSearch(t, "bruno")).toBe(false);
    expect(matchesAdminSearch(t, "  ")).toBe(true);
  });

  it("tolerates missing name/email", () => {
    const t = teacher({ full_name: null, email: null });
    expect(matchesAdminSearch(t, "ana")).toBe(false);
    expect(matchesAdminSearch(t, "")).toBe(true);
  });
});

describe("filterAdminTeachers", () => {
  const list = [
    teacher({ teacher_id: "a", full_name: "Ana", plan: "free" }),
    teacher({ teacher_id: "b", full_name: "Bruno", plan: "pro", email: "bruno@x.com" }),
  ];

  it("filters by plan", () => {
    expect(filterAdminTeachers(list, "", "pro").map((t) => t.teacher_id)).toEqual(["b"]);
    expect(filterAdminTeachers(list, "", "all")).toHaveLength(2);
  });

  it("combines search and plan filter", () => {
    expect(filterAdminTeachers(list, "bruno", "free")).toHaveLength(0);
    expect(filterAdminTeachers(list, "bruno", "pro")).toHaveLength(1);
  });
});

describe("computeAdminStats", () => {
  it("totals teachers by plan and active students", () => {
    const stats = computeAdminStats([
      teacher({ plan: "free", active_students: 3 }),
      teacher({ teacher_id: "b", plan: "pro", active_students: 7 }),
      teacher({ teacher_id: "c", plan: "pro", active_students: 0 }),
    ]);
    expect(stats).toEqual({
      totalTeachers: 3,
      freeTeachers: 1,
      proTeachers: 2,
      totalActiveStudents: 10,
    });
  });

  it("returns zeros for an empty list", () => {
    expect(computeAdminStats([])).toEqual({
      totalTeachers: 0,
      freeTeachers: 0,
      proTeachers: 0,
      totalActiveStudents: 0,
    });
  });
});

describe("canDowngradeToFree", () => {
  it("allows downgrade at or below the free limit", () => {
    expect(canDowngradeToFree({ active_students: FREE_PLAN_ACTIVE_STUDENT_LIMIT })).toBe(true);
    expect(canDowngradeToFree({ active_students: 0 })).toBe(true);
  });

  it("blocks downgrade above the free limit", () => {
    expect(canDowngradeToFree({ active_students: FREE_PLAN_ACTIVE_STUDENT_LIMIT + 1 })).toBe(false);
  });
});

describe("error markers", () => {
  it("recognizes ADMIN_ONLY and DOWNGRADE_BLOCKED markers", () => {
    expect(isAdminOnlyError({ message: "ADMIN_ONLY: negado" })).toBe(true);
    expect(isAdminOnlyError({ message: "outro erro" })).toBe(false);
    expect(
      isDowngradeBlockedError({ message: "DOWNGRADE_BLOCKED_ACTIVE_STUDENTS: ..." }),
    ).toBe(true);
    expect(isDowngradeBlockedError(null)).toBe(false);
  });
});

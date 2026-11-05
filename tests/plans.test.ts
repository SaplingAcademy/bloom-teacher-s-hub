import { describe, expect, it } from "vitest";
import {
  FREE_PLAN_ACTIVE_STUDENT_LIMIT,
  FREE_PLAN_LIMIT_ERROR_MARKER,
  canAccessAcademy,
  canAddActiveStudent,
  countActiveStudents,
  countsTowardActiveLimit,
  isFreePlanLimitError,
} from "@/lib/plans";

describe("countsTowardActiveLimit", () => {
  it("counts Active and Trial students toward the limit", () => {
    expect(countsTowardActiveLimit("Active")).toBe(true);
    expect(countsTowardActiveLimit("Trial")).toBe(true);
    expect(countsTowardActiveLimit("active")).toBe(true);
  });

  it("does not count Archived, Inactive or Paused students", () => {
    expect(countsTowardActiveLimit("Archived")).toBe(false);
    expect(countsTowardActiveLimit("Inactive")).toBe(false);
    expect(countsTowardActiveLimit("Paused")).toBe(false);
    expect(countsTowardActiveLimit(null)).toBe(false);
    expect(countsTowardActiveLimit(undefined)).toBe(false);
  });
});

describe("countActiveStudents", () => {
  it("counts only slot-occupying statuses", () => {
    expect(
      countActiveStudents(["Active", "Trial", "Archived", "Inactive", "Paused", "Active"]),
    ).toBe(3);
    expect(countActiveStudents([])).toBe(0);
  });
});

describe("canAddActiveStudent", () => {
  it("allows a free teacher below the limit to add an active student", () => {
    expect(canAddActiveStudent("free", FREE_PLAN_ACTIVE_STUDENT_LIMIT - 1, "Active")).toBe(true);
  });

  it("blocks a free teacher at the limit from adding an active or trial student", () => {
    expect(canAddActiveStudent("free", FREE_PLAN_ACTIVE_STUDENT_LIMIT, "Active")).toBe(false);
    expect(canAddActiveStudent("free", FREE_PLAN_ACTIVE_STUDENT_LIMIT, "Trial")).toBe(false);
  });

  it("never blocks archived/inactive additions, even at the limit", () => {
    expect(canAddActiveStudent("free", FREE_PLAN_ACTIVE_STUDENT_LIMIT, "Archived")).toBe(true);
    expect(canAddActiveStudent("free", FREE_PLAN_ACTIVE_STUDENT_LIMIT, "Inactive")).toBe(true);
  });

  it("never blocks pro teachers", () => {
    expect(canAddActiveStudent("pro", 99, "Active")).toBe(true);
  });

  it("does not block when the plan is unknown — the database trigger decides", () => {
    expect(canAddActiveStudent(null, 99, "Active")).toBe(true);
  });
});

describe("canAccessAcademy", () => {
  it("allows pro teachers and super admins", () => {
    expect(canAccessAcademy("pro", false)).toBe(true);
    expect(canAccessAcademy("free", true)).toBe(true);
    expect(canAccessAcademy("pro", true)).toBe(true);
  });

  it("blocks free teachers and unknown plans without admin role", () => {
    expect(canAccessAcademy("free", false)).toBe(false);
    expect(canAccessAcademy(null, false)).toBe(false);
  });
});

describe("isFreePlanLimitError", () => {
  it("recognizes the database trigger rejection by its stable marker", () => {
    expect(
      isFreePlanLimitError({ message: `${FREE_PLAN_LIMIT_ERROR_MARKER}: limite atingido` }),
    ).toBe(true);
    expect(isFreePlanLimitError({ details: `hint ${FREE_PLAN_LIMIT_ERROR_MARKER}` })).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isFreePlanLimitError({ message: "duplicate key value" })).toBe(false);
    expect(isFreePlanLimitError(null)).toBe(false);
    expect(isFreePlanLimitError("FREE_PLAN_ACTIVE_STUDENT_LIMIT")).toBe(false);
  });
});

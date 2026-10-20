import { describe, expect, test } from "bun:test";
import { expectedClassAttendees, isAttendanceComplete } from "../src/lib/attendance-recorded";
import { buildContractItems } from "../src/lib/daily-priorities";

describe("attendance_recorded derivation", () => {
  test("individual: recorded only when the student has a record; clearing reverts", () => {
    expect(isAttendanceComplete(["s1"], ["s1"])).toBe(true);
    expect(isAttendanceComplete(["s1"], [])).toBe(false);
  });
  test("class: complete only when every member on that date is recorded", () => {
    const members = [
      { student_id: "a", joined_at: "2026-01-01", left_at: null },
      { student_id: "b", joined_at: "2026-01-01", left_at: null },
      { student_id: "late", joined_at: "2026-11-01", left_at: null },
      { student_id: "gone", joined_at: "2026-01-01", left_at: "2026-10-01" },
      { student_id: "ended-after", joined_at: "2026-01-01", left_at: "2026-10-20" },
    ];
    const expected = expectedClassAttendees(members, "2026-10-15");
    expect(expected.sort()).toEqual(["a", "b", "ended-after"]);
    expect(isAttendanceComplete(expected, ["a", "b"])).toBe(false);
    expect(isAttendanceComplete(expected, ["a", "b", "ended-after"])).toBe(true);
  });
  test("class with no members is never marked recorded", () => {
    expect(isAttendanceComplete([], [])).toBe(false);
  });
});

describe("contract priorities", () => {
  test("successful empty query yields an empty category", () => {
    expect(buildContractItems([], "2026-10-20")).toEqual([]);
  });
  test("ended fixed contract is critical", () => {
    const items = buildContractItems([{ id: "sp1", student_id: "s1", ended_at: "2026-10-19", student: { full_name: "Ana", status: "Active" } }], "2026-10-20");
    expect(items[0].urgency).toBe("critical");
    expect(items[0].reason).toBe("contract_ended");
  });
});

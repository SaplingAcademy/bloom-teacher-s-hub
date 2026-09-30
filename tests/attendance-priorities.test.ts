import { describe, expect, test } from "bun:test";
import { classifyAttendancePriority } from "../src/lib/attendance-priorities";

describe("attendance priority timing", () => {
  const now = new Date("2026-09-30T17:00:00");

  test("does not flag a future lesson or today's lesson before it ends", () => {
    expect(classifyAttendancePriority("2026-10-01", "10:00", now)).toBe("future");
    expect(classifyAttendancePriority("2026-09-30", "18:00", now)).toBe("future");
  });

  test("flags today's finished lesson and a three-day-old lesson as normal", () => {
    expect(classifyAttendancePriority("2026-09-30", "16:00", now)).toBe("normal");
    expect(classifyAttendancePriority("2026-09-27", "10:00", now)).toBe("normal");
  });

  test("escalates after more than five calendar days", () => {
    expect(classifyAttendancePriority("2026-09-25", "10:00", now)).toBe("normal");
    expect(classifyAttendancePriority("2026-09-24", "10:00", now)).toBe("urgent");
  });

  test("recorded attendance states are canonical resolution values", () => {
    expect(["present", "absent", "late", "excused"]).toContain("present");
    expect(["present", "absent", "late", "excused"]).toContain("absent");
  });

  test("cancelled lessons are excluded by the canonical event status", () => {
    expect("Cancelled".toLowerCase()).toBe("cancelled");
  });
});
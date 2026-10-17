import { describe, expect, it } from "vitest";
import { weekDropPosition } from "../src/hooks/use-week-lesson-drag";

describe("week-view drop coordinates", () => {
  it("Tuesday 14:00 dragged to Thursday 16:00 resolves the Thursday slot", () => {
    expect(weekDropPosition("2026-10-22", "16:00", 200, 200, 64)).toEqual({ date: "2026-10-22", startTime: "16:00" });
  });
  it("same-day vertical move resolves 16:00 without changing the date", () => {
    expect(weekDropPosition("2026-10-20", "16:00", 200, 200, 64)).toEqual({ date: "2026-10-20", startTime: "16:00" });
  });
  it("maps an hour cell to quarter-hour positions without crossing into the next hour", () => {
    expect(weekDropPosition("2026-10-22", "16:00", 232, 200, 64).startTime).toBe("16:30");
    expect(weekDropPosition("2026-10-22", "16:00", 264, 200, 64).startTime).toBe("16:45");
  });
});
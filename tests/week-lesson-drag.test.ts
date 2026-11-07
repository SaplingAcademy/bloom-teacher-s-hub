import { describe, expect, it } from "vitest";
import { weekDropPosition } from "../src/hooks/use-week-lesson-drag";
import { weekLessonPreviewTimeRange } from "../src/components/bloom/WeekLessonDragPreview";

describe("week-view drop coordinates", () => {
  it("never shows a wrapped next-day time in the drag card", () => {
    expect(weekLessonPreviewTimeRange("23:00", 45)).toBe("23:00–23:45");
    expect(weekLessonPreviewTimeRange("23:00", 60)).toBe("23:00");
    expect(weekLessonPreviewTimeRange("23:45", 60)).toBe("23:45");
  });
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
  it.each(["21:00", "22:00", "23:00"])("preserves every quarter-hour in the %s row", (hour) => {
    expect([0, 16, 32, 48, 64].map(offset => weekDropPosition("2026-11-07", hour, 200 + offset, 200, 64).startTime))
      .toEqual(["00", "15", "30", "45", "45"].map(minutes => `${hour.slice(0, 2)}:${minutes}`));
  });
});
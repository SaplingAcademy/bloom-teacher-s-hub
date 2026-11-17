import { describe, expect, it } from "vitest";
import { weekDropPosition } from "../src/hooks/use-week-lesson-drag";
import { weekLessonPreviewTimeRange } from "../src/components/bloom/WeekLessonDragPreview";

describe("week-view drop coordinates", () => {
  it("never shows a wrapped next-day time in the drag card", () => {
    expect(weekLessonPreviewTimeRange("23:00", 45)).toBe("23:00–23:45");
    expect(weekLessonPreviewTimeRange("23:00", 60)).toBe("23:00");
    expect(weekLessonPreviewTimeRange("23:45", 60)).toBe("23:45");
  });
  // Quarter-hour slots are 13.5px apart on the compact 54px rows, below the cell's 4px padding.
  const top = 200;
  const cardAt = (minutes: number) => top + 4 + (minutes / 60) * 54;
  it("Tuesday 14:00 dragged to Thursday 16:00 resolves the Thursday slot", () => {
    expect(weekDropPosition("2026-10-22", "16:00", cardAt(0), top)).toEqual({ date: "2026-10-22", startTime: "16:00" });
  });
  it("same-day vertical move resolves 16:00 without changing the date", () => {
    expect(weekDropPosition("2026-10-20", "16:00", cardAt(0), top)).toEqual({ date: "2026-10-20", startTime: "16:00" });
  });
  it("maps the card's top edge to quarter-hour positions without crossing into the next hour", () => {
    expect(weekDropPosition("2026-10-22", "16:00", cardAt(30), top).startTime).toBe("16:30");
    expect(weekDropPosition("2026-10-22", "16:00", cardAt(45), top).startTime).toBe("16:45");
    expect(weekDropPosition("2026-10-22", "16:00", cardAt(60), top).startTime).toBe("16:45");
  });
  it.each(["21:00", "22:00", "23:00"])("preserves every quarter-hour in the %s row", (hour) => {
    expect([0, 15, 30, 45, 60].map(minutes => weekDropPosition("2026-11-07", hour, cardAt(minutes), top).startTime))
      .toEqual(["00", "15", "30", "45", "45"].map(minutes => `${hour.slice(0, 2)}:${minutes}`));
  });
});

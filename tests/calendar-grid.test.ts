import { describe, expect, it } from "vitest";
import { calendarGridHours } from "../src/lib/calendar-grid";

describe("Calendar full-day endpoint", () => {
  it("includes 21h, 22h and the entire 23h row without needing events or availability", () => {
    expect(calendarGridHours()).toEqual(Array.from({ length: 16 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`));
  });
  it("keeps early lessons visible with a continuous range ending at 23h", () => {
    expect(calendarGridHours([{ startTime: "06:15:00" }, { startTime: "23:59" }])).toEqual(
      Array.from({ length: 18 }, (_, index) => `${String(index + 6).padStart(2, "0")}:00`),
    );
  });
});
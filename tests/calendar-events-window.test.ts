import { describe, expect, it } from "vitest";
import { calendarEventsWindow } from "../src/lib/calendar-events-window";

describe("calendarEventsWindow", () => {
  it("spans previous month start to next month end", () => {
    expect(calendarEventsWindow(new Date(2026, 9, 24))).toEqual({ start: "2026-09-01", end: "2026-11-30" });
  });
  it("crosses year boundaries", () => {
    expect(calendarEventsWindow(new Date(2026, 0, 15))).toEqual({ start: "2025-12-01", end: "2026-02-28" });
    expect(calendarEventsWindow(new Date(2026, 11, 31))).toEqual({ start: "2026-11-01", end: "2027-01-31" });
  });
});

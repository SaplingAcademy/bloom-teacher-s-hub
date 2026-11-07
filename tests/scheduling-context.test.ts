import { describe, expect, it } from "vitest";
import { lessonSlotDefaults } from "@/lib/scheduling-context";
describe("Calendar scheduling context", () => {
  it("preserves clicked date and time while keeping the existing duration", () => {
    expect(lessonSlotDefaults({ date: "2026-10-21", startTime: "14:00" }, "2026-10-19", 75))
      .toEqual({ date: "2026-10-21", startTime: "14:00", endTime: "15:15" });
  });
  it("preserves date-only clicks and normal lesson time defaults", () => {
    expect(lessonSlotDefaults({ date: "2026-10-25" }, "2026-10-19", 60))
      .toEqual({ date: "2026-10-25", startTime: "09:00", endTime: "10:00" });
  });
  it("uses normal defaults when the header has cleared slot context", () => {
    expect(lessonSlotDefaults(null, "2026-10-19", 60))
      .toEqual({ date: "2026-10-19", startTime: "09:00", endTime: "10:00" });
  });
  it("does not wrap a late slot's end time into the following day", () => {
    expect(lessonSlotDefaults({ date: "2026-10-21", startTime: "23:30" }, "2026-10-19", 60).endTime).toBe("");
  });
  it.each([["21:00", 60, "22:00"], ["22:00", 60, "23:00"], ["23:00", 45, "23:45"], ["23:00", 59, "23:59"], ["23:00", 60, ""]] as const)(
    "prefills %s with the existing %i-minute duration without midnight rollover", (startTime, duration, endTime) => {
      expect(lessonSlotDefaults({ date: "2026-11-07", startTime }, "2026-11-06", duration))
        .toEqual({ date: "2026-11-07", startTime, endTime });
    },
  );
});
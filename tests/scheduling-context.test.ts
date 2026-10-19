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
});
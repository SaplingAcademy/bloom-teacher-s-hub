import { describe, it, expect } from "vitest";
import { rescheduledOriginal, lessonSequenceMap } from "./lesson-order";

describe("rescheduledOriginal", () => {
  it("shows original when date changed", () => {
    expect(rescheduledOriginal({ scheduled_date: "2026-10-14", start_time: "10:00:00", original_date: "2026-10-13", original_start_time: "10:00:00" }))
      .toEqual({ date: "2026-10-13", time: "10:00" });
  });
  it("hides when moved back to original slot", () => {
    expect(rescheduledOriginal({ scheduled_date: "2026-10-12", start_time: "09:00:00", original_date: "2026-10-12", original_start_time: "09:00" })).toBeNull();
  });
});

describe("lessonSequenceMap", () => {
  it("numbers by current date", () => {
    const m = lessonSequenceMap([
      { event_id: "a", scheduled_date: "2026-10-10", start_time: "10:00" },
      { event_id: "b", scheduled_date: "2026-10-15", start_time: "10:00" },
      { event_id: "c", scheduled_date: "2026-10-14", start_time: "10:00" },
      { event_id: "d", scheduled_date: "2026-10-16", start_time: "10:00" },
    ]);
    expect([m.get("a"), m.get("c"), m.get("b"), m.get("d")]).toEqual([1, 2, 3, 4]);
  });
});

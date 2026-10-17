import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { generateOccurrences, matchOccurrencesToEvents } from "../src/lib/lesson-plans";

const mon = { weekday: "Monday", startTime: "18:00", duration: 60, scheduleId: "s-mon" };
const wed = { weekday: "Wednesday", startTime: "18:00", duration: 90, scheduleId: "s-wed" };

describe("class lesson plan generation", () => {
  it("uses the schedule start + duration, deriving the end time", () => {
    const out = generateOccurrences("2026-10-19", [mon], 2); // 2026-10-19 is a Monday
    expect(out.map((o) => [o.date, o.start_time, o.end_time, o.schedule_id])).toEqual([
      ["2026-10-19", "18:00:00", "19:00:00", "s-mon"],
      ["2026-10-26", "18:00:00", "19:00:00", "s-mon"],
    ]);
  });

  it("alternates multiple weekly schedules chronologically", () => {
    const out = generateOccurrences("2026-10-19", [wed, mon], 4);
    expect(out.map((o) => [o.date, o.end_time, o.schedule_id])).toEqual([
      ["2026-10-19", "19:00:00", "s-mon"],
      ["2026-10-21", "19:30:00", "s-wed"],
      ["2026-10-26", "19:00:00", "s-mon"],
      ["2026-10-28", "19:30:00", "s-wed"],
    ]);
  });

  it("skips vacations without consuming a lesson number", () => {
    const vacation = [{ id: "v", start_date: "2026-10-20", end_date: "2026-10-27" } as any];
    const out = generateOccurrences("2026-10-19", [mon, wed], 3, vacation);
    expect(out.map((o) => o.date)).toEqual(["2026-10-19", "2026-10-28", "2026-11-02"]);
  });

  it("links only occurrences of this generation, ignoring unrelated events", () => {
    const occ = generateOccurrences("2026-10-19", [mon], 2);
    const events = [
      { id: "old", date: "2026-09-01", start_time: "10:00:00" },
      { id: "a", date: "2026-10-19", start_time: "18:00:00" },
      { id: "b", date: "2026-10-29", start_time: "15:00:00", rescheduled_at: "x", original_date: "2026-10-26", original_start_time: "18:00:00" },
    ];
    expect(matchOccurrencesToEvents(occ, events).map((m) => m.event.id)).toEqual(["a", "b"]);
  });
});

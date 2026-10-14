import { describe, it, expect } from "vitest";
import {
  getWorkingSegments,
  isSlotAvailable,
  type TeacherAvailabilitySnapshot,
} from "../src/lib/teacher-availability";

const base: TeacherAvailabilitySnapshot = {
  teacherId: "t1",
  days: [
    { day: "Monday", enabled: true, startTime: "09:00", endTime: "18:00" },
    { day: "Tuesday", enabled: true, startTime: "14:00", endTime: "20:00" },
  ],
  restBlocks: [{ day: "Monday", startTime: "12:00", endTime: "13:00", label: "Almoço" }],
  timeOff: [],
  defaultDuration: 60,
  timezone: "America/Sao_Paulo",
  isConfigured: true,
  fetchedAt: 0,
};

// 2026-10-19 = Monday, 2026-10-20 = Tuesday
describe("reschedule working-availability validation", () => {
  it("lesson fully inside working hours → allowed", () => {
    expect(isSlotAvailable(base, "2026-10-19", "17:00", "18:00").available).toBe(true);
  });
  it("lesson starting before availability → rejected", () => {
    const r = isSlotAvailable(base, "2026-10-19", "08:30", "09:30");
    expect(r.available).toBe(false);
    expect(r.reason?.kind).toBe("outside_hours");
  });
  it("lesson ending after availability → rejected", () => {
    const r = isSlotAvailable(base, "2026-10-19", "17:30", "18:30");
    expect(r.available).toBe(false);
    expect(r.reason?.kind).toBe("outside_hours");
  });
  it("lesson overlapping a rest block → rejected", () => {
    const r = isSlotAvailable(base, "2026-10-19", "12:30", "13:30");
    expect(r.available).toBe(false);
    expect(r.reason?.kind).toBe("rest_block");
  });
  it("different weekday availability is respected", () => {
    // Tuesday starts at 14:00 — 09:00–10:00 is fine on Monday but not Tuesday
    expect(isSlotAvailable(base, "2026-10-20", "09:00", "10:00").available).toBe(false);
    expect(isSlotAvailable(base, "2026-10-20", "14:00", "15:00").available).toBe(true);
  });
  it("free segments exclude rest blocks", () => {
    expect(getWorkingSegments(base, "Monday")).toEqual([
      { start: 540, end: 720 },
      { start: 780, end: 1080 },
    ]);
  });
});

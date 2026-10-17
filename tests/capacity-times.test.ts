import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { buildCapacityDays } from "@/lib/capacity-engine";
import type { TeacherAvailabilitySnapshot } from "@/lib/teacher-availability";
const snapshot: TeacherAvailabilitySnapshot = {
  teacherId: "teacher", days: [
    { day: "Monday", enabled: true, startTime: "14:00", endTime: "18:00" },
    { day: "Wednesday", enabled: true, startTime: "14:00", endTime: "18:00" },
  ], restBlocks: [{ id: "rest", day: "Monday", startTime: "15:00", endTime: "16:00" }],
  timeOff: [], defaultDuration: 60, timezone: "America/Sao_Paulo", isConfigured: true, fetchedAt: 0,
};
const student = { id: "s1", weekday: "Monday", start_time: "16:00:00", end_time: "17:00:00" };
const monday = (days: ReturnType<typeof buildCapacityDays>) => days.find((d) => d.day === "Monday");
describe("Growth shared capacity times", () => {
  it("returns actual 14:00–15:00 and 17:00–18:00 slots after breaks and student lessons; count equals visible slots", () => {
    const day = monday(buildCapacityDays(snapshot, [student], [], [], "2026-10-19"));
    expect(day?.availableSlots).toEqual([{ startTime: "14:00", endTime: "15:00" }, { startTime: "17:00", endTime: "18:00" }]);
    expect(day?.remainingSlots).toBe(2);
  });
  it("considers every class schedule and partial overlaps, not one occupied unit per class", () => {
    const schedules = [
      { id: "c1", weekday: "Monday", start_time: "14:30", end_time: "15:00", duration: 30 },
      { id: "c2", weekday: "Wednesday", start_time: "14:00", end_time: "16:00", duration: 120 },
    ];
    const days = buildCapacityDays(snapshot, [student], schedules, [], "2026-10-19");
    expect(monday(days)?.availableSlots).toEqual([{ startTime: "17:00", endTime: "18:00" }]);
    expect(days.find((d) => d.day === "Wednesday")?.remainingSlots).toBe(2);
  });
  it("shows no times and zero count on a vacation date", () => {
    const withVacation = { ...snapshot, timeOff: [{ id: "off", teacherId: "teacher", startDate: "2026-10-19", endDate: "2026-10-19", type: "Férias" as const, createdAt: "" }] };
    const day = monday(buildCapacityDays(withVacation, [], [], [], "2026-10-19"));
    expect(day?.availableSlots).toEqual([]);
    expect(day?.remainingSlots).toBe(0);
  });
  it("uses moved occurrence rather than blocking its original recurring time, without double counting", () => {
    const days = buildCapacityDays(snapshot, [student], [], [{ id: "moved", date: "2026-10-21", original_date: "2026-10-19", schedule_id: "s1", start_time: "17:00", end_time: "18:00", status: "Scheduled" }], "2026-10-19");
    expect(monday(days)?.availableSlots.map((s) => s.startTime)).toEqual(["14:00", "16:00", "17:00"]);
    expect(days.find((d) => d.day === "Wednesday")?.remainingSlots).toBe(3);
  });
  it("a fully booked day returns no available times and cancelled occurrences free their recurring slot", () => {
    const full = { id: "full", weekday: "Wednesday", start_time: "14:00", end_time: "18:00", duration: 240 };
    expect(buildCapacityDays(snapshot, [], [full], [], "2026-10-19").find((d) => d.day === "Wednesday")?.remainingSlots).toBe(0);
    expect(monday(buildCapacityDays(snapshot, [student], [], [{ id: "cancel", date: "2026-10-19", schedule_id: "s1", start_time: "16:00", end_time: "17:00", status: "Cancelled" }], "2026-10-19"))?.remainingSlots).toBe(3);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
const { query, client } = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ["update", "insert", "delete", "eq", "select"]) query[method] = vi.fn(() => query);
  query.single = vi.fn(async () => ({ data: { id: "custom-1" }, error: null }));
  const client = { from: vi.fn(() => query), rpc: vi.fn() };
  return { query, client };
});
vi.mock("@/lib/supabase", () => ({ supabase: client }));
import { CUSTOM_EVENT_CATEGORIES, customEventPayload, deleteCustomEvent, moveCustomEvent, saveCustomEvent } from "@/lib/custom-calendar-events";
import { buildCapacityDays } from "@/lib/capacity-engine";
import type { TeacherAvailabilitySnapshot } from "@/lib/teacher-availability";
const input = { title: "Consulta médica", category: "appointment", date: "2026-10-20", startTime: "14:00", endTime: "15:00", locationLink: "", notes: "" };
beforeEach(() => vi.clearAllMocks());
describe("one-time custom Calendar events", () => {
  it("uses exactly the requested categories, not structural event types", () => {
    expect(CUSTOM_EVENT_CATEGORIES).toEqual(["appointment", "meeting", "personal", "blocked", "other"]);
  });
  it("inserts a custom event without student/class schedules or recurrence", async () => {
    await saveCustomEvent("teacher", input);
    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ event_type: "custom", student_id: null, class_id: null, schedule_id: null, class_schedule_id: null, is_recurring: false, duration: 60, title: "Consulta médica" }));
  });
  it("edits only the existing owner-scoped custom occurrence", async () => {
    await saveCustomEvent("teacher", { ...input, title: "Reunião" }, "custom-1");
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ title: "Reunião" }));
    expect(query.eq.mock.calls).toEqual([["teacher_id", "teacher"], ["event_type", "custom"], ["id", "custom-1"]]);
    expect(query.insert).not.toHaveBeenCalled();
  });
  it("moves date/start/end directly without academic history or lesson RPC", async () => {
    await moveCustomEvent("teacher", "custom-1", "2026-10-21", "16:00", 60);
    expect(query.update).toHaveBeenCalledWith({ date: "2026-10-21", start_time: "16:00", end_time: "17:00", duration: 60 });
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("calendar_events");
    expect(client.rpc).not.toHaveBeenCalled();
    expect(query.eq.mock.calls).toEqual([["teacher_id", "teacher"], ["event_type", "custom"], ["id", "custom-1"]]);
  });
  it("deletes only the owner-scoped custom event", async () => {
    await deleteCustomEvent("teacher", "custom-1");
    expect(query.delete).toHaveBeenCalledOnce();
    expect(query.eq.mock.calls).toEqual([["teacher_id", "teacher"], ["event_type", "custom"], ["id", "custom-1"]]);
  });
  it("rejects malformed or reversed intervals before saving", async () => {
    expect(() => customEventPayload({ ...input, endTime: "13:00" })).toThrow("invalidInterval");
    expect(() => customEventPayload({ ...input, date: "2026-02-30" })).toThrow("invalidInterval");
    await expect(moveCustomEvent("teacher", "custom-1", "2026-10-20", "23:30", 60)).rejects.toThrow("invalidInterval");
    expect(query.update).not.toHaveBeenCalled();
  });
});
const snapshot: TeacherAvailabilitySnapshot = { teacherId: "teacher", days: [{ day: "Tuesday", enabled: true, startTime: "14:00", endTime: "16:00" }], restBlocks: [], timeOff: [], defaultDuration: 60, timezone: "America/Sao_Paulo", isConfigured: true, fetchedAt: 0 };
const event = { id: "custom-1", date: "2026-10-20", start_time: "14:00", end_time: "15:00", duration: 60, status: "Scheduled" };
describe("custom events use existing canonical capacity", () => {
  it("Consulta médica Tuesday 14:00–15:00 removes that teaching slot", () => {
    const day = buildCapacityDays(snapshot, [], [], [event], "2026-10-19").find((day) => day.day === "Tuesday");
    expect(day?.availableSlots).toEqual([{ startTime: "15:00", endTime: "16:00" }]);
    expect(day?.occupiedSlots).toBe(1);
  });
  it("cancelled events do not occupy time", () => {
    const day = buildCapacityDays(snapshot, [], [], [{ ...event, status: "Cancelled" }], "2026-10-19").find((day) => day.day === "Tuesday");
    expect(day?.occupiedSlots).toBe(0);
    expect(day?.remainingSlots).toBe(2);
  });
});
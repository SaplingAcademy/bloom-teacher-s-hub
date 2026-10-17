import { describe, it, expect, vi, beforeEach } from "vitest";
const db: any = {};
const calls: any[] = [];
let rpcFail = false;
let available = true;
function q(table: string) {
  const f: any[] = []; let mode = "select";
  const b: any = {
    select: () => b, eq: (k: string, v: any) => (f.push([k, v, "eq"]), b), neq: (k: string, v: any) => (f.push([k, v, "neq"]), b),
    update: () => { mode = "update"; calls.push(["update", table]); return b; },
    maybeSingle: async () => ({ data: db[table].find((r: any) => f.every(([k, v, o]) => o === "eq" ? r[k] === v : r[k] !== v)) ?? null, error: null }),
    then: (res: any) => res({ data: db[table].filter((r: any) => f.every(([k, v, o]) => o === "eq" ? r[k] === v : r[k] !== v)), error: null }),
  };
  return b;
}
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: "t1" } } }) },
  from: (t: string) => q(t),
  rpc: async (name: string, a: any) => {
    calls.push(["rpc", name]);
    if (rpcFail) return { error: { message: "boom" } };
    const e = db.calendar_events.find((r: any) => r.id === a.p_event_id);
    if (!e.original_date) { e.original_date = e.date; e.original_start_time = e.start_time; }
    Object.assign(e, { date: a.p_new_date, start_time: a.p_new_start_time, end_time: a.p_new_end_time, rescheduled_at: "now" });
    const p = db.lesson_plans.find((r: any) => r.event_id === e.id);
    Object.assign(p, { scheduled_date: a.p_new_date, start_time: a.p_new_start_time });
    return { error: null };
  },
}}));
vi.mock("@/lib/time-off-engine", () => ({ fetchTeacherTimeOff: async () => [], checkDateIsNonWorking: () => false }));
vi.mock("@/lib/teacher-availability", () => ({
  getTeacherAvailability: async () => ({ isConfigured: true }),
   isSlotAvailable: () => ({ available }),
}));
import { rescheduleOccurrence } from "@/lib/reschedule-occurrence";
beforeEach(() => {
  calls.length = 0; rpcFail = false; available = true;
  db.calendar_events = [{ id: "e1", teacher_id: "t1", date: "2026-10-05", start_time: "09:00:00", end_time: "10:00:00", duration: 60, status: "Scheduled" }];
  db.lesson_plans = [{ id: "p1", event_id: "e1", scheduled_date: "2026-10-05", start_time: "09:00:00" }];
});
describe("reschedule via RPC", () => {
  it.each(["student", "class"])("moves one %s occurrence Tuesday 14:00 → Thursday 16:00, retaining duration and next week", async (kind) => {
    Object.assign(db.calendar_events[0], { date: "2026-10-20", start_time: "14:00:00", end_time: "14:45:00", duration: 45, student_id: kind === "student" ? "s1" : null, class_id: kind === "class" ? "c1" : null });
    const next = { ...db.calendar_events[0], id: "e2", date: "2026-10-27" };
    db.calendar_events.push(next);
    const before = { ...next };
    expect((await rescheduleOccurrence("e1", "2026-10-22", "16:00")).ok).toBe(true);
    expect(db.calendar_events[0]).toMatchObject({ id: "e1", date: "2026-10-22", start_time: "16:00:00", end_time: "16:45:00" });
    expect(next).toEqual(before);
    expect(calls).toEqual([["rpc", "reschedule_calendar_occurrence"]]);
  });
  it("allows a same-day 14:00 → 16:00 move", async () => {
    Object.assign(db.calendar_events[0], { start_time: "14:00:00", end_time: "15:00:00" });
    expect((await rescheduleOccurrence("e1", "2026-10-05", "16:00")).ok).toBe(true);
    expect(db.calendar_events[0]).toMatchObject({ date: "2026-10-05", start_time: "16:00:00", end_time: "17:00:00" });
  });
  it("conflict rejection leaves the original occurrence untouched", async () => {
    db.calendar_events.push({ id: "other", teacher_id: "t1", date: "2026-10-06", start_time: "16:00:00", end_time: "17:00:00", status: "Scheduled" });
    const before = { ...db.calendar_events[0] };
    expect(await rescheduleOccurrence("e1", "2026-10-06", "16:00")).toMatchObject({ ok: false, reason: "conflict" });
    expect(db.calendar_events[0]).toEqual(before);
    expect(calls).toEqual([]);
  });
  it("outside-working-hours rejection leaves the original occurrence untouched", async () => {
    available = false;
    const before = { ...db.calendar_events[0] };
    expect(await rescheduleOccurrence("e1", "2026-10-06", "16:00")).toMatchObject({ ok: false, reason: "outside_working_hours" });
    expect(db.calendar_events[0]).toEqual(before);
    expect(calls).toEqual([]);
  });
  it.each(["Completed", "Closed", "Cancelled"])("rejects locked %s without saving", async (status) => {
    db.calendar_events[0].status = status;
    expect(await rescheduleOccurrence("e1", "2026-10-06", "16:00")).toMatchObject({ ok: false, reason: "locked" });
    expect(db.calendar_events[0].date).toBe("2026-10-05");
    expect(calls).toEqual([]);
  });
  it("X→Y uses one RPC, no direct updates, moves both", async () => {
    const r = await rescheduleOccurrence("e1", "2026-10-06", "11:00");
    expect(r.ok).toBe(true);
    expect(calls).toEqual([["rpc", "reschedule_calendar_occurrence"]]);
    expect(db.calendar_events[0].date).toBe("2026-10-06");
    expect(db.lesson_plans[0].scheduled_date).toBe("2026-10-06");
  });
  it("Y→Z preserves original X", async () => {
    await rescheduleOccurrence("e1", "2026-10-06", "11:00");
    await rescheduleOccurrence("e1", "2026-10-07", "14:00");
    expect(db.calendar_events[0].original_date).toBe("2026-10-05");
    expect(db.calendar_events[0].original_start_time).toBe("09:00:00");
  });
  it("failed RPC leaves both untouched", async () => {
    rpcFail = true;
    const r = await rescheduleOccurrence("e1", "2026-10-06", "11:00");
    expect(r).toMatchObject({ ok: false, reason: "save_failed" });
    expect(db.calendar_events[0].date).toBe("2026-10-05");
    expect(db.lesson_plans[0].scheduled_date).toBe("2026-10-05");
    expect(calls.filter((c) => c[0] === "update")).toHaveLength(0);
  });
});

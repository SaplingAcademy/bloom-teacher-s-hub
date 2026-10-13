import { describe, it, expect, vi, beforeEach } from "vitest";
const db: any = {};
const calls: any[] = [];
let rpcFail = false;
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
import { rescheduleOccurrence } from "@/lib/reschedule-occurrence";
beforeEach(() => {
  calls.length = 0; rpcFail = false;
  db.calendar_events = [{ id: "e1", teacher_id: "t1", date: "2026-10-05", start_time: "09:00:00", end_time: "10:00:00", duration: 60, status: "Scheduled" }];
  db.lesson_plans = [{ id: "p1", event_id: "e1", scheduled_date: "2026-10-05", start_time: "09:00:00" }];
});
describe("reschedule via RPC", () => {
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

import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: {} as Record<string, any[]>, queries: [] as { table: string; filters: [string, string, unknown][] }[], fail: "" }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from(table: string) {
    const query = { table, filters: [] as [string, string, unknown][] };
    db.queries.push(query);
    let from = 0, to = Infinity;
    const builder: any = {
      select() { return builder; },
      eq(column: string, value: unknown) { query.filters.push(["eq", column, value]); return builder; },
      in(column: string, value: unknown[]) { query.filters.push(["in", column, value]); return builder; },
      order() { return builder; },
      range(start: number, end: number) { from = start; to = end; return builder; },
      then(resolve: any, reject: any) {
        const data = (db.rows[table] ?? []).filter((row) => query.filters.every(([op, column, value]) => op === "eq" ? row[column] === value : (value as unknown[]).includes(row[column]))).slice(from, to + 1);
        return Promise.resolve(db.fail === table ? { data: null, error: { message: "History unavailable" } } : { data, error: null }).then(resolve, reject);
      },
    };
    return builder;
  },
} }));
import { fetchLeadAutomationActivity } from "@/lib/lead-interactions";

const conversion = { id: "conversion", teacher_id: "teacher-1", automation_event_id: "event-1", action_type: "lead_converted", target_table: "students", target_id: "student-1", description: "Converted", created_at: "2026-11-05T00:00:00Z" };
beforeEach(() => {
  db.fail = ""; db.queries = [];
  db.rows = {
    automation_events: [{ id: "event-1", teacher_id: "teacher-1", source_table: "leads", source_id: "lead-1", event_type: "lead.converted" }],
    automation_activity: [conversion],
  };
});
describe("Original-lead conversion history", () => {
  it("shows the old student-targeted conversion through the original-lead event", async () => {
    expect((await fetchLeadAutomationActivity("teacher-1", "lead-1")).map((a) => a.id)).toEqual(["conversion"]);
    expect(db.queries.find((q) => q.table === "automation_events")?.filters).toContainEqual(["eq", "source_id", "lead-1"]);
  });
  it("never imports another lead's conversion or another teacher's events", async () => {
    db.rows.automation_events.push({ ...db.rows.automation_events[0], id: "other-event", source_id: "lead-2" }, { ...db.rows.automation_events[0], id: "other-teacher-event", teacher_id: "teacher-2" });
    db.rows.automation_activity.push({ ...conversion, id: "other-conversion", automation_event_id: "other-event" }, { ...conversion, id: "private-conversion", automation_event_id: "other-teacher-event", teacher_id: "teacher-2" });
    expect((await fetchLeadAutomationActivity("teacher-1", "lead-1")).map((a) => a.id)).toEqual(["conversion"]);
  });
  it("does not duplicate conversion rows already targeting the lead", async () => {
    db.rows.automation_activity[0] = { ...conversion, target_table: "leads", target_id: "lead-1" };
    expect(await fetchLeadAutomationActivity("teacher-1", "lead-1")).toHaveLength(1);
  });
  it("keeps unrelated lead activity and newest-first ordering", async () => {
    db.rows.automation_activity.push({ ...conversion, id: "earlier", automation_event_id: "other", action_type: "interaction", target_table: "leads", target_id: "lead-1", created_at: "2026-11-01T00:00:00Z" });
    expect((await fetchLeadAutomationActivity("teacher-1", "lead-1")).map((a) => a.id)).toEqual(["conversion", "earlier"]);
  });
  it("propagates failed conversion-event reads rather than claiming complete history", async () => {
    db.fail = "automation_events";
    await expect(fetchLeadAutomationActivity("teacher-1", "lead-1")).rejects.toMatchObject({ message: "History unavailable" });
  });
  it("retains confirmed-step history from its persisted event when the activity write failed", async () => {
    db.rows.automation_events.push({ id: "confirmed", teacher_id: "teacher-1", source_table: "leads", source_id: "lead-1", event_type: "lead.stage_confirmed", status: "completed", payload: { step: "proposal", description: "Teacher confirmed proposal", occurred_at: "2026-11-01T14:00:00Z" } });
    const history = await fetchLeadAutomationActivity("teacher-1", "lead-1");
    expect(history.find((e) => e.automation_event_id === "confirmed")).toMatchObject({ action_type: "manual_stage_confirmation", description: "Teacher confirmed proposal", created_at: "2026-11-01T14:00:00Z" });
    db.rows.automation_activity.push({ id: "activity", teacher_id: "teacher-1", target_id: "lead-1", automation_event_id: "confirmed", action_type: "manual_stage_confirmation", description: "Teacher confirmed proposal", created_at: "2026-11-01T14:00:00Z" });
    expect((await fetchLeadAutomationActivity("teacher-1", "lead-1")).filter((e) => e.automation_event_id === "confirmed")).toHaveLength(1);
  });
});
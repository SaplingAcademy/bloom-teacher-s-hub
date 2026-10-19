import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, client } = vi.hoisted(() => {
  const store = { rows: [] as Record<string, any>[], error: null as unknown, projections: [] as string[] };
  const client = {
    from: vi.fn((table: string) => {
      const filters: ((row: Record<string, any>) => boolean)[] = [];
      let sortKey = "";
      const query = {
        select: (columns: string) => { if (table === "calendar_events") store.projections.push(columns); return query; },
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query; },
        neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return query; },
        gte: () => query,
        order: (key: string) => { sortKey = key; return query; },
        then: (resolve: (result: unknown) => unknown) => resolve({
          data: table === "calendar_events" ? store.rows.filter(row => filters.every(filter => filter(row)))
            .sort((a, b) => String(a[sortKey]).localeCompare(String(b[sortKey]))) : [],
          error: table === "calendar_events" ? store.error : null,
        }),
      };
      return query;
    }),
  };
  return { store, client };
});
vi.mock("@/lib/supabase", () => ({ supabase: client }));
import { fetchDashboardMetrics } from "@/lib/dashboard-metrics";

const lesson = (id: string, extras: Record<string, unknown> = {}) => ({
  id, teacher_id: "teacher", date: "2026-10-19", start_time: "10:00:00",
  end_time: "11:00:00", duration: 60, event_type: "individual", status: "Scheduled",
  student_name: id, ...extras,
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 19, 14));
  store.rows = []; store.error = null; store.projections = [];
  client.from.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("Today's canonical Calendar lessons", () => {
  it("counts three saved individual/class occurrences and preserves their identities", async () => {
    store.rows = [lesson("ana"), lesson("class", { event_type: "class", class_id: "group-1" }), lesson("bia")];
    const metrics = await fetchDashboardMetrics("teacher");
    expect(metrics.todayEvents).toHaveLength(3);
    expect(metrics.todayEvents.find(event => event.id === "class")).toMatchObject({ eventType: "class", classId: "group-1" });
    expect(store.projections).toEqual(["*"]);
  });
  it("excludes custom events from today's lesson count", async () => {
    store.rows = [lesson("lesson"), lesson("meeting", { event_type: "custom" })];
    expect((await fetchDashboardMetrics("teacher")).todayEvents.map(event => event.id)).toEqual(["lesson"]);
  });
  it("excludes cancelled lessons but keeps completed and closed lessons", async () => {
    store.rows = [lesson("cancelled", { status: "Cancelled" }), lesson("completed", { status: "Completed" }), lesson("closed", { status: "Closed" })];
    expect((await fetchDashboardMetrics("teacher")).todayEvents.map(event => event.id)).toEqual(["closed", "completed"]);
  });
  it("only reads the current local date and current teacher", async () => {
    store.rows = [lesson("today"), lesson("tomorrow", { date: "2026-10-20" }), lesson("other", { teacher_id: "other-teacher" })];
    expect((await fetchDashboardMetrics("teacher")).todayEvents.map(event => event.id)).toEqual(["today"]);
  });
  it("orders today's agenda chronologically using saved start times", async () => {
    store.rows = [lesson("late", { start_time: "16:30:00" }), lesson("early", { start_time: "08:15:00" }), lesson("middle", { start_time: "12:00:00" })];
    expect((await fetchDashboardMetrics("teacher")).todayEvents.map(event => [event.id, event.startTime]))
      .toEqual([["early", "08:15"], ["middle", "12:00"], ["late", "16:30"]]);
  });
  it("does not silently turn a failed Calendar read into zero lessons", async () => {
    store.error = { code: "42703", message: "read failed" };
    await expect(fetchDashboardMetrics("teacher")).rejects.toEqual(store.error);
  });
});
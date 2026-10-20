import { beforeEach, describe, expect, mock, test } from "bun:test";

type Filter = { method: string; column: string; value: unknown; operand?: unknown };
type Query = { table: string; columns: string; filters: Filter[] };
const queries: Query[] = [];
let taskError = false;
let leadError = false;
let taskRows: Record<string, unknown>[] = [];
const now = new Date(2026, 9, 20, 12);

const from = (table: string) => {
  const query: Query = { table, columns: "", filters: [] };
  queries.push(query);
  const builder: any = {
    select(columns: string) { query.columns = columns; return builder; },
    then(resolve: (result: { data: unknown; error: unknown }) => unknown) {
      if (table === "tasks") {
        const allowed = ["id", "teacher_id", "title", "description", "status", "due_date", "category_id", "priority_id"];
        const invalidColumn = query.columns.split(",").map((c) => c.trim()).find((c) => !allowed.includes(c));
        if (invalidColumn || taskError) return Promise.resolve({ data: null, error: { message: invalidColumn ? `column tasks.${invalidColumn} does not exist` : "tasks unavailable" } }).then(resolve);
        const rows = taskRows.filter((row) => query.filters.filter((f) => f.method === "eq").every((f) => row[f.column] === f.value));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      if (table === "leads") {
        if (leadError) return Promise.resolve({ data: null, error: { message: "leads unavailable" } }).then(resolve);
        const proposal = query.filters.some((f) => f.method === "in" && f.column === "stage");
        return Promise.resolve({ data: [{ id: proposal ? "proposal" : "stale", full_name: "Contact", updated_at: "2026-10-01T10:00:00Z" }], error: null }).then(resolve);
      }
      // Fail an invalid event/lead selection rather than silently accepting it.
      if (table === "calendar_events" && query.columns.split(",").includes("lead_id")) {
        return Promise.resolve({ data: null, error: { message: "column calendar_events.lead_id does not exist" } }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  for (const method of ["eq", "not", "in", "lte", "lt", "neq", "order", "gte", "ilike"]) {
    builder[method] = (column: string, value: unknown, operand?: unknown) => { query.filters.push({ method, column, value, ...(operand === undefined ? {} : { operand }) }); return builder; };
  }
  return builder;
};
mock.module("@/lib/supabase", () => ({ supabase: { from } }));
const { fetchDailyPriorities } = await import("../src/lib/daily-priorities");

beforeEach(() => { queries.length = 0; taskError = false; leadError = false; taskRows = []; });

describe("Today production task and independent lead discovery", () => {
  test("only pending teacher tasks due today or overdue are actionable", async () => {
    taskRows = [
      { id: "overdue", teacher_id: "teacher", status: "pending", title: "Prepare", due_date: "2026-10-19" },
      { id: "today", teacher_id: "teacher", status: "pending", title: "Send", due_date: "2026-10-20" },
      { id: "future", teacher_id: "teacher", status: "pending", due_date: "2026-10-21" },
      { id: "no-date", teacher_id: "teacher", status: "pending", due_date: null },
      { id: "done", teacher_id: "teacher", status: "completed", due_date: "2026-10-19" },
      { id: "other", teacher_id: "other", status: "pending", due_date: "2026-10-19" },
    ];
    const result = await fetchDailyPriorities("teacher", now);
    const tasks = result.items.filter((i) => i.id.startsWith("task:"));
    expect(result.failed).toEqual([]);
    expect(tasks.map((i) => [i.id, i.category, i.reason, i.urgency, i.ref, i.action])).toEqual([
      ["task:overdue", "task", "task_overdue", "critical", { taskId: "overdue" }, { route: "/" }],
      ["task:today", "task", "task_due_today", "today", { taskId: "today" }, { route: "/" }],
    ]);
    expect(queries.find((q) => q.table === "tasks")?.columns).toBe("id, title, due_date");
  });

  test("a Tasks failure does not fail Leads or discard reliable lead actions", async () => {
    taskError = true;
    const result = await fetchDailyPriorities("teacher", now);
    expect(result.failed).toEqual(["task"]);
    expect(result.items.filter((i) => i.category === "lead").map((i) => i.reason)).toEqual(["lead_proposal_pending", "lead_stale"]);
  });

  test("a Leads failure leaves Tasks available", async () => {
    leadError = true;
    taskRows = [{ id: "today", teacher_id: "teacher", status: "pending", title: "Prepare", due_date: "2026-10-20" }];
    const result = await fetchDailyPriorities("teacher", now);
    expect(result.failed).toEqual(["lead"]);
    expect(result.items.map((i) => i.id)).toContain("task:today");
  });

  test("lead reads are teacher-scoped, exclude closed stages and never guess trial associations", async () => {
    const result = await fetchDailyPriorities("teacher", now);
    const leads = queries.filter((q) => q.table === "leads");
    expect(leads).toHaveLength(2);
    expect(leads.every((q) => q.filters.some((f) => f.method === "eq" && f.column === "teacher_id" && f.value === "teacher"))).toBe(true);
    expect(leads[0].filters).toContainEqual({ method: "in", column: "stage", value: ["Proposta enviada", "proposal"] });
    expect(leads[1].filters).toContainEqual({ method: "not", column: "stage", value: "in", operand: '("Convertido","won","Perdido","lost")' });
    expect(leads[1].filters).toContainEqual({ method: "lt", column: "updated_at", value: new Date(2026, 9, 13).toISOString() });
    expect(result.failed).toEqual([]);
    expect(result.items.some((i) => i.reason === "lead_trial_soon")).toBe(false);
    expect(queries.filter((q) => q.table === "calendar_events")).toHaveLength(1);
    expect(queries.some((q) => q.columns.includes("lead_id"))).toBe(false);
  });
});
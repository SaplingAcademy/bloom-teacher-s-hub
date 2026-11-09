import { beforeEach, describe, expect, mock, test } from "bun:test";

type Filter = { method: string; column: string; value: unknown; operand?: unknown };
type Query = { table: string; columns: string; filters: Filter[] };
const queries: Query[] = [];
let taskError = false;
let leadError = false;
let taskRows: Record<string, unknown>[] = [];
let eventRows: Record<string, unknown>[] = [];
const now = new Date(2026, 9, 20, 12);

const from = (table: string) => {
  const query: Query = { table, columns: "", filters: [] };
  queries.push(query);
  const builder: any = {
    select(columns: string) { query.columns = columns; return builder; },
    then(resolve: (result: { data: unknown; error: unknown }) => unknown) {
      if (table === "tasks") {
        const allowed = ["id", "teacher_id", "title", "description", "status", "due_date", "category_id", "priority_id", "lead_id", "automation_event_id", "activity_type", "leads(stage", "contacted_at", "trial_scheduled_at", "trial_calendar_event_id)"];
        const invalidColumn = query.columns.split(",").map((c) => c.trim()).find((c) => !allowed.includes(c));
        if (invalidColumn || taskError) return Promise.resolve({ data: null, error: { message: invalidColumn ? `column tasks.${invalidColumn} does not exist` : "tasks unavailable" } }).then(resolve);
        const rows = taskRows.filter((row) => query.filters.filter((f) => f.method === "eq").every((f) => row[f.column] === f.value));
        return Promise.resolve({ data: rows, error: null }).then(resolve);
      }
      if (table === "leads") {
        if (leadError) return Promise.resolve({ data: null, error: { message: "leads unavailable" } }).then(resolve);
        const proposal = query.filters.some((f) => f.method === "in" && f.column === "stage");
        return Promise.resolve({ data: [{ id: proposal ? "proposal" : "stale", teacher_id: "teacher", stage: proposal ? "Proposta enviada" : "Em conversa", full_name: "Contact", updated_at: "2026-10-20T10:00:00Z", created_at: "2026-10-01T10:00:00Z", last_interaction_at: "2026-10-01T10:00:00Z" }], error: null }).then(resolve);
      }
      if (table === "automation_events") {
        const ids = query.filters.find((f) => f.method === "in" && f.column === "id")?.value as string[] | undefined;
        return Promise.resolve({ data: eventRows.filter((e) => !ids || ids.includes(e.id as string)), error: null }).then(resolve);
      }
      if (table === "automation_settings") {
        return Promise.resolve({ data: { id: "settings", teacher_id: "teacher", inactivity_period_days: 10, auto_task_creation_enabled: true, updated_at: "2026-10-01T10:00:00Z" }, error: null }).then(resolve);
      }
      // Fail an invalid event/lead selection rather than silently accepting it.
      if (table === "calendar_events" && query.columns.split(",").includes("lead_id")) {
        return Promise.resolve({ data: null, error: { message: "column calendar_events.lead_id does not exist" } }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  for (const method of ["eq", "not", "in", "lte", "lt", "neq", "order", "gte", "ilike", "or", "range", "maybeSingle"]) {
    builder[method] = (column: string, value: unknown, operand?: unknown) => { query.filters.push({ method, column, value, ...(operand === undefined ? {} : { operand }) }); return builder; };
  }
  return builder;
};
mock.module("@/lib/supabase", () => ({ supabase: { from } }));
const { fetchDailyPriorities } = await import("../src/lib/daily-priorities");

beforeEach(() => { queries.length = 0; taskError = false; leadError = false; taskRows = []; eventRows = []; });

describe("Today production task and independent lead discovery", () => {
  test("pending commercial tasks are Leads priorities, never Tarefas", async () => {
    taskRows = [
      { id: "overdue", teacher_id: "teacher", status: "pending", title: "Confirmar aula experimental", due_date: "2026-10-19", lead_id: "mario" },
      { id: "today", teacher_id: "teacher", status: "pending", title: "Pedir feedback da aula experimental", due_date: "2026-10-20", lead_id: "mario" },
      { id: "future", teacher_id: "teacher", status: "pending", due_date: "2026-10-21", lead_id: "mario" },
      { id: "no-date", teacher_id: "teacher", status: "pending", due_date: null, lead_id: "mario" },
      { id: "done", teacher_id: "teacher", status: "completed", due_date: "2026-10-19", lead_id: "mario" },
      { id: "other", teacher_id: "other", status: "pending", due_date: "2026-10-19", lead_id: "mario" },
      // No lead relationship: not homework and no identifiable origin, so never "Tarefas".
      { id: "orphan", teacher_id: "teacher", status: "pending", title: "Tarefa", due_date: "2026-10-19", lead_id: null },
    ];
    const result = await fetchDailyPriorities("teacher", now);
    const tasks = result.items.filter((i) => i.id.startsWith("task:"));
    expect(result.failed).toEqual([]);
    expect(tasks.map((i) => [i.id, i.category, i.reason, i.urgency, i.ref, i.action])).toEqual([
      ["task:overdue", "lead", "lead_task_overdue", "critical", { taskId: "overdue", leadId: "mario" }, { route: "/leads", params: { leadId: "mario" } }],
      ["task:today", "lead", "lead_task_due_today", "today", { taskId: "today", leadId: "mario" }, { route: "/leads", params: { leadId: "mario" } }],
    ]);
    expect(result.items.filter((i) => i.category === "task")).toEqual([]); // no homework → Tarefas counter is zero
    expect(queries.find((q) => q.table === "tasks")?.columns).toBe("id, title, due_date, lead_id, automation_event_id, activity_type, leads(stage, contacted_at, trial_scheduled_at, trial_calendar_event_id)");
  });

  test("a lead with a pending task appears once, through the task", async () => {
    taskRows = [{ id: "t1", teacher_id: "teacher", status: "pending", title: "Retomar contato", due_date: "2026-10-20", lead_id: "stale" }];
    const result = await fetchDailyPriorities("teacher", now);
    const forLead = result.items.filter((i) => i.ref.leadId === "stale");
    expect(forLead.map((i) => i.id)).toEqual(["task:t1"]);
    expect(new Set(result.items.map((i) => i.id)).size).toBe(result.items.length);
  });

  test("a commercial-task read failure is reported on Leads without discarding other lead actions", async () => {
    taskError = true;
    const result = await fetchDailyPriorities("teacher", now);
    expect(result.failed).toEqual(["lead"]);
    expect(result.items.filter((i) => i.category === "lead").map((i) => i.reason)).toEqual(["lead_proposal_pending", "lead_stale"]);
  });

  test("a Leads failure keeps the commercial tasks available", async () => {
    leadError = true;
    taskRows = [{ id: "today", teacher_id: "teacher", status: "pending", title: "Prepare", due_date: "2026-10-20", lead_id: "x" }];
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
    const cutoff = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    expect(leads[1].filters).toContainEqual({ method: "or", column: `last_interaction_at.lte.${cutoff},and(last_interaction_at.is.null,created_at.lte.${cutoff})`, value: undefined });
    expect(leads[1].columns).not.toContain("updated_at");
    expect(result.failed).toEqual([]);
    expect(result.items.some((i) => i.reason === "lead_trial_soon")).toBe(false);
    expect(queries.filter((q) => q.table === "calendar_events")).toHaveLength(1);
    expect(queries.some((q) => q.table === "calendar_events" && q.columns.includes("lead_id"))).toBe(false);
  });
  test("Mario Maria: trial scheduled → first-contact task hidden, trial tasks and manual tasks kept", async () => {
    const trialFuture = { stage: "Aula experimental agendada", contacted_at: null, trial_scheduled_at: "2026-10-21T15:00:00Z" };
    eventRows = [
      { id: "ev-created", event_type: "lead.created" },
      { id: "ev-trial", event_type: "lead.trial_scheduled" },
    ];
    taskRows = [
      { id: "contact", teacher_id: "teacher", status: "pending", title: "Entrar em contato com Mario Maria", due_date: "2026-10-15", lead_id: "mario", automation_event_id: "ev-created", activity_type: "follow_up", leads: trialFuture },
      { id: "confirm", teacher_id: "teacher", status: "pending", title: "Confirmar aula experimental com Mario Maria", due_date: "2026-10-20", lead_id: "mario", automation_event_id: "ev-trial", activity_type: "whatsapp", leads: trialFuture },
      { id: "manual", teacher_id: "teacher", status: "pending", title: "Enviar material", due_date: "2026-10-19", lead_id: "mario", automation_event_id: null, activity_type: "email", leads: trialFuture },
    ];
    const result = await fetchDailyPriorities("teacher", now);
    const leadTasks = result.items.filter((i) => i.id.startsWith("task:")).map((i) => i.id).sort();
    expect(leadTasks).toEqual(["task:confirm", "task:manual"]);
    expect(result.items.filter((i) => i.category === "lead" && i.ref.leadId === "mario")).toHaveLength(2); // counter reflects only pertinent actions
  });
});
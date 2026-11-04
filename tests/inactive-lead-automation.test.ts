import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  rows: {} as Record<string, any[]>,
  fail: "", failures: 0, user: "teacher", time: "2026-11-01T12:00:00Z", nextId: 0,
  writes: [] as { table: string; kind: string; values: any }[],
  queries: [] as { table: string; columns: string; filters: [string, string, any][] }[],
}));

vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: db.user } }, error: null }) },
  from(table: string) {
    let kind = "read", values: any, options: any, one = false, optional = false, max = Infinity;
    const q = { table, columns: "", filters: [] as [string, string, any][] };
    db.queries.push(q);
    const matches = (row: any) => q.filters.every(([method, column, value]) => {
      if (method === "eq") return row[column] === value;
      if (method === "gt") return row[column] > value;
      if (method === "not") return !["Convertido", "won", "Perdido", "lost"].includes(row[column]);
      return true;
    });
    const builder: any = {
      select(columns: string) { q.columns = columns; return builder; },
      insert(data: any) { kind = "insert"; values = data; return builder; },
      upsert(data: any, opts: any) { kind = "upsert"; values = data; options = opts; return builder; },
      update(data: any) { kind = "update"; values = data; return builder; },
      eq(col: string, value: any) { q.filters.push(["eq", col, value]); return builder; },
      gt(col: string, value: any) { q.filters.push(["gt", col, value]); return builder; },
      not(col: string) { q.filters.push(["not", col, null]); return builder; },
      or(value: string) { q.filters.push(["or", "", value]); return builder; },
      order() { return builder; }, range() { return builder; },
      limit(n: number) { max = n; return builder; },
      single() { one = true; return builder; }, maybeSingle() { one = true; optional = true; return builder; },
      then(resolve: any, reject: any) {
        return Promise.resolve().then(() => {
          const operation = `${table}:${kind}`;
          if (db.fail === operation && db.failures > 0) {
            db.failures--;
            return { data: null, error: { message: `failed ${operation}` } };
          }
          const rows = db.rows[table] || [];
          let data: any[] = [];
          if (kind === "read") data = rows.filter(matches).slice(0, max);
          else {
            db.writes.push({ table, kind, values: { ...values } });
            if (kind === "update") {
              data = rows.filter(matches);
              for (const row of data) Object.assign(row, values, { updated_at: db.time });
            } else {
              const existing = kind === "upsert" ? rows.find((r) => r.idempotency_key === values.idempotency_key) : null;
              if (existing && options?.ignoreDuplicates) data = [];
              else {
                const row = { id: `id-${++db.nextId}`, created_at: db.time, updated_at: db.time, processing_attempts: 0, ...values };
                rows.push(row); db.rows[table] = rows; data = [row];
              }
            }
          }
          if (one && !optional && data.length !== 1) return { data: null, error: { message: "Expected single row" } };
          return { data: one ? data[0] ?? null : data, error: null };
        }).then(resolve, reject);
      },
    };
    return builder;
  },
} }));
vi.mock("@/lib/calendar-sync", () => ({ formatDateString: (date: Date) => date.toISOString().slice(0, 10) }));
vi.mock("@/lib/attendance-priorities", () => ({ fetchAttendancePriorityCandidates: async () => [] }));
vi.mock("@/lib/finance-engine", () => ({ calculateLastDueDate: () => null, checkPackageExpirationAlerts: async () => [] }));
vi.mock("@/lib/billing-domain", () => ({ billingModelFromAgreement: () => "monthly" }));

import { processInactiveLeadCheck, runInactiveLeadCheckOnLoad } from "../src/lib/inactive-lead-automation";
import { fetchInactiveLeadCandidates } from "../src/lib/lead-inactivity-data";
import { fetchDailyPriorities } from "../src/lib/daily-priorities";
import { fetchAttentionQueue } from "../src/lib/attention-queue";

const now = new Date("2026-11-04T12:00:00Z");
const lead = { id: "lead", teacher_id: "teacher", full_name: "Lead", stage: "Em conversa", created_at: "2026-10-01T12:00:00Z", last_interaction_at: "2026-10-25T12:00:00Z" };
beforeEach(() => {
  db.rows = {
    automation_settings: [{ id: "settings", teacher_id: "teacher", inactivity_period_days: 10, auto_task_creation_enabled: true, updated_at: "2026-11-01T12:00:00Z" }],
    leads: [{ ...lead }], tasks: [], automation_events: [], automation_activity: [],
  };
  db.writes = []; db.queries = []; db.fail = ""; db.failures = 0; db.user = "teacher";
  db.time = "2026-11-01T12:00:00Z"; db.nextId = 0;
});

describe("Rule E persistence and creation", () => {
  it("creates event first, linked follow_up task and lead history, and completes event", async () => {
    expect(await processInactiveLeadCheck("teacher", now)).toEqual({ processedCount: 1 });
    const event = db.rows.automation_events.find((r) => r.event_type === "lead.inactive");
    expect(event.status).toBe("completed");
    expect(db.rows.tasks[0]).toMatchObject({ teacher_id: "teacher", lead_id: "lead", activity_type: "follow_up", automation_event_id: event.id, status: "pending", due_date: now.toISOString() });
    expect(db.rows.automation_activity[0]).toMatchObject({ automation_event_id: event.id, target_id: "lead", target_table: "leads" });
    expect(db.writes.findIndex((w) => w.values.event_type === "lead.inactive")).toBeLessThan(db.writes.findIndex((w) => w.table === "tasks"));
    expect(db.writes.some((w) => w.table === "leads" || w.table === "automation_settings")).toBe(false);
  });
  it("does not duplicate a cycle across days or after its task is completed", async () => {
    await processInactiveLeadCheck("teacher", now);
    db.rows.tasks[0].status = "completed";
    await processInactiveLeadCheck("teacher", new Date("2026-11-05T12:00:00Z"));
    expect(db.rows.tasks).toHaveLength(1);
    expect(db.rows.tasks[0].status).toBe("completed");
    expect(db.rows.automation_activity).toHaveLength(1);
  });
  it("allows a new real-contact cycle despite an earlier completed follow-up", async () => {
    await processInactiveLeadCheck("teacher", now);
    db.rows.tasks[0].status = "completed";
    db.rows.leads[0].last_interaction_at = now.toISOString();
    expect((await processInactiveLeadCheck("teacher", now)).processedCount).toBe(0);
    expect((await processInactiveLeadCheck("teacher", new Date("2026-11-14T12:00:00Z"))).processedCount).toBe(1);
    expect(db.rows.tasks).toHaveLength(2);
    expect(db.rows.tasks[0].automation_event_id).not.toBe(db.rows.tasks[1].automation_event_id);
  });
  it("disabled automation creates no tasks/events but keeps read-only queue eligibility", async () => {
    db.rows.automation_settings[0].auto_task_creation_enabled = false;
    expect(await processInactiveLeadCheck("teacher", now)).toEqual({ processedCount: 0 });
    expect((await fetchInactiveLeadCandidates("teacher", now)).leads.map((l) => l.id)).toEqual(["lead"]);
    expect(db.writes).toHaveLength(0);
  });
  it("initial activation does not bulk-task old leads, but later newly inactive leads get a task", async () => {
    db.time = now.toISOString();
    db.rows.leads[0].last_interaction_at = "2026-10-01T12:00:00Z";
    expect(await processInactiveLeadCheck("teacher", now)).toEqual({ processedCount: 0 });
    expect(db.rows.tasks).toHaveLength(0);
    db.rows.leads.push({ ...lead, id: "new", last_interaction_at: "2026-11-02T12:00:00Z" });
    await processInactiveLeadCheck("teacher", new Date("2026-11-12T12:00:00Z"));
    expect(db.rows.tasks.map((t) => t.lead_id)).toEqual(["new"]);
  });
  it("preserves manual/completed tasks and honors a future pending action", async () => {
    const manual = { id: "manual", teacher_id: "teacher", lead_id: "lead", status: "pending", due_date: "2026-11-05T12:00:00Z", automation_event_id: null };
    db.rows.tasks = [{ ...manual }];
    expect((await processInactiveLeadCheck("teacher", now)).processedCount).toBe(0);
    expect(db.rows.tasks).toEqual([manual]);
    db.rows.tasks[0].status = "completed";
    await processInactiveLeadCheck("teacher", now);
    expect(db.rows.tasks).toHaveLength(2);
    expect(db.rows.tasks[0]).toEqual({ ...manual, status: "completed" });
  });
  it("task insertion failure marks failed, and retry creates only the missing task", async () => {
    db.fail = "tasks:insert"; db.failures = 1;
    expect((await processInactiveLeadCheck("teacher", now)).error).toContain("failed tasks:insert");
    const event = db.rows.automation_events.find((e) => e.event_type === "lead.inactive");
    expect(event.status).toBe("failed");
    expect(db.rows.tasks).toHaveLength(0);
    expect(await processInactiveLeadCheck("teacher", now)).toEqual({ processedCount: 1 });
    expect(event.status).toBe("completed");
    expect(event.processing_attempts).toBe(2);
    expect(db.rows.tasks).toHaveLength(1);
  });
  it("history failure retains the saved task; retry logs it without duplicating the task", async () => {
    db.fail = "automation_activity:insert"; db.failures = 1;
    expect((await processInactiveLeadCheck("teacher", now)).error).toContain("failed automation_activity:insert");
    const taskId = db.rows.tasks[0].id;
    expect(await processInactiveLeadCheck("teacher", now)).toEqual({ processedCount: 1 });
    expect(db.rows.tasks.map((t) => t.id)).toEqual([taskId]);
    expect(db.rows.automation_activity).toHaveLength(1);
  });
  it("parallel checks cannot both own the same event/task cycle", async () => {
    await Promise.all([processInactiveLeadCheck("teacher", now), processInactiveLeadCheck("teacher", now)]);
    expect(db.rows.tasks).toHaveLength(1);
    expect(db.rows.automation_activity).toHaveLength(1);
  });
  it("all persisted reads/writes are owner scoped and wrong sessions cannot run", async () => {
    db.user = "other";
    expect((await processInactiveLeadCheck("teacher", now)).error).toContain("owning teacher");
    expect(db.writes).toHaveLength(0);
    db.user = "teacher";
    await processInactiveLeadCheck("teacher", now);
    expect(db.queries.every((q) => q.filters.some((f) => f[0] === "eq" && f[1] === "teacher_id" && f[2] === "teacher") || db.writes.some((w) => w.table === q.table && w.values.teacher_id === "teacher"))).toBe(true);
    expect(db.writes.every((w) => w.values.teacher_id === "teacher" || w.kind === "update")).toBe(true);
  });
  it("missing/failed settings never provision defaults or create tasks", async () => {
    db.rows.automation_settings = [];
    expect((await processInactiveLeadCheck("teacher", now)).error).toContain("settings unavailable");
    expect(db.writes).toHaveLength(0);
    db.fail = "automation_settings:read"; db.failures = 1;
    expect((await processInactiveLeadCheck("teacher", now)).error).toContain("failed automation_settings:read");
  });
  it("a task-read failure fails closed before claiming/creating a cycle", async () => {
    db.fail = "tasks:read"; db.failures = 1;
    expect((await processInactiveLeadCheck("teacher", now)).error).toContain("failed tasks:read");
    expect(db.rows.tasks).toHaveLength(0);
    expect(db.rows.automation_events.filter((e) => e.event_type === "lead.inactive")).toHaveLength(0);
  });
  it("load boundaries dedupe and throttle calls rather than checking on every render", async () => {
    const a = runInactiveLeadCheckOnLoad("teacher");
    const b = runInactiveLeadCheckOnLoad("teacher");
    expect(a).toBe(b);
    await a;
    expect(runInactiveLeadCheckOnLoad("teacher")).toBe(a);
  });
});

describe("Today and attention share contact-based settings", () => {
  it("same inactive leads despite fresh profile edits; real contact and closed leads are excluded", async () => {
    db.rows.leads = [
      { ...lead, updated_at: now.toISOString() },
      { ...lead, id: "recent", last_interaction_at: now.toISOString() },
      { ...lead, id: "closed", stage: "Convertido" },
      { ...lead, id: "no-contact", last_interaction_at: null },
      { ...lead, id: "other", teacher_id: "other" },
    ];
    const today = await fetchDailyPriorities("teacher", now);
    const attention = await fetchAttentionQueue("teacher", "en");
    expect(today.items.filter((i) => i.reason === "lead_stale").map((i) => i.ref.leadId)).toEqual(["no-contact", "lead"]);
    expect(attention.filter((i) => i.category === "inactive_lead").map((i) => i.leadId)).toEqual(["lead", "no-contact"]);
    const candidateReads = db.queries.filter((q) => q.table === "leads" && q.columns.includes("last_interaction_at"));
    expect(candidateReads).toHaveLength(2);
    expect(candidateReads.every((q) => !q.columns.includes("updated_at"))).toBe(true);
    expect(candidateReads.every((q) => q.filters.some((f) => f[0] === "or" && f[2].includes("last_interaction_at.is.null,created_at.lte.")))).toBe(true);
    expect(db.writes).toHaveLength(0);
  });
  it("unavailable settings mark Today Leads failed without discarding other task priorities", async () => {
    db.rows.automation_settings = [];
    db.rows.tasks = [{ id: "task", teacher_id: "teacher", title: "Task", status: "pending", due_date: "2026-11-03T12:00:00Z" }];
    const result = await fetchDailyPriorities("teacher", now);
    expect(result.failed).toContain("lead");
    expect(result.items.map((i) => i.id)).toContain("task:task");
    expect(db.writes).toHaveLength(0);
  });
});
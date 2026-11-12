import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Equivalence of the optimized fetchAttentionQueue (parallel sections + grouped hot-lead task read)
 * with the former sequential implementation (verbatim copy in tests/fixtures). Both run against the
 * same deterministic Supabase double; every read and helper call costs one simulated round trip so
 * the number of queries and sequential rounds can be compared under identical conditions.
 */

const LATENCY = 5;
const env = vi.hoisted(() => ({
  scenario: {} as Record<string, any>,
  log: [] as { table: string; filters: string[]; start: number; end: number }[],
  t0: 0,
}));

vi.mock("@/lib/supabase", () => {
  const builder = (table: string) => {
    const filters: string[] = [];
    const chain: any = {};
    for (const m of ["select", "eq", "lt", "gte", "lte", "ilike", "in", "order", "limit"]) {
      chain[m] = (...args: unknown[]) => { filters.push(`${m}:${JSON.stringify(args)}`); return chain; };
    }
    chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const entry = { table, filters, start: Date.now() - env.t0, end: 0 };
      env.log.push(entry);
      return new Promise((r) => setTimeout(r, LATENCY)).then(() => {
        entry.end = Date.now() - env.t0;
        return env.scenario.respond(table, filters);
      }).then(resolve, reject);
    };
    return chain;
  };
  return { supabase: { from: (table: string) => builder(table) } };
});
const helper = <T>(name: string, value: () => T) => {
  const entry = { table: `helper:${name}`, filters: [], start: Date.now() - env.t0, end: 0 };
  env.log.push(entry);
  return new Promise((r) => setTimeout(r, LATENCY)).then(() => { entry.end = Date.now() - env.t0; return value(); });
};
vi.mock("@/lib/attendance-priorities", () => ({
  fetchAttendancePriorityCandidates: () => helper("attendance", () => env.scenario.attendance()),
}));
vi.mock("@/lib/lead-inactivity-data", () => ({
  fetchInactiveLeadCandidates: () => helper("inactivity", () => env.scenario.inactivity()),
}));
vi.mock("@/lib/lead-task-relevance", () => ({
  LEAD_TASK_RELEVANCE_COLUMNS: "activity_type, created_at",
  filterRelevantLeadTasks: (_t: string, tasks: any[]) => helper("relevance", () => env.scenario.relevance(tasks)),
}));
vi.mock("@/lib/finance-engine", () => ({
  checkPackageExpirationAlerts: () => helper("renewal", () => env.scenario.renewal()),
}));

import { fetchAttentionQueue } from "@/lib/attention-queue";
import { fetchAttentionQueueLegacy } from "./fixtures/attention-queue-legacy";

const has = (filters: string[], part: string) => filters.some((f) => f.includes(part));
const HOT = [
  { id: "H1", full_name: "Hugo", stage: "Em conversa", updated_at: "2026-11-01" },
  { id: "H2", full_name: "Helena", stage: "contacted", updated_at: "2026-11-02" },
  { id: "H3", full_name: "Heitor", stage: "Em conversa", updated_at: "2026-11-03" },
];

function baseScenario(overrides: Record<string, any> = {}) {
  return {
    attendance: () => [
      { eventId: "E1", studentId: "S1", studentName: "Ana", lessonDate: "2026-11-10", age: "urgent", classId: null },
      { eventId: "E2", studentId: "S2", studentName: "Bia", lessonDate: "2026-11-11", age: "recent", classId: null },
      { eventId: "E3", studentId: "S3", studentName: "Caio", lessonDate: "2026-11-09", age: "urgent", classId: "C1" },
    ],
    renewal: () => [
      { studentId: "S4", studentName: "Duda", alertMessage: "Vence em 3 dias", endDate: "2026-11-15", alertLevel: "warning" },
      { studentId: "S5", studentName: "Edu", alertMessage: "Vence em 20 dias", endDate: "2026-12-01", alertLevel: "info" },
    ],
    relevance: (tasks: any[]) => tasks.filter((t) => t.id !== "T2"),
    inactivity: () => ({ leads: [{ id: "L9", full_name: "Iris" }], settings: { inactivity_period_days: 7 } }),
    respond: (table: string, filters: string[]) => {
      if (table === "tasks" && has(filters, "lt:")) {
        return { data: [
          { id: "T1", title: "Ligar para Hugo", due_date: "2026-11-08T12:00:00Z", lead_id: "H1", student_id: null },
          { id: "T2", title: "Tarefa superada", due_date: "2026-11-07T12:00:00Z", lead_id: "H2", student_id: null },
          { id: "T3", title: "Enviar material", due_date: "2026-11-06T12:00:00Z", lead_id: null, student_id: "S1" },
        ], error: null };
      }
      if (table === "tasks") {
        // Hot-lead pending tasks: grouped (in lead_id) or per lead (eq lead_id). Only H2 has one.
        const rows = [{ id: "P1", lead_id: "H2" }];
        if (has(filters, 'in:["lead_id"')) return { data: rows, error: null };
        const lead = filters.find((f) => f.startsWith('eq:["lead_id"'))!;
        return { data: rows.filter((r) => lead.includes(`"${r.lead_id}"`)), error: null };
      }
      if (table === "calendar_events") {
        return { data: [{ id: "TR1", student_name: "Lia", date: "2026-11-13", start_time: "10:00:00", lead_id: "L1" }], error: null };
      }
      if (table === "leads" && has(filters, "Proposta enviada")) {
        return { data: [{ id: "PL1", full_name: "Paula", potential_value: 450, updated_at: "2026-11-05" }, { id: "PL2", full_name: "Pedro", potential_value: null, updated_at: "2026-11-04" }], error: null };
      }
      if (table === "leads") return { data: HOT, error: null };
      if (table === "automation_events") {
        return { data: [{ id: "F1", event_type: "lead_inactivity", source_id: "L3", error_message: null, created_at: "2026-11-10" }], error: null };
      }
      return { data: null, error: { message: `unexpected ${table}` } };
    },
    ...overrides,
  };
}

async function run(fn: typeof fetchAttentionQueue, lang: "pt" | "en" = "pt") {
  env.log = [];
  env.t0 = Date.now();
  const items = await fn("teacher-1", lang);
  const reads = env.log.filter((e) => !e.table.startsWith("helper:")).length;
  const elapsed = Math.max(...env.log.map((e) => e.end), 0);
  return { items, reads, calls: env.log.length, rounds: Math.round(elapsed / LATENCY) };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("fetchAttentionQueue optimization: same items as before", () => {
  it("full scenario (pt and en): identical items in the same order", async () => {
    for (const lang of ["pt", "en"] as const) {
      env.scenario = baseScenario();
      const legacy = await run(fetchAttentionQueueLegacy, lang);
      const optimized = await run(fetchAttentionQueue, lang);
      expect(optimized.items).toEqual(legacy.items);
      expect(optimized.items.map((i) => i.category)).toEqual([
        "attendance_pending", "attendance_pending", "package_renewal", "package_renewal",
        "overdue_followup", "overdue_followup", "trial_soon", "pending_proposal", "pending_proposal",
        "hot_no_action", "hot_no_action", "inactive_lead", "failed_automation",
      ]);
      expect(optimized.items.filter((i) => i.category === "hot_no_action").map((i) => i.leadId)).toEqual(["H1", "H3"]);
    }
  });

  it("grouped hot-lead task read failing behaves like every per-lead read failing", async () => {
    const respond = baseScenario().respond;
    env.scenario = baseScenario({
      respond: (table: string, filters: string[]) =>
        table === "tasks" && !has(filters, "lt:") ? { data: null, error: { message: "boom" } } : respond(table, filters),
    });
    const legacy = await run(fetchAttentionQueueLegacy);
    const optimized = await run(fetchAttentionQueue);
    expect(optimized.items).toEqual(legacy.items);
    expect(optimized.items.filter((i) => i.category === "hot_no_action")).toHaveLength(3);
  });

  it("an unguarded section that throws keeps only the items before it (same prefix as before)", async () => {
    const respond = baseScenario().respond;
    env.scenario = baseScenario({
      respond: (table: string, filters: string[]) => {
        if (table === "leads" && has(filters, "Proposta enviada")) throw new Error("network down");
        return respond(table, filters);
      },
    });
    const legacy = await run(fetchAttentionQueueLegacy);
    const optimized = await run(fetchAttentionQueue);
    expect(optimized.items).toEqual(legacy.items);
    expect(optimized.items.at(-1)?.category).toBe("trial_soon");
  });

  it("guarded helpers failing are skipped exactly as before", async () => {
    env.scenario = baseScenario({
      attendance: () => { throw new Error("attendance down"); },
      renewal: () => { throw new Error("renewal down"); },
      inactivity: () => { throw new Error("inactivity down"); },
      relevance: () => { throw new Error("relevance down"); },
    });
    const legacy = await run(fetchAttentionQueueLegacy);
    const optimized = await run(fetchAttentionQueue);
    expect(optimized.items).toEqual(legacy.items);
    expect(optimized.items.some((i) => i.category === "attendance_pending")).toBe(false);
    expect(optimized.items.filter((i) => i.category === "overdue_followup")).toHaveLength(3); // relevance failure keeps all
  });

  it("no hot leads: no task lookup at all, same items", async () => {
    const respond = baseScenario().respond;
    env.scenario = baseScenario({
      respond: (table: string, filters: string[]) =>
        table === "leads" && !has(filters, "Proposta enviada") ? { data: [], error: null } : respond(table, filters),
    });
    const legacy = await run(fetchAttentionQueueLegacy);
    const optimized = await run(fetchAttentionQueue);
    expect(optimized.items).toEqual(legacy.items);
    expect(env.log.some((e) => e.table === "tasks" && has(e.filters, "in:"))).toBe(false);
  });
});

describe("fetchAttentionQueue optimization: fewer queries and sequential rounds (measured with the double)", () => {
  it("replaces the per-lead reads with one grouped read and runs sections in parallel", async () => {
    env.scenario = baseScenario();
    const legacy = await run(fetchAttentionQueueLegacy);
    const optimized = await run(fetchAttentionQueue);
    // 3 hot leads: legacy 3 per-lead task reads → optimized 1 grouped read.
    expect(legacy.reads - optimized.reads).toBe(2);
    // Legacy: one round per call in sequence. Optimized: longest dependent chain (2 rounds).
    expect(legacy.rounds).toBeGreaterThanOrEqual(legacy.calls);
    expect(optimized.rounds).toBeLessThanOrEqual(3);
    process.stdout.write(`\n[attention-queue] legacy: ${legacy.reads} reads, ${legacy.calls} calls, ${legacy.rounds} rounds · optimized: ${optimized.reads} reads, ${optimized.calls} calls, ${optimized.rounds} rounds\n`);
  });
});

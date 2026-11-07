import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  events: [] as any[], plans: [] as any[], writes: [] as string[],
  off: [] as any[], offCalls: 0, addOffOnSecondRead: false,
  failPlans: false, failRead: false, failOff: false, failVerify: false,
  userId: "t", archive: false, pause: null as Promise<void> | null,
}));
vi.mock("@/lib/time-off-engine", async (load) => {
  const real = await load<typeof import("../src/lib/time-off-engine")>();
  return { ...real, fetchTeacherTimeOff: async () => {
    state.offCalls++;
    if (state.pause) await state.pause;
    if (state.failOff) throw new Error("time off read failed");
    return state.addOffOnSecondRead && state.offCalls >= 2
      ? [{ startDate: "2026-01-05", endDate: "2026-01-05" }] : state.off;
  } };
});
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: state.userId } }, error: null }) },
  from: (table: string) => {
    let operation = "select", payload: any[] = [], opts: any = {}, filters: Array<[string, any]> = [], inFilter: string[] | null = null;
    const query: any = {
      select: () => query, eq: (key: string, value: any) => { filters.push([key, value]); return query; },
      in: (_key: string, values: string[]) => { inFilter = values; return query; },
      is: (key: string, value: any) => { filters.push([key, value]); return query; }, order: () => query,
      range: () => query,
      insert: (rows: any[]) => { operation = "insert"; payload = rows; return query; },
      upsert: (rows: any[], options: any) => { operation = "upsert"; payload = rows; opts = options; return query; },
      single: () => query,
      then: (resolve: any, reject: any) => Promise.resolve().then(() => {
        if (table === "classes") return { data: { status: state.archive ? "archived" : "active" }, error: null };
        if (operation !== "select") {
          state.writes.push(`${table}:${operation}`);
          if (table === "lesson_plans" && state.failPlans) return { data: null, error: new Error("plan write failed") };
          if (table === "calendar_events") {
            const rows = payload.map((p) => ({ ...p, id: `e${state.events.length + payload.indexOf(p) + 1}` }));
            state.events.push(...rows); return { data: rows, error: null };
          }
          for (const row of payload) {
            const old = state.plans.find((p) => p.event_id === row.event_id);
            if (!old) state.plans.push({ ...row, id: `p${state.plans.length + 1}` });
            else if (!opts.ignoreDuplicates) Object.assign(old, row);
          }
        }
        if (state.failRead || (inFilter && state.failVerify)) return { data: null, error: new Error("read failed") };
        let rows = table === "calendar_events" ? state.events : state.plans;
        rows = rows.filter((r) => filters.every(([key, value]) => (r[key] ?? null) === value));
        if (inFilter) rows = rows.filter((p) => inFilter?.includes(p.event_id));
        return { data: rows.map((r) => ({ ...r })), error: null };
      }).then(resolve, reject),
    };
    return query;
  },
} }));
import { generateStudentLessonPlan } from "../src/lib/lesson-plan-sync";
import { generateClassLessonPlan } from "../src/lib/lesson-plans";
import { InsufficientLessonPeriodError } from "../src/lib/lesson-plan-quantity";

const schedule = { weekday: "Monday", startTime: "10:15", endTime: "11:00", duration: 45 };
const input = { teacherId: "t", studentId: "s", studentName: "Student", startDate: "2026-01-05", endDate: "2026-05-18", schedules: [schedule], requested: 20 };
const runClass = (endDate = input.endDate) => generateClassLessonPlan("t", { id: "c", name: "Class" }, {
  startDate: input.startDate, endDate, slots: [schedule], totalOccurrences: 20,
});
const operations = { student: (endDate = input.endDate) => generateStudentLessonPlan({ ...input, endDate }), class: runClass };
beforeEach(() => {
  Object.assign(state, { events: [], plans: [], writes: [], off: [], offCalls: 0, addOffOnSecondRead: false,
    failPlans: false, failRead: false, failOff: false, failVerify: false, userId: "t", archive: false, pause: null });
});
for (const [kind, generate] of Object.entries(operations)) describe(`${kind} generation-only persistence`, () => {
  it("20 requested/17 possible blocks before writes", async () => {
    await expect(generate("2026-04-27")).rejects.toMatchObject({ quantity: { requested: 20, possible: 17, missing: 3 } });
    expect(state.writes).toEqual([]); expect(state.events).toHaveLength(0); expect(state.plans).toHaveLength(0);
  });
  it("zero possible never saves", async () => {
    await expect(generate("2026-01-05")).rejects.toBeInstanceOf(InsufficientLessonPeriodError);
    expect(state.writes).toEqual([]);
  });
  it("confirms exactly 20 saved event-linked plans", async () => {
    const saved = await generate();
    expect(saved).toHaveLength(20); expect(new Set(saved.map((p) => p.event_id)).size).toBe(20);
    expect(state.events).toHaveLength(20); expect(state.plans).toHaveLength(20);
  });
  it("longer period saves just 20 rather than all 22", async () => {
    expect(await generate("2026-06-01")).toHaveLength(20);
    expect(state.events).toHaveLength(20); expect(state.plans).toHaveLength(20);
  });
  it("rereads changed exclusions after preparation and blocks without writes", async () => {
    state.addOffOnSecondRead = true;
    await expect(generate()).rejects.toMatchObject({ quantity: { requested: 20, possible: 19, missing: 1 } });
    expect(state.offCalls).toBe(2); expect(state.writes).toEqual([]);
  });
  it("time-off read failure is not an empty calendar", async () => {
    state.failOff = true; await expect(generate()).rejects.toThrow("time off read failed"); expect(state.writes).toEqual([]);
  });
  it("deduplication read failure never inserts", async () => {
    state.failRead = true; await expect(generate()).rejects.toThrow("read failed"); expect(state.writes).toEqual([]);
  });
  it("plan-write failure is an error and retry reuses the 20 confirmed events", async () => {
    state.failPlans = true; await expect(generate()).rejects.toThrow("plan write failed");
    expect(state.events).toHaveLength(20); expect(state.plans).toHaveLength(0);
    state.failPlans = false; expect(await generate()).toHaveLength(20);
    expect(state.events).toHaveLength(20); expect(state.writes.filter((w) => w === "calendar_events:insert")).toHaveLength(1);
  });
  it("repeated attempt preserves existing content and performs no further inserts", async () => {
    await generate(); state.plans[0].content = "Original teacher content";
    state.writes = []; const repeated = await generate();
    expect(repeated[0].content).toBe("Original teacher content"); expect(state.writes).toEqual([]);
  });
  it("readback failure never counts historical plans as success", async () => {
    state.failVerify = true; await expect(generate()).rejects.toThrow("read failed");
    state.failVerify = false; expect(await generate()).toHaveLength(20); expect(state.events).toHaveLength(20);
  });
  it("archived historical plans cannot be overwritten by a new generation", async () => {
    await generate(); state.plans[0].archived_document_id = "history"; state.writes = [];
    await expect(generate()).rejects.toThrow("archived lesson plan"); expect(state.writes).toEqual([]);
  });
  it("changed teacher session is rejected before writing", async () => {
    state.userId = "another"; await expect(generate()).rejects.toThrow("Teacher session changed"); expect(state.writes).toEqual([]);
  });
  it("parallel submissions in the same flow cannot duplicate events", async () => {
    let release: () => void = () => {};
    state.pause = new Promise<void>((resolve) => { release = resolve; });
    const first = generate();
    await expect(generate()).rejects.toThrow("already in progress");
    release(); await first; expect(state.events).toHaveLength(20);
  });
});
describe("class fresh exclusions", () => {
  it("does not merge stale deleted time-off from the form", async () => {
    expect(await generateClassLessonPlan("t", { id: "c", name: "Class" }, {
      startDate: input.startDate, endDate: input.endDate, slots: [schedule], totalOccurrences: 20,
      timeOff: [{ startDate: "2026-01-05", endDate: "2026-01-05" } as any],
    })).toHaveLength(20);
  });
  it("archived class writes are blocked", async () => {
    state.archive = true; await expect(runClass()).rejects.toThrow("Archived classes"); expect(state.writes).toEqual([]);
  });
});
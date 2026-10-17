import { beforeEach, describe, expect, mock, test } from "bun:test";

type Operation = { table: string; action: string; payload?: any; filters: Array<[string, ...any[]]> };
let operations: Operation[] = [];
let historyTable = "";
let failureTable = "";
let failedAction = "select";
let classStatus = "active";
const members = [{ id: "membership", class_id: "class", teacher_id: "teacher", student_id: "student", status: "active", joined_at: "2026-09-01", left_at: null, students: { full_name: "Ana" } }];
const from = mock((table: string) => {
  const op: Operation = { table, action: "select", filters: [] };
  operations.push(op);
  const result = () => {
    if (table === failureTable && op.action === failedAction) return { data: null, count: null, error: new Error("database failed") };
    if (table === "classes") {
      if (op.action === "update") classStatus = op.payload.status;
      return { data: { id: "class", status: classStatus }, count: 0, error: null };
    }
    return { data: table === "class_members" ? members : [], count: table === historyTable ? 1 : 0, error: null };
  };
  const chain: any = {
    select: () => chain,
    update: (payload: any) => { op.action = "update"; op.payload = payload; return chain; },
    delete: () => { op.action = "delete"; return chain; },
    single: async () => result(),
    then: (resolve: any, reject: any) => Promise.resolve(result()).then(resolve, reject),
  };
  for (const method of ["eq", "gt", "or", "is", "order"]) chain[method] = (...args: any[]) => { op.filters.push([method, ...args]); return chain; };
  return chain;
});
mock.module("@/lib/supabase", () => ({ supabase: { from } }));
const { reviewClassRemoval, removeClassSafely, teacherCalendarDate } = await import("../src/lib/class-lifecycle");

beforeEach(() => { operations = []; historyTable = ""; failureTable = ""; failedAction = "select"; classStatus = "active"; });
describe("safe class removal", () => {
  test("unused class can be permanently deleted, without deleting students", async () => {
    expect((await reviewClassRemoval("teacher", "class", "2026-10-17")).mode).toBe("delete");
    await removeClassSafely("teacher", "class", "2026-10-17", "delete", "pt");
    expect(operations.filter((o) => o.action === "delete").map((o) => o.table)).toEqual(["calendar_events", "classes"]);
  });
  test.each(["calendar_events", "lesson_plans", "lesson_plan_documents", "attendance_records", "class_sessions", "invoices", "class_members"])("%s history requires archival", async (table) => {
    historyTable = table;
    expect((await reviewClassRemoval("teacher", "class", "2026-10-17")).mode).toBe("archive");
  });
  test("unknown history prevents all writes", async () => {
    failureTable = "invoices";
    await expect(removeClassSafely("teacher", "class", "2026-10-17", "delete", "pt")).rejects.toThrow("database failed");
    expect(operations.some((o) => o.action !== "select")).toBe(false);
  });
  test("new history requires renewed consent instead of hard deleting", async () => {
    historyTable = "invoices";
    await expect(removeClassSafely("teacher", "class", "2026-10-17", "delete", "pt")).rejects.toThrow();
    expect(operations.some((o) => o.action !== "select")).toBe(false);
  });
  test("archive changes only status, ends active memberships and closes future Scheduled events", async () => {
    historyTable = "lesson_plans";
    const result = await removeClassSafely("teacher", "class", "2026-10-17", "archive", "pt");
    expect(result.activeMembers[0].student_id).toBe("student");
    const writes = operations.filter((o) => o.action !== "select");
    expect(writes.map((o) => [o.table, o.action, o.payload])).toEqual([
      ["classes", "update", { status: "archived" }],
      ["class_members", "update", { status: "removed", left_at: "2026-10-17" }],
      ["calendar_events", "update", { status: "Closed" }],
    ]);
    expect(writes[1].filters).toContainEqual(["eq", "status", "active"]);
    expect(writes[1].filters).toContainEqual(["is", "left_at", null]);
    expect(writes[2].filters).toContainEqual(["gt", "date", "2026-10-17"]);
    expect(writes[2].filters).toContainEqual(["eq", "status", "Scheduled"]);
    for (const write of writes) expect(write.filters).toContainEqual(["eq", "teacher_id", "teacher"]);
  });
  test("partial cleanup failure is not reported as success and archive can be retried", async () => {
    historyTable = "lesson_plans"; failureTable = "calendar_events"; failedAction = "update";
    await expect(removeClassSafely("teacher", "class", "2026-10-17", "archive", "pt")).rejects.toThrow("database failed");
    expect(classStatus).toBe("archived");
    failureTable = "";
    expect((await removeClassSafely("teacher", "class", "2026-10-17", "archive", "pt")).mode).toBe("archive");
  });
  test("class date follows the teacher timezone at a UTC date boundary", () => {
    expect(teacherCalendarDate("America/Sao_Paulo", new Date("2026-10-17T02:51:00Z"))).toBe("2026-10-16");
  });
});
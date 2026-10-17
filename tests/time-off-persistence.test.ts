import { beforeEach, describe, expect, mock, test } from "bun:test";

let readResult: { data: unknown; error: unknown };
let saveResult: { data: unknown; error: unknown };
const insert = mock((_payload: unknown) => ({
  select: () => ({
    then: (resolve: (result: typeof saveResult) => unknown) => Promise.resolve(saveResult).then(resolve),
    single: async () => saveResult,
  }),
}));
const eq = mock((_column: string, _id: string) => ({ order: async () => readResult }));
const from = mock((_table: string) => ({ select: () => ({ eq }), insert }));
mock.module("@/lib/supabase", () => ({ supabase: { from } }));

const { fetchTeacherTimeOff, createTeacherTimeOff, createTeacherTimeOffBatch } = await import("../src/lib/time-off-engine");
const row = {
  id: "saved-id", teacher_id: "teacher-id", start_date: "2026-10-20", end_date: "2026-10-22",
  type: "Férias", title: null, notes: null, created_at: "2026-10-17T02:40:00Z",
};
const input = { startDate: "2026-10-20", endDate: "2026-10-22", type: "Férias" as const };

describe("time-off persistence (Supabase only)", () => {
  beforeEach(() => {
    from.mockClear(); eq.mockClear(); insert.mockClear();
    readResult = { data: [], error: null };
    saveResult = { data: row, error: null };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
      getItem: () => { throw new Error("Time off must not read browser storage"); },
      setItem: () => { throw new Error("Time off must not write browser storage"); },
    } });
  });

  test("reads persisted time off for this teacher without browser storage", async () => {
    readResult.data = [row];
    expect(await fetchTeacherTimeOff("teacher-id")).toEqual([{
      id: "saved-id", teacherId: "teacher-id", startDate: "2026-10-20", endDate: "2026-10-22",
      type: "Férias", title: undefined, notes: undefined, createdAt: row.created_at,
    }]);
    expect(from).toHaveBeenCalledWith("teacher_time_off");
    expect(eq).toHaveBeenCalledWith("teacher_id", "teacher-id");
  });

  test("failed reads reject instead of returning cached dates or an empty vacation list", async () => {
    readResult = { data: null, error: new Error("read failed") };
    await expect(fetchTeacherTimeOff("teacher-id")).rejects.toThrow("read failed");
  });

  test.each(["2026-10-20", "2026-10-22"])("single/range creation saves to teacher_time_off (%s)", async (endDate) => {
    saveResult.data = { ...row, end_date: endDate };
    const result = await createTeacherTimeOff("teacher-id", { ...input, endDate });
    expect(result.success).toBe(true);
    expect(result.data?.id).toBe("saved-id");
    expect(from).toHaveBeenCalledWith("teacher_time_off");
    expect(insert).toHaveBeenCalledWith({ teacher_id: "teacher-id", start_date: input.startDate, end_date: endDate, type: "Férias", title: null, notes: null });
  });

  test("single/range save failure never reports success", async () => {
    saveResult = { data: null, error: { message: "save failed" } };
    expect(await createTeacherTimeOff("teacher-id", input)).toEqual({ success: false, error: "save failed" });
  });

  test("batch success returns only database-created records", async () => {
    saveResult.data = [row];
    const result = await createTeacherTimeOffBatch("teacher-id", [input]);
    expect(result.success).toBe(true);
    expect(result.count).toBe(1);
    expect(result.data?.[0].id).toBe("saved-id");
    expect(insert).toHaveBeenCalledWith([{ teacher_id: "teacher-id", start_date: input.startDate, end_date: input.endDate, type: "Férias", title: null, notes: null }]);
  });

  test("batch save failure returns an error without local success", async () => {
    saveResult = { data: null, error: { message: "save failed" } };
    expect(await createTeacherTimeOffBatch("teacher-id", [input])).toEqual({ success: false, error: "save failed" });
  });

  test("batch stops without inserting when its initial database read fails", async () => {
    readResult = { data: null, error: new Error("read failed") };
    expect(await createTeacherTimeOffBatch("teacher-id", [input])).toEqual({ success: false, error: "read failed" });
    expect(insert).not.toHaveBeenCalled();
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  writes: [] as Array<Record<string, unknown>>,
  fail: false,
  calls: 0,
}));
vi.mock("@/lib/supabase", () => ({ supabase: {
  from: (table: string) => {
    expect(table).toBe("lesson_plans");
    state.calls++;
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let patch: Record<string, unknown> | undefined;
    const execute = () => {
      if (state.fail) return { data: null, error: new Error("permission denied") };
      const rows = state.rows.filter((row) => filters.every((matches) => matches(row)));
      if (patch) { state.writes.push(patch); rows.forEach((row) => Object.assign(row, patch)); }
      return { data: rows.map((row) => ({ event_id: row.event_id, homework_posted: row.homework_posted })), error: null };
    };
    const builder = {
      select: () => builder,
      update: (value: Record<string, unknown>) => { patch = value; return builder; },
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return builder; },
      in: (key: string, values: unknown[]) => { filters.push((row) => values.includes(row[key])); return builder; },
      single: async () => {
        const result = execute();
        return { ...result, data: result.data?.[0] ?? null };
      },
      then: (resolve: (value: ReturnType<typeof execute>) => unknown) => Promise.resolve(execute()).then(resolve),
    };
    return builder;
  },
} }));

import { fetchHomeworkStatuses, saveHomeworkStatus, homeworkStatusValue, homeworkPostedValue } from "@/lib/homework-status";

beforeEach(() => {
  state.rows = [
    { teacher_id: "teacher-a", event_id: "event-a", homework_posted: null, homework: "Read chapter 1", duration: 45 },
    { teacher_id: "teacher-a", event_id: "event-group", homework_posted: false, class_id: "group-a" },
    { teacher_id: "teacher-b", event_id: "event-b", homework_posted: true },
  ];
  state.writes = []; state.calls = 0; state.fail = false;
});

describe("Shared event-linked homework status", () => {
  it.each([
    ["unrecorded", null], ["pending", false], ["posted", true],
  ] as const)("maps and reads back %s using only homework_posted", async (status, posted) => {
    expect(homeworkPostedValue(status)).toBe(posted);
    expect(homeworkStatusValue(posted)).toBe(status);
    expect(await saveHomeworkStatus("teacher-a", "event-a", status)).toBe(posted);
    expect(await fetchHomeworkStatuses("teacher-a", ["event-a"])).toEqual({ "event-a": posted });
    expect(state.writes).toEqual([{ homework_posted: posted }]);
    expect(state.rows[0]).toMatchObject({ homework: "Read chapter 1", duration: 45 });
    expect(state.rows[1].homework_posted).toBe(false);
    expect(state.rows[2].homework_posted).toBe(true);
  });

  it("uses the same event_id status for a class/group without student lookup", async () => {
    await saveHomeworkStatus("teacher-a", "event-group", "posted");
    expect(await fetchHomeworkStatuses("teacher-a", ["event-group"])).toEqual({ "event-group": true });
  });

  it("does not read or mutate another teacher's status", async () => {
    expect(await fetchHomeworkStatuses("teacher-a", ["event-b"])).toEqual({});
    await expect(saveHomeworkStatus("teacher-a", "event-b", "pending")).rejects.toThrow();
    expect(state.rows[2].homework_posted).toBe(true);
  });

  it("does not invent a plan or status when an event has no linked plan", async () => {
    expect(await fetchHomeworkStatuses("teacher-a", ["missing"])).toEqual({});
    await expect(saveHomeworkStatus("teacher-a", "missing", "pending")).rejects.toThrow();
    expect(state.rows).toHaveLength(3);
  });

  it("preserves the saved status when a write fails", async () => {
    state.fail = true;
    await expect(saveHomeworkStatus("teacher-a", "event-a", "posted")).rejects.toThrow();
    expect(state.rows[0].homework_posted).toBeNull();
    expect(state.writes).toEqual([]);
  });

  it("does not query before authentication or with no event IDs", async () => {
    expect(await fetchHomeworkStatuses("", ["event-a"])).toEqual({});
    expect(await fetchHomeworkStatuses("teacher-a", [])).toEqual({});
    await expect(saveHomeworkStatus("", "event-a", "posted")).rejects.toThrow();
    expect(state.calls).toBe(0);
  });
});
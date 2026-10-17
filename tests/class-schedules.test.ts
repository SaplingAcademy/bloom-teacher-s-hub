import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: [] as Array<Record<string, any>>, insertedEvents: [] as any[], fail: false, next: 0, classStatus: "active" }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => {
  const filters: Array<(row: any) => boolean> = [];
  let mode = "read"; let payload: any;
  const run = () => {
    if (db.fail) return { data: null, error: new Error("failed") };
    if (table === "classes") return { data: [{ id: "class", teacher_id: "teacher", status: db.classStatus }], error: null };
    const matches = (row: any) => filters.every((filter) => filter(row));
    if (mode === "delete") db.rows = db.rows.filter((row) => !matches(row));
    if (mode === "update") db.rows.filter(matches).forEach((row) => Object.assign(row, payload));
    if (mode === "insert") { const row = { ...payload, id: `new-${++db.next}` }; db.rows.push(row); return { data: [row], error: null }; }
    return { data: db.rows.filter(matches), error: null };
  };
  const q = {
    select: () => q,
    eq: (key: string, value: any) => { filters.push((row) => row[key] === value); return q; },
    in: (key: string, values: any[]) => { filters.push((row) => values.includes(row[key])); return q; },
    delete: () => { mode = "delete"; return q; },
    update: (value: any) => { mode = "update"; payload = value; return q; },
    insert: (value: any) => { mode = "insert"; payload = value; return q; },
    single: async () => { const result = run(); return { ...result, data: result.data?.[0] }; },
    then: (resolve: (value: any) => any) => Promise.resolve(run()).then(resolve),
  };
  return q;
} } }));
vi.mock("@/lib/time-off-engine", () => ({
  fetchTeacherTimeOff: async () => [],
  formatLocalDateStr: () => "2026-10-19",
  checkDateIsNonWorking: () => false,
}));
vi.mock("@/lib/lesson-plans", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/lesson-plans")>();
  return { ...original, insertClassEvents: async (_teacher: string, _class: string, rows: any[]) => {
    db.insertedEvents = rows;
    return { inserted: rows.length };
  } };
});

import { persistClassSchedules, resizeClassSchedules, WEEKLY_LESSON_COUNTS, type ClassScheduleInput } from "@/lib/class-schedules";
import { projectClassSchedulesToCalendar } from "@/lib/class-sync";

const slots: ClassScheduleInput[] = [
  { weekday: "Monday", startTime: "09:00", duration: 45, deliveryMode: "Online" },
  { weekday: "Wednesday", startTime: "14:00", duration: 90, deliveryMode: "In person" },
  { weekday: "Friday", startTime: "11:00", duration: 30, deliveryMode: "Online" },
];
beforeEach(() => { db.rows = []; db.insertedEvents = []; db.fail = false; db.next = 0; db.classStatus = "active"; });

describe("Multiple weekly class schedules", () => {
  it("archived class retains schedule IDs but projects no future lessons", async () => {
    const saved = await persistClassSchedules("teacher", "class", slots);
    db.classStatus = "archived";
    await projectClassSchedulesToCalendar("teacher", "class", "Archived", "B1", saved);
    expect(db.insertedEvents).toEqual([]);
    expect(db.rows.map((row) => row.id)).toEqual(["new-1", "new-2", "new-3"]);
  });
  it.each([1, 2, 3])("persists and projects every slot of a class with %i weekly lessons", async (count) => {
    const saved = await persistClassSchedules("teacher", "class", slots.slice(0, count));
    expect(db.rows).toHaveLength(count);
    expect(saved.map((slot) => slot.id)).toEqual(Array.from({ length: count }, (_, index) => `new-${index + 1}`));
    await projectClassSchedulesToCalendar("teacher", "class", "Conversation", "B1", saved);
    expect(db.insertedEvents).toHaveLength(12);
    for (const slot of saved) {
      const events = db.insertedEvents.filter((event) => event.class_schedule_id === slot.id);
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.start_time === `${slot.startTime}:00` && event.duration === slot.duration)).toBe(true);
    }
  });

  it("loads existing IDs into edits, adds a slot, updates retained slots and removes only the omitted one", async () => {
    const initial = await persistClassSchedules("teacher", "class", slots.slice(0, 2));
    const expanded = resizeClassSchedules(initial, 3);
    expect(expanded.slice(0, 2)).toEqual(initial);
    expanded[2] = slots[2];
    const saved = await persistClassSchedules("teacher", "class", expanded);
    expect(saved.map((slot) => slot.id)).toEqual(["new-1", "new-2", "new-3"]);
    const reduced = resizeClassSchedules(saved, 1).map((slot) => ({ ...slot, duration: 75 }));
    await persistClassSchedules("teacher", "class", reduced);
    expect(db.rows).toEqual([expect.objectContaining({ id: "new-1", duration: 75, end_time: "10:15:00" })]);
  });

  it("offers exactly 1–7 and never assigns an existing ID to a new slot", () => {
    expect(WEEKLY_LESSON_COUNTS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(resizeClassSchedules([{ ...slots[0], id: "existing" }], 2)[1].id).toBeUndefined();
    expect(() => resizeClassSchedules(slots, 8)).toThrow();
  });

  it("propagates persistence failure instead of reporting success", async () => {
    db.fail = true;
    await expect(persistClassSchedules("teacher", "class", slots)).rejects.toThrow();
    expect(db.rows).toEqual([]);
  });
});
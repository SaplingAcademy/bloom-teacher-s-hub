import { beforeEach, describe, expect, mock, test } from "bun:test";

type Row = Record<string, any>;
let tables: Record<string, Row[]>;
let upserts: Row[];
let failMembers = false;

mock.module("@/lib/supabase", () => ({ supabase: {
  from(table: string) {
    const filters: Array<(row: Row) => boolean> = [];
    let selection = "";
    let patch: Row | undefined;
    let payload: Row[] | undefined;
    const execute = () => {
      if (table === "class_members" && failMembers) return { data: null, error: new Error("read denied") };
      if (payload) for (const record of payload) {
        upserts.push(record);
        const existing = tables[table].find((row) => row.event_id === record.event_id && row.student_id === record.student_id);
        if (existing) Object.assign(existing, record);
        else tables[table].push({ ...record });
      }
      const rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
      if (patch) rows.forEach((row) => Object.assign(row, patch));
      const data = rows.map((row) => table === "calendar_events" && selection.includes("attendance_records")
        ? { ...row, attendance_records: tables.attendance_records.filter((record) => record.event_id === row.id) }
        : { ...row });
      return { data, error: null };
    };
    const builder = {
      select(value: string) { selection = value; return builder; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return builder; },
      is(key: string, value: unknown) { filters.push((row) => row[key] === value); return builder; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return builder; },
      update(value: Row) { patch = value; return builder; },
      upsert(value: Row[], options: { onConflict: string }) {
        expect(table).toBe("attendance_records");
        expect(options.onConflict).toBe("event_id,student_id");
        payload = value; return builder;
      },
      async single() { const result = execute(); return { ...result, data: result.data?.[0] || null }; },
      async maybeSingle() { const result = execute(); return { ...result, data: result.data?.[0] || null }; },
      then(resolve: (value: ReturnType<typeof execute>) => unknown) { return Promise.resolve(execute()).then(resolve); },
    };
    return builder;
  },
} }));

const { fetchCalendarClassAttendance, saveCalendarClassAttendance } = await import("../src/lib/calendar-class-attendance");
const { fetchAttendanceForEvents, saveAttendanceRecords, ATTENDANCE_STATUSES } = await import("../src/lib/lesson-plans");

beforeEach(() => {
  const member = (student: string, group = "class-a", teacher = "teacher-a", status = "active", joined = "2026-01-01", left: string | null = null) => ({
    student_id: student, class_id: group, teacher_id: teacher, status, joined_at: joined, left_at: left, students: { full_name: student },
  });
  tables = {
    calendar_events: [
      { id: "event-a", teacher_id: "teacher-a", class_id: "class-a", student_id: null, date: "2026-10-23", status: "Scheduled", attendance_recorded: false },
      { id: "event-other-date", teacher_id: "teacher-a", class_id: "class-a", student_id: null, date: "2026-10-24", status: "Scheduled", attendance_recorded: false },
      { id: "event-individual", teacher_id: "teacher-a", class_id: null, student_id: "solo", date: "2026-10-23", status: "Scheduled", attendance_recorded: false },
    ],
    class_members: [member("ana"), member("bia"), member("other", "class-b"), member("outsider", "class-a", "teacher-b"), member("removed", "class-a", "teacher-a", "removed", "2026-01-01", "2026-10-20"), member("not-yet", "class-a", "teacher-a", "active", "2026-11-01")],
    attendance_records: [{ teacher_id: "teacher-a", event_id: "event-a", student_id: "ana", status: "late", notes: "Keep this note" }],
  };
  upserts = []; failMembers = false;
});

describe("Calendar and class Lesson Plan share occurrence attendance", () => {
  test("loads only real active members of the owned class for this lesson", async () => {
    const result = await fetchCalendarClassAttendance("teacher-a", "class-a", "event-a");
    expect(result.members.map((row) => row.student_id)).toEqual(["ana", "bia"]);
    await expect(fetchCalendarClassAttendance("teacher-b", "class-a", "event-a")).rejects.toThrow();
  });
  test("Calendar changes read back through Lesson Plan without duplicates or lost notes", async () => {
    await saveCalendarClassAttendance("teacher-a", "class-a", "event-a", "ana", "present");
    const plans = await fetchAttendanceForEvents(["event-a"]);
    expect(plans["event-a"]).toHaveLength(1);
    expect(plans["event-a"][0]).toMatchObject({ student_id: "ana", status: "present", notes: "Keep this note" });
  });
  test("Lesson Plan changes read back through Calendar with exactly the existing statuses", async () => {
    expect(ATTENDANCE_STATUSES).toEqual(["present", "absent", "late", "excused"]);
    for (const status of ATTENDANCE_STATUSES) {
      await saveAttendanceRecords("teacher-a", "event-a", [{ student_id: "bia", status }]);
      expect((await fetchCalendarClassAttendance("teacher-a", "class-a", "event-a")).records.find((row) => row.student_id === "bia")?.status).toBe(status);
    }
    expect(tables.calendar_events[0].attendance_recorded).toBe(true);
  });
  test("one occurrence cannot alter attendance or completion on another date", async () => {
    await saveAttendanceRecords("teacher-a", "event-other-date", [{ student_id: "ana", status: "excused" }]);
    await saveCalendarClassAttendance("teacher-a", "class-a", "event-a", "ana", "absent");
    expect((await fetchAttendanceForEvents(["event-other-date"]))["event-other-date"][0].status).toBe("excused");
    expect(tables.calendar_events[1].attendance_recorded).toBe(false);
  });
  test("cancelled occurrences cannot create or change attendance", async () => {
    tables.calendar_events[0].status = "Cancelled";
    await expect(saveCalendarClassAttendance("teacher-a", "class-a", "event-a", "bia", "present")).rejects.toThrow("Cancelled");
    expect(upserts).toHaveLength(0);
    expect(tables.attendance_records[0].status).toBe("late");
  });
  test("inactive and other-class members cannot be recorded", async () => {
    await expect(saveCalendarClassAttendance("teacher-a", "class-a", "event-a", "removed", "present")).rejects.toThrow("Inactive");
    await expect(saveCalendarClassAttendance("teacher-a", "class-a", "event-a", "other", "present")).rejects.toThrow("Inactive");
    expect(upserts).toHaveLength(0);
  });
  test("individual attendance still uses the original helper and occurrence", async () => {
    await saveAttendanceRecords("teacher-a", "event-individual", [{ student_id: "solo", status: "present" }]);
    expect(tables.calendar_events[2].attendance_recorded).toBe(true);
    expect((await fetchAttendanceForEvents(["event-individual"]))["event-individual"][0]).toMatchObject({ student_id: "solo", status: "present" });
  });
  test("failed member reads cannot appear as an empty successful class", async () => {
    failMembers = true;
    await expect(fetchCalendarClassAttendance("teacher-a", "class-a", "event-a")).rejects.toThrow("read denied");
    expect(upserts).toHaveLength(0);
  });
});
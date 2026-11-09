import { describe, expect, test } from "bun:test";
import { buildHomeworkItems, buildPendingTaskItems, homeworkPendingPublication, lessonWasHeld } from "../src/lib/daily-priorities";

const today = "2026-11-10";
const held = { date: "2026-11-08", status: "Completed", attendance_recorded: true, attendance_records: [{ status: "present" }] };
const plan = (p: Record<string, unknown> = {}) => ({
  event_id: "ev1", student_id: "s1", class_id: null, lesson_number: 4, scheduled_date: "2026-11-08",
  homework: "Workbook p. 12", homework_posted: null, students: { full_name: "Ana" }, classes: null,
  calendar_events: held, ...p,
});

describe("Homework priorities come only from held lesson-plan lessons", () => {
  test("held lesson with planned, unpublished homework → one Tarefas item with lesson, date and link", () => {
    expect(buildHomeworkItems([plan()], today)).toEqual([{
      id: "homework:ev1", category: "task", urgency: "critical", reason: "homework_not_posted", title: "Ana",
      params: { date: "2026-11-08", lesson: 4 }, date: "2026-11-08",
      ref: { studentId: "s1", classId: undefined, eventId: "ev1" },
      action: { route: "/students", params: { studentId: "s1", tab: "Lessons" } },
    }]);
    const cls = buildHomeworkItems([plan({ student_id: null, class_id: "c1", classes: { name: "Turma B1" }, students: null })], today)[0];
    expect(cls).toMatchObject({ title: "Turma B1", action: { route: "/students", params: { classId: "c1", eventId: "ev1" } } });
  });

  test("published homework or no planned homework never alerts", () => {
    expect(buildHomeworkItems([plan({ homework_posted: true })], today)).toEqual([]);
    expect(buildHomeworkItems([plan({ homework: "  " })], today)).toEqual([]);
    expect(homeworkPendingPublication({ homework: "x", homework_posted: false })).toBe(true);
  });

  test("past date alone is not proof: unrecorded, cancelled, archived or all-absent lessons are skipped", () => {
    expect(lessonWasHeld({ ...held, attendance_recorded: false })).toBe(false);
    expect(lessonWasHeld({ ...held, status: "Cancelled" })).toBe(false);
    expect(lessonWasHeld({ ...held, status: "Closed" })).toBe(false);
    expect(lessonWasHeld({ ...held, attendance_records: [{ status: "absent" }, { status: "excused" }] })).toBe(false);
    expect(lessonWasHeld({ ...held, attendance_records: [{ status: "absent" }, { status: "late" }] })).toBe(true);
    expect(buildHomeworkItems([plan({ calendar_events: { ...held, attendance_recorded: false } })], today)).toEqual([]);
  });

  test("future lessons never alert and a rescheduled occurrence uses its new date", () => {
    expect(buildHomeworkItems([plan({ calendar_events: { ...held, date: "2026-11-12" } })], today)).toEqual([]);
    const moved = buildHomeworkItems([plan({ scheduled_date: "2026-11-01", calendar_events: { ...held, date: "2026-11-10" } })], today)[0];
    expect(moved).toMatchObject({ date: "2026-11-10", urgency: "today", params: { date: "2026-11-10" } });
  });

  test("one priority per occurrence", () => {
    expect(buildHomeworkItems([plan(), plan()], today)).toHaveLength(1);
  });

  test("operational tasks never become homework", () => {
    const tasks = buildPendingTaskItems(
      [{ id: "t1", title: "Responder lead", due_date: "2026-11-09", lead_id: "L1" }, { id: "t2", title: "Tarefa", due_date: "2026-11-09", lead_id: null }],
      today, "2026-11-11T00:00:00.000Z",
    );
    expect(tasks.map((i) => i.category)).toEqual(["lead"]);
  });
});

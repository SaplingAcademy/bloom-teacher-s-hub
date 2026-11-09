import { supabase } from "@/lib/supabase";
import { fetchCalendarClassAttendance } from "@/lib/calendar-class-attendance";
import { fetchAttendanceForEvents, saveAttendanceRecords, type AttendanceStatus } from "@/lib/lesson-plans";
import { homeworkStatusValue, saveHomeworkStatus, type HomeworkStatus } from "@/lib/homework-status";
import type { DailyPriorityItem } from "@/lib/daily-priorities";

/**
 * Today priorities resolution: thin adapters over the canonical attendance and
 * homework-status flows (the same ones Calendar and the Lesson Plans use). Nothing is
 * stored separately; a priority disappears only when its source condition is resolved
 * and the priorities are re-read.
 */

export interface AttendanceRosterEntry {
  studentId: string;
  name: string;
  status: AttendanceStatus | null;
  notes: string;
}

export interface AttendanceRoster {
  eventId: string;
  classId: string | null;
  entries: AttendanceRosterEntry[];
}

/** Expected attendees with their current records (class: members active on that date). */
export async function loadAttendanceRoster(teacherId: string, item: DailyPriorityItem): Promise<AttendanceRoster> {
  const { eventId, classId, studentId } = item.ref;
  if (!teacherId || !eventId) throw new Error("Missing attendance scope");
  if (classId) {
    const current = await fetchCalendarClassAttendance(teacherId, classId, eventId);
    const byStudent = new Map(current.records.map((r) => [r.student_id, r]));
    return {
      eventId,
      classId,
      entries: current.members.map((m) => ({
        studentId: m.student_id,
        name: m.student_name,
        status: byStudent.get(m.student_id)?.status ?? null,
        notes: byStudent.get(m.student_id)?.notes || "",
      })),
    };
  }
  if (!studentId) throw new Error("Missing attendance scope");
  const records = (await fetchAttendanceForEvents([eventId], teacherId))[eventId] || [];
  const record = records.find((r) => r.student_id === studentId);
  return {
    eventId,
    classId: null,
    entries: [{ studentId, name: item.title, status: record?.status ?? null, notes: record?.notes || "" }],
  };
}

/**
 * Saves the chosen statuses through saveAttendanceRecords (upsert + attendance_recorded
 * sync). Class occurrences are re-validated like saveCalendarClassAttendance: not
 * cancelled, and only students expected on that date.
 */
export async function saveRosterAttendance(
  teacherId: string,
  roster: AttendanceRoster,
  statuses: Record<string, AttendanceStatus | null>,
): Promise<void> {
  let allowed = new Map(roster.entries.map((e) => [e.studentId, e]));
  if (roster.classId) {
    const current = await fetchCalendarClassAttendance(teacherId, roster.classId, roster.eventId);
    if (current.status === "Cancelled") throw new Error("Cancelled occurrence");
    const expected = new Set(current.members.map((m) => m.student_id));
    allowed = new Map([...allowed].filter(([id]) => expected.has(id)));
  }
  const rows = [...allowed.values()].flatMap((entry) => {
    const status = statuses[entry.studentId];
    return status ? [{ student_id: entry.studentId, status, notes: entry.notes }] : [];
  });
  if (rows.length === 0) throw new Error("No attendance selected");
  await saveAttendanceRecords(teacherId, roster.eventId, rows);
}

export interface LessonHomework {
  eventId: string;
  homework: string;
  status: HomeworkStatus;
}

/** Planned homework and its teacher-recorded status, read from the lesson plan row. */
export async function loadLessonHomework(teacherId: string, eventId: string): Promise<LessonHomework> {
  const { data, error } = await supabase
    .from("lesson_plans")
    .select("event_id, homework, homework_posted")
    .eq("teacher_id", teacherId)
    .eq("event_id", eventId)
    .single();
  if (error) throw error;
  return { eventId, homework: data?.homework || "", status: homeworkStatusValue(data?.homework_posted) };
}

/**
 * Records that the teacher sent the homework to the student(s). Bloom itself does not
 * deliver homework; this is the same status the Lesson Plan's homework control saves.
 */
export async function markHomeworkSent(teacherId: string, eventId: string): Promise<void> {
  const saved = await saveHomeworkStatus(teacherId, eventId, "posted");
  if (saved !== true) throw new Error("Homework status not saved");
}

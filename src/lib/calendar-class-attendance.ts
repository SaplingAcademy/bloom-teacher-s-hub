import { supabase } from "@/lib/supabase";
import { expectedClassAttendees } from "@/lib/attendance-recorded";
import { fetchAttendanceForEvents, saveAttendanceRecords, type AttendanceRecordRow, type AttendanceStatus } from "@/lib/lesson-plans";

export interface CalendarClassAttendance {
  status: string;
  members: Array<{ student_id: string; student_name: string }>;
  records: AttendanceRecordRow[];
}

/** Read only the selected owned occurrence and its real active class members. */
export async function fetchCalendarClassAttendance(teacherId: string, classId: string, eventId: string): Promise<CalendarClassAttendance> {
  if (!teacherId || !classId || !eventId) throw new Error("Missing attendance scope");
  const { data: event, error: eventError } = await supabase.from("calendar_events")
    .select("id, class_id, status, date").eq("teacher_id", teacherId).eq("class_id", classId).eq("id", eventId).single();
  if (eventError) throw eventError;
  if (!event) throw new Error("Occurrence not found");

  const [memberResult, attendance] = await Promise.all([
    supabase.from("class_members").select("student_id, joined_at, left_at, students(full_name)")
      .eq("teacher_id", teacherId).eq("class_id", classId).eq("status", "active").is("left_at", null),
    fetchAttendanceForEvents([eventId], teacherId),
  ]);
  if (memberResult.error) throw memberResult.error;
  const rows = memberResult.data || [];
  const expected = new Set(expectedClassAttendees(rows, event.date));
  const members = new Map<string, { student_id: string; student_name: string }>();
  for (const row of rows) {
    if (!expected.has(row.student_id)) continue;
    const student = Array.isArray(row.students) ? row.students[0] : row.students;
    members.set(row.student_id, { student_id: row.student_id, student_name: student?.full_name || "" });
  }
  return { status: event.status, members: [...members.values()], records: attendance[eventId] || [] };
}

/** Same event/student upsert and derived completion as the class Lesson Plan. */
export async function saveCalendarClassAttendance(teacherId: string, classId: string, eventId: string, studentId: string, status: AttendanceStatus) {
  const current = await fetchCalendarClassAttendance(teacherId, classId, eventId);
  if (current.status === "Cancelled") throw new Error("Cancelled occurrence");
  if (!current.members.some((member) => member.student_id === studentId)) throw new Error("Inactive class member");
  const record = current.records.find((row) => row.student_id === studentId);
  await saveAttendanceRecords(teacherId, eventId, [{ student_id: studentId, status, notes: record?.notes }]);
  return fetchCalendarClassAttendance(teacherId, classId, eventId);
}
import { supabase } from "@/lib/supabase";

export type AttendancePriorityAge = "normal" | "urgent" | "future";

export interface AttendancePriorityCandidate {
  eventId: string;
  studentId: string;
  studentName: string;
  classId?: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  age: Exclude<AttendancePriorityAge, "future">;
}

const RESOLVED_EVENT_STATUSES = new Set(["cancelled", "closed"]);

function parseLocalDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const normalizedTime = /^\d{2}:\d{2}/.test(time || "") ? time.slice(0, 5) : "23:59";
  const parsed = new Date(`${date}T${normalizedTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function classifyAttendancePriority(
  lessonDate: string,
  lessonEndTime: string,
  now: Date = new Date()
): AttendancePriorityAge {
  const lessonEnd = parseLocalDateTime(lessonDate, lessonEndTime);
  if (!lessonEnd || lessonEnd.getTime() > now.getTime()) return "future";

  const lessonDay = parseLocalDateTime(lessonDate, "00:00");
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!lessonDay) return "future";
  const elapsedDays = Math.floor((today.getTime() - lessonDay.getTime()) / 86_400_000);
  return elapsedDays > 5 ? "urgent" : "normal";
}

/**
 * Derives missing attendance from the canonical lesson occurrence and attendance
 * records. No task or secondary persistence is created.
 */
export async function fetchAttendancePriorityCandidates(
  teacherId: string,
  now: Date = new Date()
): Promise<AttendancePriorityCandidate[]> {
  if (!teacherId) return [];
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");

  const { data: planRows, error } = await supabase
    .from("lesson_plans")
    .select("event_id, student_id, class_id, calendar_events:event_id(id, teacher_id, student_id, class_id, student_name, date, start_time, end_time, status)")
    .eq("teacher_id", teacherId)
    .lte("scheduled_date", today);

  if (error) throw error;

  const plans = (planRows || []).filter((row: any) => {
    const event = row.calendar_events;
    return event?.id && event.teacher_id === teacherId && !RESOLVED_EVENT_STATUSES.has(String(event.status || "").toLowerCase());
  });
  const eventIds = [...new Set(plans.map((row: any) => row.event_id).filter(Boolean))];
  if (eventIds.length === 0) return [];

  const classIds = [...new Set(plans.map((row: any) => row.class_id).filter(Boolean))] as string[];
  const [attendanceResult, membersResult] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("event_id, student_id, status")
      .eq("teacher_id", teacherId)
      .in("event_id", eventIds),
    classIds.length > 0
      ? supabase
          .from("class_members")
          .select("class_id, student_id, status, left_at, students(full_name)")
          .eq("teacher_id", teacherId)
          .in("class_id", classIds)
          .eq("status", "active")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (attendanceResult.error) throw attendanceResult.error;
  if (membersResult.error) throw membersResult.error;

  const recorded = new Set(
    (attendanceResult.data || []).map((row: any) => `${row.event_id}:${row.student_id}`)
  );
  const membersByClass = new Map<string, any[]>();
  for (const member of membersResult.data || []) {
    if (member.left_at) continue;
    const list = membersByClass.get(member.class_id) || [];
    list.push(member);
    membersByClass.set(member.class_id, list);
  }

  const candidates: AttendancePriorityCandidate[] = [];
  for (const plan of plans as any[]) {
    const event = plan.calendar_events;
    const age = classifyAttendancePriority(event.date, event.end_time || event.start_time, now);
    if (age === "future") continue;

    const students = plan.class_id
      ? (membersByClass.get(plan.class_id) || []).map((member) => ({
          id: member.student_id,
          name: member.students?.full_name || "Aluno",
        }))
      : [{ id: plan.student_id || event.student_id, name: event.student_name || "Aluno" }];

    for (const student of students) {
      if (!student.id || recorded.has(`${event.id}:${student.id}`)) continue;
      candidates.push({
        eventId: event.id,
        studentId: student.id,
        studentName: student.name,
        classId: plan.class_id || undefined,
        lessonDate: event.date,
        startTime: event.start_time || "",
        endTime: event.end_time || event.start_time || "",
        age,
      });
    }
  }

  return candidates;
}
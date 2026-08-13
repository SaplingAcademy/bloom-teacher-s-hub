import { supabase } from "@/lib/supabase";
import { formatTimeHHMMSS, calculateEndTime, CEFRLevel, CourseFocus } from "./calendar-sync";
import {
  fetchLessonPlans,
  saveLessonPlans,
  fetchAttendanceForEvents,
  saveAttendanceRecords,
  clearAttendanceRecord,
  LessonPlan,
} from "./lesson-plans";

export interface LessonAttachment {
  id: string;
  type: "file" | "link";
  title?: string;
  file_path?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number; // in bytes
  created_at?: string;
}

export interface StudentLesson {
  id?: string;
  /** occurrence in calendar_events this plan belongs to (1:1) */
  event_id?: string;
  teacher_id: string;
  student_id: string;
  schedule_id?: string | null;
  lesson_number: number;
  scheduled_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM or HH:MM:SS
  end_time: string; // HH:MM or HH:MM:SS
  duration: number; // minutes, default 60
  content: string;
  homework: string;
  homework_posted?: boolean | null;
  attendance_status: "Present" | "Absent" | "Cancelled" | "Rescheduled" | null;
  completed: boolean;
  notes: string;
  attachments?: LessonAttachment[];
  created_at?: string;
  updated_at?: string;
}

export interface LessonScheduleInput {
  id?: string;
  weekday: string; // "Monday", "Tuesday", etc.
  startTime: string; // "09:00"
  endTime?: string; // "10:00"
  duration?: number; // 60
}

/**
 * Converts weekday name to 0-6 JS day index (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
export function getDayIndex(dayName: string): number {
  const days: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  return days[dayName] ?? 1;
}

/**
 * Calculates a sequential array of lesson occurrences starting from startDateStr
 * matching the student's weekly schedule until totalLessons count is reached.
 */
import {
  checkDateIsNonWorking,
  isTeacherAvailableOnDate,
  formatLocalDateStr,
  TeacherTimeOff,
} from "./time-off-engine";

/**
 * Calculates a sequential array of lesson occurrences starting from startDateStr
 * matching the student's weekly schedule until totalLessons count is reached,
 * skipping teacher non-working dates without consuming student lesson credits.
 */
export function generateLessonPlanOccurrences(
  startDateStr: string,
  schedules: LessonScheduleInput[],
  totalLessons: number = 23,
  studentId: string,
  teacherId: string,
  timeOffList: TeacherTimeOff[] = []
): StudentLesson[] {
  if (!schedules || schedules.length === 0 || totalLessons <= 0) {
    return [];
  }

  const start = new Date((startDateStr || formatLocalDateStr(new Date())) + "T00:00:00");
  const lessons: StudentLesson[] = [];

  // Map schedules to weekday index & sort by startTime
  const scheduleSlots = schedules.map((sch) => ({
    ...sch,
    dayIdx: getDayIndex(sch.weekday),
    startTimeStr: sch.startTime || "09:00",
  })).sort((a, b) => a.startTimeStr.localeCompare(b.startTimeStr));

  let currDate = new Date(start);
  let lessonCounter = 1;

  // Safety limit to avoid infinite loop (scans max 2 years)
  const maxDaysToScan = 365 * 2;
  let scannedDays = 0;

  while (lessonCounter <= totalLessons && scannedDays < maxDaysToScan) {
    const currentDayIdx = currDate.getDay();
    const dateStr = formatLocalDateStr(currDate);
    const isNonWorking = checkDateIsNonWorking(dateStr, timeOffList);

    // Only generate lessons if the teacher is available on this date
    if (!isNonWorking) {
      const matchingSlots = scheduleSlots.filter((slot) => slot.dayIdx === currentDayIdx);

      // If matches one or more slots on this weekday, add lessons for each slot in chronological order
      for (const slot of matchingSlots) {
        if (lessonCounter > totalLessons) break;

        const rawStart = slot.startTime || "09:00";
        const dur = slot.duration || 60;
        const rawEnd = slot.endTime || calculateEndTime(rawStart, dur);

        lessons.push({
          teacher_id: teacherId,
          student_id: studentId,
          schedule_id: slot.id || null,
          lesson_number: lessonCounter,
          scheduled_date: dateStr,
          start_time: formatTimeHHMMSS(rawStart),
          end_time: formatTimeHHMMSS(rawEnd),
          duration: dur,
          content: "",
          homework: "",
          homework_posted: null,
          attendance_status: null,
          completed: false,
          notes: "",
        });

        lessonCounter++;
      }
    }

    // Advance to next calendar day
    currDate.setDate(currDate.getDate() + 1);
    scannedDays++;
  }

  return lessons;
}

/**
 * Calculates the expected final lesson date for preview before generating,
 * accounting for non-working day exclusions.
 */
export function calculateExpectedEndDate(
  startDateStr: string,
  schedules: LessonScheduleInput[],
  totalLessons: number = 23,
  timeOffList: TeacherTimeOff[] = []
): string {
  const occurrences = generateLessonPlanOccurrences(
    startDateStr,
    schedules,
    totalLessons,
    "temp-student",
    "temp-teacher",
    timeOffList
  );
  if (occurrences.length === 0) return "";
  return occurrences[occurrences.length - 1].scheduled_date;
}

/**
 * Fetches the student's lesson plans from the unified `lesson_plans` table,
 * mapping event status + attendance_records back to the legacy display shape.
 */
/**
 * Reads the student's permanent recurring schedule (source of truth:
 * `student_schedules`) and maps it to the generator's input shape.
 * Read-only: never mutates the student's permanent schedule.
 */
export async function fetchStudentScheduleInputs(
  studentId: string
): Promise<LessonScheduleInput[]> {
  if (!studentId) return [];
  try {
    const { data, error } = await supabase
      .from("student_schedules")
      .select("*")
      .eq("student_id", studentId);

    if (error || !data) {
      if (error) console.warn("[lesson-plan-sync] fetchStudentScheduleInputs error:", error.message);
      return [];
    }

    const weekdayOrder = [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ];

    const rows: LessonScheduleInput[] = (data as any[])
      .filter((r) => r?.weekday)
      .map((r) => {
        const startTime = String(r.start_time || "09:00").slice(0, 5);
        const durationRaw = Number(r.duration_minutes) || 0;
        let endTime = r.end_time ? String(r.end_time).slice(0, 5) : "";
        let duration = durationRaw;

        if (!endTime) {
          endTime = calculateEndTime(startTime, duration || 60).slice(0, 5);
        }
        if (!duration) {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          const diff = eh * 60 + em - (sh * 60 + sm);
          duration = diff > 0 ? diff : 60;
        }

        return {
          id: r.id,
          weekday: String(r.weekday),
          startTime,
          endTime,
          duration,
        };
      });

    return rows.sort((a, b) => {
      const d = weekdayOrder.indexOf(a.weekday) - weekdayOrder.indexOf(b.weekday);
      return d !== 0 ? d : a.startTime.localeCompare(b.startTime);
    });
  } catch (err) {
    console.warn("[lesson-plan-sync] fetchStudentScheduleInputs exception:", err);
    return [];
  }
}

export async function fetchStudentLessons(
  studentId: string,
  teacherId?: string
): Promise<StudentLesson[]> {
  try {
    const plans = await fetchLessonPlans({ studentId });

    if (plans.length > 0) {
      const attendanceMap = await fetchAttendanceForEvents(plans.map((p) => p.event_id));

      const mapped: StudentLesson[] = plans
        .map((p, idx) => {
          const att = (attendanceMap[p.event_id] || []).find((a) => a.student_id === studentId);
          let attendance_status: StudentLesson["attendance_status"] = null;
          if (p.event_status === "Cancelled") attendance_status = "Cancelled";
          else if (p.event_status === "Rescheduled") attendance_status = "Rescheduled";
          else if (att?.status === "present" || att?.status === "late") attendance_status = "Present";
          else if (att?.status === "absent" || att?.status === "excused") attendance_status = "Absent";

          return {
            id: p.id,
            event_id: p.event_id,
            teacher_id: p.teacher_id,
            student_id: studentId,
            schedule_id: null,
            lesson_number: p.lesson_number || idx + 1,
            scheduled_date: p.scheduled_date,
            start_time: p.start_time,
            end_time: p.end_time,
            duration: p.duration,
            content: p.content,
            homework: p.homework,
            homework_posted: p.homework_posted ?? null,
            attendance_status,
            completed: p.completed,
            notes: p.notes,
            attachments: p.attachments as LessonAttachment[],
          } as StudentLesson;
        })
        .sort((a, b) => a.lesson_number - b.lesson_number);

      localStorage.setItem(`bloom.student_lessons.${studentId}`, JSON.stringify(mapped));
      return mapped;
    }
  } catch (err) {
    console.warn("[lesson-plan-sync] Unexpected fetch exception:", err);
  }

  const cached = localStorage.getItem(`bloom.student_lessons.${studentId}`);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {
      console.error("[lesson-plan-sync] Error parsing cached student lessons", e);
    }
  }

  return [];
}

/**
 * Makes sure every lesson has a backing occurrence in calendar_events and
 * returns the resolved event id per lesson (index aligned).
 */
async function ensureStudentEvents(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel,
  focus: CourseFocus,
  lessons: StudentLesson[]
): Promise<Array<string | null>> {
  const { data: existingEvents } = await supabase
    .from("calendar_events")
    .select("id, date, start_time")
    .eq("teacher_id", teacherId)
    .eq("student_id", studentId);

  const keyOf = (date: string, time: string) => `${date}|${formatTimeHHMMSS(time).slice(0, 5)}`;
  const byKey = new Map<string, string>();
  (existingEvents || []).forEach((e: any) => byKey.set(keyOf(e.date, e.start_time), e.id));

  const resolved: Array<string | null> = [];

  for (const l of lessons) {
    let eventId = l.event_id || byKey.get(keyOf(l.scheduled_date, l.start_time)) || null;

    if (eventId) {
      resolved.push(eventId);
      continue;
    }

    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        teacher_id: teacherId,
        student_id: studentId,
        schedule_id: l.schedule_id || null,
        student_name: studentName,
        level,
        focus,
        date: l.scheduled_date,
        start_time: formatTimeHHMMSS(l.start_time),
        end_time: formatTimeHHMMSS(l.end_time || calculateEndTime(l.start_time, l.duration || 60)),
        duration: l.duration || 60,
        type: "Private",
        delivery_mode: "Online",
        status: "Scheduled",
        is_recurring: true,
        recurrence_series_id: `series-lessonplan-${studentId}`,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.warn("[lesson-plan-sync] Could not create occurrence:", error?.message);
      resolved.push(null);
    } else {
      byKey.set(keyOf(l.scheduled_date, l.start_time), data.id);
      resolved.push(data.id);
    }
  }

  return resolved;
}

/**
 * Saves the student's lesson plan through the unified tables:
 * calendar_events (occurrence + cancellation) -> lesson_plans -> attendance_records.
 */
export async function saveStudentLessons(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel = "B2",
  focus: CourseFocus = "General English",
  lessons: StudentLesson[]
): Promise<{ success: boolean; data: StudentLesson[]; error?: string }> {
  localStorage.setItem(`bloom.student_lessons.${studentId}`, JSON.stringify(lessons));

  try {
    const eventIds = await ensureStudentEvents(studentId, teacherId, studentName, level, focus, lessons);

    const plans: LessonPlan[] = [];
    lessons.forEach((l, idx) => {
      const eventId = eventIds[idx];
      if (!eventId) return;
      plans.push({
        teacher_id: teacherId,
        event_id: eventId,
        class_id: null,
        student_id: studentId,
        lesson_number: l.lesson_number,
        scheduled_date: l.scheduled_date,
        start_time: formatTimeHHMMSS(l.start_time),
        end_time: formatTimeHHMMSS(l.end_time || calculateEndTime(l.start_time, l.duration || 60)),
        duration: l.duration || 60,
        content: l.content || "",
        homework: l.homework || "",
        homework_posted: typeof l.homework_posted === "boolean" ? l.homework_posted : null,
        notes: l.notes || "",
        attachments: (l.attachments || []) as any,
        completed: Boolean(l.completed),
        event_status:
          l.attendance_status === "Cancelled"
            ? "Cancelled"
            : l.attendance_status === "Rescheduled"
            ? "Rescheduled"
            : l.completed
            ? "Completed"
            : "Scheduled",
      });
    });

    const res = await saveLessonPlans(teacherId, plans);
    if (!res.success) {
      return { success: false, data: lessons, error: res.error };
    }

    // Attendance is per student/event; Cancelled & Rescheduled are event states.
    await Promise.all(
      lessons.map(async (l, idx) => {
        const eventId = eventIds[idx];
        if (!eventId) return;
        if (l.attendance_status === "Present" || l.attendance_status === "Absent") {
          await saveAttendanceRecords(teacherId, eventId, [
            {
              student_id: studentId,
              status: l.attendance_status === "Present" ? "present" : "absent",
            },
          ]);
        } else {
          await clearAttendanceRecord(teacherId, eventId, studentId);
        }
      })
    );

    const saved = lessons.map((l, idx) => ({ ...l, event_id: eventIds[idx] || l.event_id }));
    localStorage.setItem(`bloom.student_lessons.${studentId}`, JSON.stringify(saved));
    return { success: true, data: saved };
  } catch (err: any) {
    console.error("[lesson-plan-sync] Save exception:", err);
    return { success: false, data: lessons, error: err.message || "Failed to save lessons to server." };
  }
}

/**
 * Auto-initializes a student's Lesson Plan if not already initialized.
 */
export async function ensureStudentLessonPlanInitialized(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel = "B2",
  focus: CourseFocus = "General English",
  schedules: LessonScheduleInput[],
  startDateStr: string,
  totalPackageLessons: number = 23
): Promise<StudentLesson[]> {
  const existing = await fetchStudentLessons(studentId, teacherId);
  return existing && existing.length > 0 ? existing : [];
}

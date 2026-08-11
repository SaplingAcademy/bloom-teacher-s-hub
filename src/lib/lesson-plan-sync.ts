import { supabase } from "@/lib/supabase";
import { formatTimeHHMMSS, calculateEndTime, CEFRLevel, CourseFocus } from "./calendar-sync";

export interface StudentLesson {
  id?: string;
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
 * Fetches student lessons from Supabase (with LocalStorage fallback).
 */
export async function fetchStudentLessons(
  studentId: string,
  teacherId?: string
): Promise<StudentLesson[]> {
  try {
    const { data, error } = await supabase
      .from("student_lessons")
      .select("*")
      .eq("student_id", studentId)
      .order("lesson_number", { ascending: true });

    if (error) {
      console.warn("[lesson-plan-sync] Error fetching from Supabase:", error.message, error);
    } else if (data && data.length > 0) {
      return data as StudentLesson[];
    }
  } catch (err) {
    console.warn("[lesson-plan-sync] Unexpected fetch exception:", err);
  }

  // LocalStorage Fallback
  const cacheKey = `bloom.student_lessons.${studentId}`;
  const cached = localStorage.getItem(cacheKey);
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
 * Projects / syncs student_lessons records to calendar_events table.
 * Each student lesson becomes a calendar event projection.
 */
export async function projectLessonsToCalendarEvents(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel = "B2",
  focus: CourseFocus = "General English",
  lessons: StudentLesson[]
): Promise<void> {
  if (!studentId || !teacherId || !lessons || lessons.length === 0) return;

  try {
    const calendarEventsToInsert = lessons.map((l) => {
      let calendarStatus: string = "Scheduled";
      if (l.completed) {
        calendarStatus = "Completed";
      } else if (l.attendance_status === "Cancelled") {
        calendarStatus = "Closed";
      } else if (l.attendance_status === "Rescheduled") {
        calendarStatus = "Scheduled";
      }

      return {
        teacher_id: teacherId,
        student_id: studentId,
        schedule_id: l.schedule_id || null,
        student_name: studentName,
        level: level,
        focus: focus,
        date: l.scheduled_date,
        start_time: formatTimeHHMMSS(l.start_time),
        end_time: formatTimeHHMMSS(l.end_time),
        duration: l.duration || 60,
        type: "Private",
        delivery_mode: "Online",
        status: calendarStatus,
        attendance_recorded: l.attendance_status !== null,
        attendance_status: l.attendance_status === "Rescheduled" || l.attendance_status === "Cancelled" ? undefined : l.attendance_status,
        notes: l.notes || `Lesson ${l.lesson_number}`,
        homework_title: l.homework || "",
        lesson_plan_url: l.content || "",
        is_recurring: true,
        recurrence_series_id: `series-lessonplan-${studentId}`,
      };
    });

    const { error } = await supabase
      .from("calendar_events")
      .upsert(calendarEventsToInsert, {
        onConflict: "student_id,schedule_id,date",
        ignoreDuplicates: false,
      });

    if (error) {
      console.warn("[lesson-plan-sync] Calendar events projection fallback insert:", error.message);
      await supabase.from("calendar_events").insert(calendarEventsToInsert);
    }
  } catch (err) {
    console.error("[lesson-plan-sync] Error projecting lessons to calendar_events:", err);
  }
}

/**
 * Saves updated or newly generated student lessons to Supabase & LocalStorage,
 * and updates the calendar_events projection.
 */
export async function saveStudentLessons(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel = "B2",
  focus: CourseFocus = "General English",
  lessons: StudentLesson[]
): Promise<{ success: boolean; data: StudentLesson[]; error?: string }> {
  // Always update LocalStorage cache
  const cacheKey = `bloom.student_lessons.${studentId}`;
  localStorage.setItem(cacheKey, JSON.stringify(lessons));

  try {
    const payload = lessons.map((l) => ({
      teacher_id: teacherId,
      student_id: studentId,
      schedule_id: l.schedule_id || null,
      lesson_number: l.lesson_number,
      scheduled_date: l.scheduled_date,
      start_time: formatTimeHHMMSS(l.start_time),
      end_time: formatTimeHHMMSS(l.end_time),
      duration: l.duration || 60,
      content: l.content || "",
      homework: l.homework || "",
      homework_posted: typeof l.homework_posted === "boolean" ? l.homework_posted : null,
      attendance_status: l.attendance_status || null,
      completed: Boolean(l.completed),
      notes: l.notes || "",
    }));

    const { data, error } = await supabase
      .from("student_lessons")
      .upsert(payload, {
        onConflict: "student_id,lesson_number",
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      console.error("[lesson-plan-sync] Supabase insert/upsert rejected:", error);
      // Try fallback insert if upsert index fails
      const { data: insertData, error: insertErr } = await supabase
        .from("student_lessons")
        .insert(payload)
        .select();

      if (!insertErr && insertData) {
        await projectLessonsToCalendarEvents(studentId, teacherId, studentName, level, focus, insertData as StudentLesson[]);
        return { success: true, data: insertData as StudentLesson[] };
      } else if (insertErr) {
        console.error("[lesson-plan-sync] Fallback insert also failed:", insertErr);
        return { success: false, data: lessons, error: error.message || insertErr.message };
      }
    }

    if (data) {
      // Sync projection to calendar_events
      await projectLessonsToCalendarEvents(studentId, teacherId, studentName, level, focus, data as StudentLesson[]);
      return { success: true, data: data as StudentLesson[] };
    }
  } catch (err: any) {
    console.error("[lesson-plan-sync] Save exception:", err);
    return { success: false, data: lessons, error: err.message || "Failed to save lessons to server." };
  }

  // Update calendar projection with local lessons
  await projectLessonsToCalendarEvents(studentId, teacherId, studentName, level, focus, lessons);
  return { success: true, data: lessons };
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
  if (existing && existing.length > 0) {
    return existing;
  }
  return [];
}

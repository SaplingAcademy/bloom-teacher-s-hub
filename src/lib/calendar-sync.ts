import { supabase } from "@/lib/supabase";
import { fetchTeacherTimeOff, checkDateIsNonWorking } from "./time-off-engine";

export type CEFRLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export type CourseFocus =
  | "General English"
  | "Business English"
  | "Travel"
  | "Conversation"
  | "IELTS"
  | "TOEFL"
  | "Cambridge"
  | "Other";

export type StudentStatus = "Active" | "Inactive" | "Paused" | "Trial" | "Lead" | "active" | "inactive";
export type StudentType = "Private" | "Group";

export interface ScheduleDetails {
  day: string; // "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  startTime: string; // "HH:MM"
  duration: number; // minutes, e.g. 60
  frequency: "Weekly" | "Bi-weekly" | "Monthly";
  startDate: string; // "YYYY-MM-DD"
  endDate?: string; // "YYYY-MM-DD" or empty
  timezone: string;
  deliveryMode: "Online" | "In person";
  locationLink?: string;
}

export type TimelineStatus =
  | "Scheduled"
  | "Needs Preparation"
  | "Lesson Ready"
  | "Completed"
  | "Homework Pending"
  | "Homework Sent"
  | "Feedback Pending"
  | "Closed";

export interface CalendarEvent {
  id: string;
  teacherId?: string; // Links to Auth Teacher ID
  studentId?: string; // Links to Student ID
  scheduleId?: string; // Links to Student Schedule ID
  groupId?: string; // Links to Group Student ID
  studentName: string;
  level: CEFRLevel;
  focus: CourseFocus;
  date: string; // "YYYY-MM-DD"
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  duration: number; // minutes
  type: StudentType;
  deliveryMode: "Online" | "In person";
  locationLink?: string;
  status: TimelineStatus;
  attendanceRecorded?: boolean;
  attendanceStatus?: "Present" | "Absent" | "Excused";
  notes?: string;
  homeworkTitle?: string;
  lessonPlanUrl?: string;
  isRecurring?: boolean;
  recurrenceSeriesId?: string;
}

// Working availability type comes from the single source of truth (availability-engine).
// No fake default availability here: "not configured" must never look like "available".
export type { WorkingAvailability } from "@/lib/availability-engine";

// Helper to convert weekday name to numeric day index (0 = Sunday, 1 = Monday, etc.)
export function getDayIndex(day: string): number {
  const map: Record<string, number> = {
    sunday: 0,
    sun: 0,
    dom: 0,
    monday: 1,
    mon: 1,
    seg: 1,
    tuesday: 2,
    tue: 2,
    ter: 2,
    wednesday: 3,
    wed: 3,
    qua: 3,
    thursday: 4,
    thu: 4,
    qui: 4,
    friday: 5,
    fri: 5,
    sex: 5,
    saturday: 6,
    sat: 6,
    sab: 6,
  };
  return map[day.toLowerCase()] ?? 1;
}

// Helper to format Date into YYYY-MM-DD
export function formatDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Helper to format time string into PostgreSQL time format HH:MM:SS
export function formatTimeHHMMSS(timeStr?: string): string {
  if (!timeStr) return "09:00:00";
  const parts = timeStr.trim().split(":");
  const hh = String(parts[0] || "09").padStart(2, "0");
  const mm = String(parts[1] || "00").padStart(2, "0");
  const ss = String(parts[2] || "00").padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Parse "HH:MM" or "HH:MM:SS" and add minutes, returning "HH:MM:SS"
export function calculateEndTime(startTime: string, durationMinutes: number): string {
  if (!startTime) return "10:00:00";
  const parts = startTime.split(":").map(Number);
  const hours = parts[0] || 0;
  const minutes = parts[1] || 0;
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMinutes = totalMinutes % 60;
  return `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}:00`;
}


// Generate recurring dates for a schedule
export function generateOccurrenceDates(
  startDateStr: string,
  dayName: string,
  frequency: "Weekly" | "Bi-weekly" | "Monthly",
  limitWeeks = 8,
  endDateStr?: string,
): string[] {
  const targetDayIdx = getDayIndex(dayName);
  const start = new Date(startDateStr + "T00:00:00");
  const end = endDateStr ? new Date(endDateStr + "T23:59:59") : null;
  const dates: string[] = [];

  // Align start date to the correct first weekday occurrence
  let current = new Date(start);
  while (current.getDay() !== targetDayIdx) {
    current.setDate(current.getDate() + 1);
  }

  // Generate occurrences
  const stepDays = frequency === "Weekly" ? 7 : frequency === "Bi-weekly" ? 14 : 28;
  for (let i = 0; i < limitWeeks; i++) {
    if (end && current.getTime() > end.getTime()) {
      break;
    }
    dates.push(formatDateString(current));
    current.setDate(current.getDate() + stepDays);
  }

  return dates;
}

// Local cache ONLY (first paint). Supabase is the operational source of truth:
// this never seeds demo data and never overwrites fresher server data.
export function getCalendarEvents(): CalendarEvent[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem("bloom.calendar.events");
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Failed to parse cached calendar events", e);
    return [];
  }
}

// Refresh the first-paint cache with data already persisted in Supabase
export function saveCalendarEvents(events: CalendarEvent[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("bloom.calendar.events", JSON.stringify(events));
}

// Sync Student schedule details to calendar events
export function syncStudentScheduleWithEvents(
  studentId: string,
  studentName: string,
  level: CEFRLevel,
  focus: CourseFocus,
  type: StudentType,
  schedule: ScheduleDetails,
  existingEvents: CalendarEvent[],
): CalendarEvent[] {
  const seriesId = `series-${studentId}`;

  // 1. Delete all FUTURE events for this student/group in the series (that aren't completed/closed)
  const todayStr = formatDateString(new Date());
  let updatedEvents = existingEvents.filter((evt) => {
    const isThisStudent =
      type === "Private" ? evt.studentId === studentId : evt.groupId === studentId;
    if (!isThisStudent) return true;

    // Keep completed or closed historical events, or events in the past
    const isPast = evt.date < todayStr;
    const isCompletedOrClosed = evt.status === "Completed" || evt.status === "Closed";
    return isPast || isCompletedOrClosed;
  });

  // 2. Generate occurrences for next 8 weeks starting from schedule.startDate
  const occurrenceDates = generateOccurrenceDates(
    schedule.startDate,
    schedule.day,
    schedule.frequency,
    8,
    schedule.endDate,
  );

  // 3. Insert new events
  occurrenceDates.forEach((dateStr) => {
    // Avoid double-booking if the list already contains a historical event for that exact date
    const isAlreadyBooked = updatedEvents.some((evt) => {
      const isThisStudent =
        type === "Private" ? evt.studentId === studentId : evt.groupId === studentId;
      return isThisStudent && evt.date === dateStr;
    });

    if (!isAlreadyBooked) {
      const eventId = `evt-${studentId}-${dateStr}`;
      updatedEvents.push({
        id: eventId,
        studentId: type === "Private" ? studentId : undefined,
        groupId: type === "Group" ? studentId : undefined,
        studentName,
        level,
        focus,
        date: dateStr,
        startTime: schedule.startTime,
        endTime: calculateEndTime(schedule.startTime, schedule.duration),
        duration: schedule.duration,
        type,
        deliveryMode: schedule.deliveryMode,
        locationLink: schedule.locationLink,
        status: "Scheduled",
        isRecurring: true,
        recurrenceSeriesId: seriesId,
      });
    }
  });

  return updatedEvents;
}

// Delete student schedule events entirely
export function deleteStudentEvents(
  studentId: string,
  existingEvents: CalendarEvent[],
): CalendarEvent[] {
  const todayStr = formatDateString(new Date());
  return existingEvents.filter((evt) => {
    const isThisStudent = evt.studentId === studentId || evt.groupId === studentId;
    if (!isThisStudent) return true;

    // Keep past or completed events as history
    const isPast = evt.date < todayStr;
    const isCompletedOrClosed = evt.status === "Completed" || evt.status === "Closed";
    return isPast || isCompletedOrClosed;
  });
}

// Sync Student recurring schedules directly to Supabase calendar_events (8-week rolling window)
export async function syncStudentSchedulesToSupabaseEvents(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel,
  focus: CourseFocus,
  type: StudentType,
  schedules: Array<{ id?: string; weekday: string; startTime?: string; start_time?: string; endTime?: string; end_time?: string; duration?: number; duration_minutes?: number }>,
  limitWeeks = 8
) {
  console.log("[calendar-sync] Starting sync for student:", {
    teacherId,
    studentId,
    studentName,
    schedulesCount: schedules?.length ?? 0,
    schedules,
  });

  if (!studentId || !teacherId) {
    console.error("[calendar-sync] Aborting sync: missing studentId or teacherId", { studentId, teacherId });
    return { success: false, generatedCount: 0, insertedCount: 0, error: "Missing studentId or teacherId" };
  }

  const todayStr = formatDateString(new Date());

  try {
    // 1. Delete future uncompleted recurring events for this student (preserving completed/past events)
    const { data: existingEvents, error: fetchErr } = await supabase
      .from("calendar_events")
      .select("id, date, status, schedule_id")
      .eq("student_id", studentId)
      .gte("date", todayStr);

    if (fetchErr) {
      console.error("[calendar-sync] Error fetching existing calendar events:", fetchErr);
    }

    if (existingEvents && existingEvents.length > 0) {
      const idsToDelete = existingEvents
        .filter((e) => e.status !== "Completed" && e.status !== "Closed")
        .map((e) => e.id);

      if (idsToDelete.length > 0) {
        const { error: delErr } = await supabase.from("calendar_events").delete().in("id", idsToDelete);
        if (delErr) {
          console.error("[calendar-sync] Error deleting previous future events:", delErr);
        }
      }
    }

    // 2. Fetch teacher non-working days for exclusion
    const timeOffList = await fetchTeacherTimeOff(teacherId);

    // 3. For each schedule, generate next weeks of occurrences
    const newEventsToInsert: any[] = [];

    for (const sch of schedules) {
      if (!sch.weekday) continue;
      const rawStartTime = sch.startTime || sch.start_time || "09:00";
      const startTime = formatTimeHHMMSS(rawStartTime);
      const duration = sch.duration_minutes || sch.duration || 60;
      const rawEndTime = sch.endTime || sch.end_time || calculateEndTime(rawStartTime, duration);
      const endTime = formatTimeHHMMSS(rawEndTime);

      const occurrenceDates = generateOccurrenceDates(todayStr, sch.weekday, "Weekly", limitWeeks);
      console.log(`[calendar-sync] Generated ${occurrenceDates.length} occurrences for schedule`, {
        scheduleId: sch.id,
        weekday: sch.weekday,
        occurrenceDates,
      });

      for (const dateStr of occurrenceDates) {
        // Skip dates when teacher is on non-working time off
        const matchedTimeOff = checkDateIsNonWorking(dateStr, timeOffList);
        if (matchedTimeOff) {
          console.log(`[calendar-sync] Skipping candidate date ${dateStr} due to non-working ${matchedTimeOff.type}`);
          continue;
        }

        newEventsToInsert.push({
          teacher_id: teacherId,
          student_id: studentId,
          schedule_id: sch.id || null,
          student_name: studentName,
          level: level || "A1",
          focus: focus || "General English",
          date: dateStr,
          start_time: startTime,
          end_time: endTime,
          duration: duration,
          type: type || "Private",
          delivery_mode: "Online",
          status: "Scheduled",
          is_recurring: true,
          recurrence_series_id: `series-${studentId}`,
        });
      }
    }

    console.log(`[calendar-sync] Total event payloads generated: ${newEventsToInsert.length}`, {
      samplePayload: newEventsToInsert[0] || null,
    });

    if (newEventsToInsert.length > 0) {
      let { data: upsertData, error } = await supabase
        .from("calendar_events")
        .upsert(newEventsToInsert, {
          onConflict: "student_id,schedule_id,date",
          ignoreDuplicates: true,
        })
        .select();

      // Fallback: If PostgREST returns 42P10 (no matching index for onConflict spec), retry insert
      if (error && (error.code === "42P10" || error.message?.includes("ON CONFLICT"))) {
        console.warn("[calendar-sync] onConflict spec returned 42P10, retrying standard insert:", error.message);
        const { data: insertData, error: insertErr } = await supabase
          .from("calendar_events")
          .insert(newEventsToInsert)
          .select();

        if (!insertErr) {
          upsertData = insertData;
          error = null;
        } else {
          error = insertErr;
        }
      }

      if (error) {
        console.error("[calendar-sync] Complete Supabase error object on upserting calendar events:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          fullError: JSON.stringify(error, null, 2),
        });
        return {
          success: false,
          generatedCount: newEventsToInsert.length,
          insertedCount: 0,
          error: error.message,
          rawErrorObject: error,
        };
      }

      const insertedCount = upsertData ? upsertData.length : newEventsToInsert.length;
      console.log("[calendar-sync] Supabase upsert/insert successful!", {
        generatedCount: newEventsToInsert.length,
        insertedCount,
        insertedSample: upsertData?.[0] || null,
      });

      return {
        success: true,
        generatedCount: newEventsToInsert.length,
        insertedCount,
        error: null,
      };
    }

    return {
      success: true,
      generatedCount: 0,
      insertedCount: 0,
      error: null,
    };
  } catch (err: any) {
    console.error("[calendar-sync] Failed to sync student schedules to Supabase calendar_events:", err);
    return {
      success: false,
      generatedCount: 0,
      insertedCount: 0,
      error: err?.message || String(err),
    };
  }
}


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
  classId?: string; // Links to Class ID
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
  attendanceStatus?: "Present" | "Absent" | "Late" | "Excused";
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

export interface SyncScheduleInput {
  id?: string;
  weekday: string;
  startTime?: string;
  start_time?: string | null;
  endTime?: string;
  end_time?: string | null;
  duration?: number;
  duration_minutes?: number | null;
  meeting_url?: string | null;
  locationLink?: string | null;
  delivery_mode?: string | null;
  deliveryMode?: string | null;
}

// Sync student_schedules (canonical) → calendar_events (derived copies), 8-week rolling window.
// Future open occurrences are updated in place per schedule_id; past and Completed/Closed events are never touched.
export async function syncStudentSchedulesToSupabaseEvents(
  studentId: string,
  teacherId: string,
  studentName: string,
  level: CEFRLevel,
  focus: CourseFocus,
  type: StudentType,
  schedules: SyncScheduleInput[],
  limitWeeks = 8
) {
  if (!studentId || !teacherId) {
    return { success: false, generatedCount: 0, insertedCount: 0, error: "Missing studentId or teacherId" };
  }

  const { planEventReconcile } = await import("@/lib/student-schedules");
  const todayStr = formatDateString(new Date());

  try {
    const { data: existingEvents, error: fetchErr } = await supabase
      .from("calendar_events")
      .select("id, date, status, schedule_id, is_recurring")
      .eq("student_id", studentId)
      .gte("date", todayStr);
    if (fetchErr) throw fetchErr;

    const timeOffList = await fetchTeacherTimeOff(teacherId);

    type Fields = {
      start_time: string; end_time: string; duration: number;
      delivery_mode: string; location_link: string | null;
    };
    const fieldsBySchedule = new Map<string | null, Fields>();
    const desired: Array<{ scheduleId: string | null; date: string }> = [];

    for (const sch of schedules) {
      if (!sch.weekday) continue;
      const rawStart = sch.startTime || sch.start_time || "09:00";
      const startTime = formatTimeHHMMSS(rawStart);
      let duration = Number(sch.duration_minutes || sch.duration) || 0;
      const rawEnd = sch.endTime || sch.end_time || "";
      if (!duration && rawEnd) {
        const [sh, sm] = startTime.split(":").map(Number);
        const [eh, em] = rawEnd.split(":").map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        if (diff > 0) duration = diff;
      }
      if (!duration) duration = 60;
      const endTime = formatTimeHHMMSS(rawEnd || calculateEndTime(rawStart, duration));
      const mode = (sch.delivery_mode || sch.deliveryMode) === "In person" ? "In person" : "Online";
      const link = (sch.meeting_url ?? sch.locationLink ?? null) || null;
      const scheduleId = sch.id || null;
      fieldsBySchedule.set(scheduleId, { start_time: startTime, end_time: endTime, duration, delivery_mode: mode, location_link: link });

      for (const dateStr of generateOccurrenceDates(todayStr, sch.weekday, "Weekly", limitWeeks)) {
        if (checkDateIsNonWorking(dateStr, timeOffList)) continue;
        desired.push({ scheduleId, date: dateStr });
      }
    }

    const plan = planEventReconcile((existingEvents || []) as any, desired);

    if (plan.deleteIds.length > 0) {
      const { error } = await supabase.from("calendar_events").delete().in("id", plan.deleteIds);
      if (error) throw error;
    }

    // One UPDATE per schedule_id, only touching its open future occurrences.
    const updatesBySchedule = new Map<string | null, string[]>();
    plan.updateIds.forEach(({ id, scheduleId }) => {
      updatesBySchedule.set(scheduleId, [...(updatesBySchedule.get(scheduleId) || []), id]);
    });
    for (const [scheduleId, ids] of updatesBySchedule) {
      const f = fieldsBySchedule.get(scheduleId);
      if (!f) continue;
      const { error } = await supabase
        .from("calendar_events")
        .update({ ...f, student_name: studentName })
        .in("id", ids);
      if (error) throw error;
    }

    const rowsToInsert = plan.insert.map((d) => {
      const f = fieldsBySchedule.get(d.scheduleId)!;
      return {
        teacher_id: teacherId,
        student_id: studentId,
        schedule_id: d.scheduleId,
        student_name: studentName,
        level: level || "A1",
        focus: focus || "General English",
        date: d.date,
        start_time: f.start_time,
        end_time: f.end_time,
        duration: f.duration,
        type: type || "Private",
        delivery_mode: f.delivery_mode,
        location_link: f.location_link,
        status: "Scheduled",
        is_recurring: true,
        recurrence_series_id: `series-${studentId}`,
      };
    });

    let insertedCount = 0;
    if (rowsToInsert.length > 0) {
      const { data, error } = await supabase.from("calendar_events").insert(rowsToInsert).select("id");
      if (error) throw error;
      insertedCount = data?.length ?? rowsToInsert.length;
    }

    return {
      success: true,
      generatedCount: desired.length,
      insertedCount,
      updatedCount: plan.updateIds.length,
      deletedCount: plan.deleteIds.length,
      error: null,
    };
  } catch (err: any) {
    console.error("[calendar-sync] Failed to sync student schedules to calendar_events:", {
      message: err?.message, code: err?.code, details: err?.details, hint: err?.hint,
    });
    return { success: false, generatedCount: 0, insertedCount: 0, error: err?.message || String(err), rawErrorObject: err };
  }
}

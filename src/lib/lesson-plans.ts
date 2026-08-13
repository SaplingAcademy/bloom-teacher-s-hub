import { supabase } from "@/lib/supabase";
import { formatTimeHHMMSS, calculateEndTime, getDayIndex } from "./calendar-sync";
import {
  checkDateIsNonWorking,
  fetchTeacherTimeOff,
  formatLocalDateStr,
  TeacherTimeOff,
} from "./time-off-engine";
import { TeacherAvailabilitySnapshot, isSlotAvailable } from "./teacher-availability";

/* =============================================================================
   Unified lesson plans & attendance (individual, pair and group)

   calendar_events  -> single source of truth for an occurrence
   lesson_plans     -> 1:1 with an event (event_id unique)
   attendance_records -> 1 per student per event ('present'|'absent'|'late'|'excused')
   Cancellation lives on calendar_events.status, never on attendance.
   ========================================================================== */

export type AttendanceStatus = "present" | "absent" | "late" | "excused";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["present", "absent", "late", "excused"];

export interface LessonPlanAttachment {
  id: string;
  type: "file" | "link";
  title?: string;
  file_path?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  created_at?: string;
}

export interface LessonPlan {
  id?: string;
  teacher_id: string;
  event_id: string;
  class_id?: string | null;
  student_id?: string | null;
  lesson_number: number;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  duration: number;
  content: string;
  homework: string;
  homework_posted?: boolean | null;
  notes: string;
  attachments: LessonPlanAttachment[];
  completed: boolean;
  /** derived from calendar_events.status */
  event_status?: string;
}

export interface AttendanceRecordRow {
  id?: string;
  teacher_id?: string;
  event_id: string;
  student_id: string;
  status: AttendanceStatus;
  notes?: string;
  student_name?: string;
}

export interface OccurrenceSlot {
  weekday: string;
  startTime: string;
  duration: number;
  scheduleId?: string | null;
  deliveryMode?: "Online" | "In person";
  locationLink?: string | null;
}

export interface GeneratedOccurrence {
  date: string;
  start_time: string;
  end_time: string;
  duration: number;
  schedule_id?: string | null;
  delivery_mode: "Online" | "In person";
  location_link?: string | null;
}

/**
 * Single occurrence generator shared by individual, pair and group tracks.
 * Skips teacher non-working dates without consuming a lesson slot.
 */
export function generateOccurrences(
  startDateStr: string,
  slots: OccurrenceSlot[],
  totalOccurrences: number,
  timeOffList: TeacherTimeOff[] = [],
  availability?: TeacherAvailabilitySnapshot | null
): GeneratedOccurrence[] {
  if (!slots || slots.length === 0 || totalOccurrences <= 0) return [];

  const start = new Date((startDateStr || formatLocalDateStr(new Date())) + "T00:00:00");
  const ordered = slots
    .map((s) => ({ ...s, dayIdx: getDayIndex(s.weekday), startTime: s.startTime || "09:00" }))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const out: GeneratedOccurrence[] = [];
  const curr = new Date(start);
  let scanned = 0;

  while (out.length < totalOccurrences && scanned < 365 * 2) {
    const dateStr = formatLocalDateStr(curr);
    if (!checkDateIsNonWorking(dateStr, timeOffList)) {
      for (const slot of ordered.filter((s) => s.dayIdx === curr.getDay())) {
        if (out.length >= totalOccurrences) break;
        const duration = slot.duration || 60;
        const startHHMM = slot.startTime;
        const endHHMM = calculateEndTime(startHHMM, duration);

        // Only real absences (time off, vacations, holidays) block a date, and they
        // are skipped without consuming a lesson number. Working availability and
        // recurring rest blocks are advisory only — they never block generation.
        if (availability && availability.isConfigured) {
          const check = isSlotAvailable(availability, dateStr, startHHMM, endHHMM);
          if (!check.available && check.reason?.kind === "time_off") continue;
        }

        out.push({
          date: dateStr,
          start_time: formatTimeHHMMSS(startHHMM),
          end_time: formatTimeHHMMSS(endHHMM),
          duration,
          schedule_id: slot.scheduleId || null,
          delivery_mode: slot.deliveryMode || "Online",
          location_link: slot.locationLink || null,
        });
      }
    }
    curr.setDate(curr.getDate() + 1);
    scanned++;
  }

  return out;
}

/** Last date of the generated series — used by the review box before generating. */
export function calculateClassExpectedEndDate(
  startDateStr: string,
  slots: OccurrenceSlot[],
  totalOccurrences: number,
  timeOffList: TeacherTimeOff[] = [],
  availability?: TeacherAvailabilitySnapshot | null
): string {
  const list = generateOccurrences(startDateStr, slots, totalOccurrences, timeOffList, availability);
  return list.length > 0 ? list[list.length - 1].date : "";
}

/**
 * Advisory checks: slots that fall outside the teacher's usual working hours or
 * inside a recurring rest block. These are warnings, never blockers.
 */
export function getScheduleAdvisoryWarnings(
  startDateStr: string,
  slots: OccurrenceSlot[],
  availability?: TeacherAvailabilitySnapshot | null
): string[] {
  if (!availability || !availability.isConfigured || !slots?.length || !startDateStr) return [];

  const warnings: string[] = [];
  const base = new Date((startDateStr || formatLocalDateStr(new Date())) + "T00:00:00");

  for (const slot of slots) {
    const dayIdx = getDayIndex(slot.weekday);
    const probe = new Date(base);
    let guard = 0;
    while (probe.getDay() !== dayIdx && guard < 7) {
      probe.setDate(probe.getDate() + 1);
      guard++;
    }
    const dateStr = formatLocalDateStr(probe);
    const startHHMM = slot.startTime || "09:00";
    const endHHMM = calculateEndTime(startHHMM, slot.duration || 60);
    const check = isSlotAvailable(availability, dateStr, startHHMM, endHHMM);
    if (!check.available && check.reason && check.reason.kind !== "time_off") {
      warnings.push(`${slot.weekday} ${startHHMM}–${endHHMM}: ${check.reason.message}`);
    }
  }

  return warnings;
}

/**
 * Explicit generation of a class lesson plan (pair or group) on the unified
 * architecture: calendar_events -> lesson_plans. Attendance stays per student.
 */
export async function generateClassLessonPlan(
  teacherId: string,
  cls: { id: string; name: string; level?: string },
  params: {
    startDate: string;
    slots: OccurrenceSlot[];
    totalOccurrences: number;
    timeOff?: TeacherTimeOff[];
    availability?: TeacherAvailabilitySnapshot | null;
  }
): Promise<LessonPlan[]> {
  const occurrences = generateOccurrences(
    params.startDate,
    params.slots,
    params.totalOccurrences,
    params.timeOff || [],
    params.availability
  );

  if (occurrences.length === 0) {
    throw new Error(
      "Nenhuma aula pôde ser gerada. Revise os dias/horários e a sua disponibilidade."
    );
  }

  const rows = occurrences.map((o) => ({
    teacher_id: teacherId,
    class_id: cls.id,
    class_schedule_id: o.schedule_id,
    event_type: "class",
    student_name: cls.name,
    level: cls.level || "B1",
    focus: "General",
    date: o.date,
    start_time: o.start_time,
    end_time: o.end_time,
    duration: o.duration,
    type: "Group",
    delivery_mode: o.delivery_mode,
    location_link: o.location_link || "",
    status: "Scheduled",
  }));

  const insertResult = await insertClassEvents(teacherId, cls.id, rows);
  if (insertResult.error) {
    throw new Error(`Não foi possível criar as aulas no calendário: ${insertResult.error}`);
  }

  const { data: events } = await supabase
    .from("calendar_events")
    .select("id, date, start_time, end_time, duration, status")
    .eq("teacher_id", teacherId)
    .eq("class_id", cls.id)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  const existing = await fetchLessonPlans({ classId: cls.id });
  const byEvent = new Map(existing.map((p) => [p.event_id, p]));
  const missing = (events || []).filter((e: any) => !byEvent.has(e.id));

  if (missing.length > 0) {
    let nextNumber = existing.reduce((max, p) => Math.max(max, p.lesson_number || 0), 0);
    const saveResult = await saveLessonPlans(
      teacherId,
      missing.map((e: any) => ({
        teacher_id: teacherId,
        event_id: e.id,
        class_id: cls.id,
        student_id: null,
        lesson_number: ++nextNumber,
        scheduled_date: e.date,
        start_time: e.start_time,
        end_time: e.end_time || calculateEndTime((e.start_time || "09:00").slice(0, 5), e.duration || 60),
        duration: e.duration || 60,
        content: "",
        homework: "",
        homework_posted: null,
        notes: "",
        attachments: [],
        completed: false,
      }))
    );
    if (!saveResult.success) {
      throw new Error(`Não foi possível salvar o plano de aulas: ${saveResult.error || ""}`);
    }
  }

  const plans = await fetchLessonPlans({ classId: cls.id });
  if (plans.length === 0) {
    throw new Error("O plano de aulas não pôde ser salvo. Tente novamente.");
  }
  return plans.map((p, idx) => ({ ...p, lesson_number: p.lesson_number || idx + 1 }));
}

function normalizeAttachments(raw: any): LessonPlanAttachment[] {
  return Array.isArray(raw) ? raw : [];
}

/**
 * Inserts class calendar events, skipping rows that already exist for the same
 * (class_id, date, start_time). Does not rely on a DB unique constraint.
 */
export async function insertClassEvents(
  teacherId: string,
  classId: string,
  rows: Array<Record<string, any>>
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 };

  const { data: existing } = await supabase
    .from("calendar_events")
    .select("date, start_time")
    .eq("teacher_id", teacherId)
    .eq("class_id", classId);

  const key = (d: string, t: string) => `${d}|${String(t).slice(0, 5)}`;
  const seen = new Set((existing || []).map((e: any) => key(e.date, e.start_time)));

  const toInsert = rows.filter((r) => {
    const k = key(r.date, r.start_time);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  if (toInsert.length === 0) return { inserted: 0 };

  const { error } = await supabase.from("calendar_events").insert(toInsert);
  if (error) {
    console.warn("[lesson-plans] class event insert error:", error.message);
    return { inserted: 0, error: error.message };
  }
  return { inserted: toInsert.length };
}

function mapPlanRow(row: any): LessonPlan {
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    event_id: row.event_id,
    class_id: row.class_id,
    student_id: row.student_id,
    lesson_number: row.lesson_number ?? 0,
    scheduled_date: row.scheduled_date,
    start_time: row.start_time || "09:00:00",
    end_time: row.end_time || "10:00:00",
    duration: row.duration || 60,
    content: row.content || "",
    homework: row.homework || "",
    homework_posted: row.homework_posted,
    notes: row.notes || "",
    attachments: normalizeAttachments(row.attachments),
    completed: Boolean(row.completed),
    event_status: row.calendar_events?.status || row.event_status,
  };
}

/**
 * Fetches lesson plans for a student or for a class, ordered by lesson number/date.
 */
export async function fetchLessonPlans(params: {
  studentId?: string;
  classId?: string;
}): Promise<LessonPlan[]> {
  const { studentId, classId } = params;
  if (!studentId && !classId) return [];

  let query = supabase
    .from("lesson_plans")
    .select("*, calendar_events:event_id (status)")
    .order("scheduled_date", { ascending: true })
    .order("start_time", { ascending: true });

  query = studentId ? query.eq("student_id", studentId) : query.eq("class_id", classId!);

  const { data, error } = await query;
  if (error) {
    console.warn("[lesson-plans] fetch error:", error.message);
    return [];
  }
  return (data || []).map(mapPlanRow);
}

/**
 * Upserts lesson plans (1 per event) and keeps the underlying event in sync.
 */
export async function saveLessonPlans(
  teacherId: string,
  plans: LessonPlan[]
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId || plans.length === 0) return { success: true };

  const payload = plans.map((p) => ({
    teacher_id: teacherId,
    event_id: p.event_id,
    class_id: p.class_id || null,
    student_id: p.class_id ? null : p.student_id || null,
    lesson_number: p.lesson_number,
    scheduled_date: p.scheduled_date,
    start_time: formatTimeHHMMSS(p.start_time),
    end_time: formatTimeHHMMSS(p.end_time || calculateEndTime(p.start_time, p.duration || 60)),
    duration: p.duration || 60,
    content: p.content || "",
    homework: p.homework || "",
    homework_posted: typeof p.homework_posted === "boolean" ? p.homework_posted : null,
    notes: p.notes || "",
    attachments: (p.attachments || []).map((att) => ({
      id: att.id || crypto.randomUUID(),
      type: att.type,
      title: att.title || "",
      file_name: att.file_name || "",
      file_path: att.file_path || "",
      file_size: att.file_size || 0,
      created_at: att.created_at || new Date().toISOString(),
    })),
    completed: Boolean(p.completed),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("lesson_plans")
    .upsert(payload, { onConflict: "event_id" });

  if (error) {
    console.error("[lesson-plans] save error:", error.message);
    return { success: false, error: error.message };
  }

  // Keep the occurrence itself aligned with the plan (date/time/completion).
  await Promise.all(
    plans.map((p) =>
      supabase
        .from("calendar_events")
        .update({
          date: p.scheduled_date,
          start_time: formatTimeHHMMSS(p.start_time),
          end_time: formatTimeHHMMSS(p.end_time || calculateEndTime(p.start_time, p.duration || 60)),
          duration: p.duration || 60,
          ...(p.event_status ? { status: p.event_status } : p.completed ? { status: "Completed" } : {}),
        })
        .eq("id", p.event_id)
        .eq("teacher_id", teacherId)
    )
  );

  return { success: true };
}

/**
 * Cancellation is a property of the occurrence, never of attendance.
 */
export async function setEventStatus(teacherId: string, eventId: string, status: string) {
  const { error } = await supabase
    .from("calendar_events")
    .update({ status })
    .eq("id", eventId)
    .eq("teacher_id", teacherId);
  if (error) throw error;
}

export async function fetchAttendanceForEvents(
  eventIds: string[]
): Promise<Record<string, AttendanceRecordRow[]>> {
  const map: Record<string, AttendanceRecordRow[]> = {};
  if (!eventIds || eventIds.length === 0) return map;

  const { data, error } = await supabase
    .from("attendance_records")
    .select("*, students(full_name)")
    .in("event_id", eventIds);

  if (error) {
    console.warn("[lesson-plans] attendance fetch error:", error.message);
    return map;
  }

  (data || []).forEach((row: any) => {
    const entry: AttendanceRecordRow = {
      id: row.id,
      teacher_id: row.teacher_id,
      event_id: row.event_id,
      student_id: row.student_id,
      status: row.status as AttendanceStatus,
      notes: row.notes || "",
      student_name: row.students?.full_name || "",
    };
    (map[row.event_id] ||= []).push(entry);
  });

  return map;
}

export async function saveAttendanceRecords(
  teacherId: string,
  eventId: string,
  records: Array<{ student_id: string; status: AttendanceStatus; notes?: string }>
) {
  if (!teacherId || !eventId || records.length === 0) return;

  const rows = records.map((r) => ({
    teacher_id: teacherId,
    event_id: eventId,
    student_id: r.student_id,
    status: r.status,
    notes: r.notes || "",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("attendance_records")
    .upsert(rows, { onConflict: "event_id,student_id" });

  if (error) throw error;
}

export async function clearAttendanceRecord(teacherId: string, eventId: string, studentId: string) {
  await supabase
    .from("attendance_records")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("event_id", eventId)
    .eq("student_id", studentId);
}

/**
 * Ensures calendar occurrences + lesson plans exist for a class (pair or group),
 * respecting teacher time off. Returns the full ordered plan list.
 */
export async function ensureClassOccurrences(
  teacherId: string,
  cls: {
    id: string;
    name: string;
    level?: string;
    start_date?: string;
    schedules: Array<{
      id?: string;
      weekday: string;
      start_time: string;
      duration?: number;
      delivery_mode?: "Online" | "In person";
      location_link?: string | null;
    }>;
  },
  totalOccurrences = 12
): Promise<LessonPlan[]> {
  if (!teacherId || !cls?.id) return [];

  const schedules = cls.schedules || [];
  if (schedules.length === 0) return fetchLessonPlans({ classId: cls.id });

  const timeOff = await fetchTeacherTimeOff(teacherId);
  const todayStr = formatLocalDateStr(new Date());
  const startDate = cls.start_date && cls.start_date > todayStr ? cls.start_date : todayStr;

  const occurrences = generateOccurrences(
    startDate,
    schedules.map((s) => ({
      weekday: s.weekday,
      startTime: (s.start_time || "19:00").slice(0, 5),
      duration: s.duration || 60,
      scheduleId: s.id || null,
      deliveryMode: s.delivery_mode || "Online",
      locationLink: s.location_link || null,
    })),
    totalOccurrences,
    timeOff
  );

  if (occurrences.length > 0) {
    const rows = occurrences.map((o) => ({
      teacher_id: teacherId,
      class_id: cls.id,
      class_schedule_id: o.schedule_id,
      event_type: "class",
      student_name: cls.name,
      level: cls.level || "B1",
      focus: "General",
      date: o.date,
      start_time: o.start_time,
      end_time: o.end_time,
      duration: o.duration,
      type: "Group",
      delivery_mode: o.delivery_mode,
      location_link: o.location_link || "",
      status: "Scheduled",
    }));

    await insertClassEvents(teacherId, cls.id, rows);
  }

  // Load all events of the class and make sure each one has a plan row.
  const { data: events } = await supabase
    .from("calendar_events")
    .select("id, date, start_time, end_time, duration, status")
    .eq("teacher_id", teacherId)
    .eq("class_id", cls.id)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  const existing = await fetchLessonPlans({ classId: cls.id });
  const byEvent = new Map(existing.map((p) => [p.event_id, p]));

  const missing = (events || []).filter((e: any) => !byEvent.has(e.id));
  if (missing.length > 0) {
    let nextNumber = existing.reduce((max, p) => Math.max(max, p.lesson_number || 0), 0);
    const newPlans: LessonPlan[] = missing.map((e: any) => ({
      teacher_id: teacherId,
      event_id: e.id,
      class_id: cls.id,
      student_id: null,
      lesson_number: ++nextNumber,
      scheduled_date: e.date,
      start_time: e.start_time,
      end_time: e.end_time || calculateEndTime(e.start_time, e.duration || 60),
      duration: e.duration || 60,
      content: "",
      homework: "",
      homework_posted: null,
      notes: "",
      attachments: [],
      completed: false,
    }));
    await saveLessonPlans(teacherId, newPlans);
  }

  const plans = await fetchLessonPlans({ classId: cls.id });
  // Renumber sequentially by date for a stable "Aula #" column.
  return plans.map((p, idx) => ({ ...p, lesson_number: p.lesson_number || idx + 1 }));
}

/**
 * Resolves (or creates) the class occurrence for a given date, together with
 * its single lesson plan. Used by the quick "attendance" flow.
 */
export async function getOrCreateClassEventForDate(
  teacherId: string,
  cls: { id: string; name: string; level?: string },
  dateStr: string,
  startTime = "19:00",
  duration = 60
): Promise<LessonPlan | null> {
  if (!teacherId || !cls?.id) return null;

  const start = formatTimeHHMMSS(startTime);

  const { data: existing } = await supabase
    .from("calendar_events")
    .select("id, date, start_time, end_time, duration, status")
    .eq("teacher_id", teacherId)
    .eq("class_id", cls.id)
    .eq("date", dateStr)
    .order("start_time", { ascending: true })
    .limit(1);

  let event = existing?.[0];

  if (!event) {
    const { data, error } = await supabase
      .from("calendar_events")
      .insert({
        teacher_id: teacherId,
        class_id: cls.id,
        event_type: "class",
        student_name: cls.name,
        level: cls.level || "B1",
        focus: "General",
        date: dateStr,
        start_time: start,
        end_time: formatTimeHHMMSS(calculateEndTime(start.slice(0, 5), duration)),
        duration,
        type: "Group",
        delivery_mode: "Online",
        status: "Scheduled",
      })
      .select("id, date, start_time, end_time, duration, status")
      .single();

    if (error || !data) {
      console.warn("[lesson-plans] could not create class occurrence:", error?.message);
      return null;
    }
    event = data;
  }

  const plans = await fetchLessonPlans({ classId: cls.id });
  const existingPlan = plans.find((p) => p.event_id === event!.id);
  if (existingPlan) return { ...existingPlan, event_status: event.status };

  const nextNumber = plans.reduce((max, p) => Math.max(max, p.lesson_number || 0), 0) + 1;
  const plan: LessonPlan = {
    teacher_id: teacherId,
    event_id: event.id,
    class_id: cls.id,
    student_id: null,
    lesson_number: nextNumber,
    scheduled_date: event.date,
    start_time: event.start_time,
    end_time: event.end_time || calculateEndTime((event.start_time || start).slice(0, 5), duration),
    duration: event.duration || duration,
    content: "",
    homework: "",
    homework_posted: null,
    notes: "",
    attachments: [],
    completed: false,
    event_status: event.status,
  };
  await saveLessonPlans(teacherId, [plan]);
  return plan;
}

export interface StudentClassLesson extends LessonPlan {
  class_name: string;
  attendance_status?: AttendanceStatus | null;
}

/**
 * Lessons of every class (pair or group) the student takes part in,
 * so the student profile shows one single history.
 */
export async function fetchStudentClassLessons(studentId: string): Promise<StudentClassLesson[]> {
  if (!studentId) return [];

  const { data: memberships } = await supabase
    .from("class_members")
    .select("class_id, classes(name)")
    .eq("student_id", studentId)
    .eq("status", "active");

  const classIds = (memberships || []).map((m: any) => m.class_id);
  if (classIds.length === 0) return [];

  const nameById = new Map<string, string>(
    (memberships || []).map((m: any) => [m.class_id, m.classes?.name || "Turma"])
  );

  const { data, error } = await supabase
    .from("lesson_plans")
    .select("*, calendar_events:event_id (status)")
    .in("class_id", classIds)
    .order("scheduled_date", { ascending: false });

  if (error) {
    console.warn("[lesson-plans] class history fetch error:", error.message);
    return [];
  }

  const plans = (data || []).map(mapPlanRow);
  const attendance = await fetchAttendanceForEvents(plans.map((p) => p.event_id));

  return plans.map((p) => ({
    ...p,
    class_name: nameById.get(p.class_id || "") || "Turma",
    attendance_status:
      (attendance[p.event_id] || []).find((a) => a.student_id === studentId)?.status ?? null,
  }));
}

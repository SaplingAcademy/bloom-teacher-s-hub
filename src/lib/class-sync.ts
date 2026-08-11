import { supabase } from "@/lib/supabase";
import {
  ClassEntity,
  ClassMember,
  ClassSchedule,
  ClassSession,
  ClassAttendance,
  AttendanceStatusType,
} from "@/types/classes";
import { formatTimeHHMMSS, calculateEndTime, generateOccurrenceDates } from "./calendar-sync";

export interface ClassWithDetails extends ClassEntity {
  members: ClassMember[];
  schedules: ClassSchedule[];
}

/**
 * Fetches all classes owned by teacher with their member profiles and schedule slots
 */
export async function fetchTeacherClasses(teacherId: string): Promise<ClassWithDetails[]> {
  if (!teacherId) return [];

  try {
    const { data: classesData, error: classError } = await supabase
      .from("classes")
      .select("*, class_members(*, students(*)), class_schedules(*)")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false });

    if (classError) {
      console.warn("[class-sync] Error fetching classes:", classError.message);
      return [];
    }

    if (!classesData) return [];

    return classesData.map((c: any) => {
      const members: ClassMember[] = (c.class_members || []).map((m: any) => ({
        id: m.id,
        class_id: m.class_id,
        student_id: m.student_id,
        teacher_id: m.teacher_id,
        joined_at: m.joined_at,
        left_at: m.left_at,
        status: m.status,
        student_name: m.students?.full_name || "Unknown Student",
        student_email: m.students?.email || "",
        student_phone: m.students?.phone || "",
        student_avatar: m.students?.avatar_url || "",
      }));

      const schedules: ClassSchedule[] = (c.class_schedules || []).map((s: any) => ({
        id: s.id,
        class_id: s.class_id,
        teacher_id: s.teacher_id,
        weekday: s.weekday,
        start_time: s.start_time,
        end_time: s.end_time,
        duration: s.duration || 60,
        delivery_mode: s.delivery_mode || "Online",
        location_link: s.location_link || "",
      }));

      return {
        id: c.id,
        teacher_id: c.teacher_id,
        name: c.name,
        type: c.type,
        language: c.language || "English",
        level: c.level || "B1",
        status: c.status || "active",
        start_date: c.start_date,
        package_id: c.package_id,
        notes: c.notes,
        created_at: c.created_at,
        updated_at: c.updated_at,
        members,
        schedules,
      };
    });
  } catch (err) {
    console.error("[class-sync] Unexpected error fetching classes:", err);
    return [];
  }
}

/**
 * Saves or updates a Class entity along with its member relations and recurring schedules
 */
export async function saveClassAndRelations(
  teacherId: string,
  classData: Partial<ClassEntity>,
  studentIds: string[],
  schedulesList: Array<{ weekday: string; startTime: string; duration: number; deliveryMode: "Online" | "In person"; locationLink?: string }>,
  classId?: string | null
): Promise<ClassEntity | null> {
  if (!teacherId || !classData.name) throw new Error("Missing required class fields");

  let savedClass: ClassEntity;

  if (classId) {
    // Update existing class
    const { data, error } = await supabase
      .from("classes")
      .update({
        name: classData.name,
        type: classData.type || "group",
        language: classData.language || "English",
        level: classData.level || "B1",
        status: classData.status || "active",
        package_id: classData.package_id || null,
        notes: classData.notes || "",
        color_key: classData.color_key || "default",
      })
      .eq("id", classId)
      .eq("teacher_id", teacherId)
      .select()
      .single();

    if (error) throw error;
    savedClass = data as ClassEntity;
  } else {
    // Insert new class
    const { data, error } = await supabase
      .from("classes")
      .insert({
        teacher_id: teacherId,
        name: classData.name,
        type: classData.type || "group",
        language: classData.language || "English",
        level: classData.level || "B1",
        status: classData.status || "active",
        start_date: classData.start_date || new Date().toISOString().split("T")[0],
        package_id: classData.package_id || null,
        notes: classData.notes || "",
        color_key: classData.color_key || "default",
      })
      .select()
      .single();

    if (error) throw error;
    savedClass = data as ClassEntity;
  }

  const targetClassId = savedClass.id;

  // Sync Class Members (Upsert active members)
  if (studentIds && studentIds.length > 0) {
    // Delete existing members not in the current list
    await supabase
      .from("class_members")
      .delete()
      .eq("class_id", targetClassId)
      .not("student_id", "in", `(${studentIds.map((id) => `"${id}"`).join(",")})`);

    // Insert new member rows
    const memberRows = studentIds.map((stdId) => ({
      class_id: targetClassId,
      student_id: stdId,
      teacher_id: teacherId,
      status: "active",
    }));

    const { error: memberError } = await supabase
      .from("class_members")
      .upsert(memberRows, { onConflict: "class_id,student_id" });

    if (memberError) console.warn("[class-sync] Member upsert warning:", memberError.message);
  }

  // Sync Class Schedules
  if (schedulesList && schedulesList.length > 0) {
    await supabase.from("class_schedules").delete().eq("class_id", targetClassId);

    const scheduleRows = schedulesList.map((s) => ({
      class_id: targetClassId,
      teacher_id: teacherId,
      weekday: s.weekday,
      start_time: formatTimeHHMMSS(s.startTime),
      end_time: formatTimeHHMMSS(calculateEndTime(s.startTime, s.duration || 60)),
      duration: s.duration || 60,
      delivery_mode: s.deliveryMode || "Online",
      location_link: s.locationLink || "",
    }));

    const { error: scheduleError } = await supabase.from("class_schedules").insert(scheduleRows);
    if (scheduleError) console.warn("[class-sync] Schedule insert warning:", scheduleError.message);

    // Project schedules to calendar_events
    await projectClassSchedulesToCalendar(
      teacherId,
      targetClassId,
      savedClass.name,
      savedClass.level || "B1",
      schedulesList
    );
  }

  return savedClass;
}

/**
 * Projects recurring class schedule occurrences to calendar_events with event_type = 'class'
 */
export async function projectClassSchedulesToCalendar(
  teacherId: string,
  classId: string,
  className: string,
  level: string,
  schedules: Array<{ weekday: string; startTime: string; duration: number; deliveryMode: "Online" | "In person"; locationLink?: string }>
) {
  if (!teacherId || !classId || !schedules || schedules.length === 0) return;

  const todayStr = new Date().toISOString().split("T")[0];

  const calendarRows: any[] = [];
  schedules.forEach((sch) => {
    const dates = generateOccurrenceDates(todayStr, sch.weekday, "Weekly", 8);
    dates.forEach((dateStr) => {
      calendarRows.push({
        teacher_id: teacherId,
        class_id: classId,
        event_type: "class",
        student_name: className,
        level: level,
        focus: "General",
        date: dateStr,
        start_time: formatTimeHHMMSS(sch.startTime),
        end_time: formatTimeHHMMSS(calculateEndTime(sch.startTime, sch.duration || 60)),
        duration: sch.duration || 60,
        type: "Group",
        delivery_mode: sch.deliveryMode || "Online",
        location_link: sch.locationLink || "",
        status: "Scheduled",
      });
    });
  });

  if (calendarRows.length > 0) {
    const { error } = await supabase
      .from("calendar_events")
      .upsert(calendarRows, { onConflict: "class_id,date,start_time", ignoreDuplicates: true });

    if (error) console.warn("[class-sync] Calendar projection warning:", error.message);
  }
}

/**
 * Fetches or initializes class session attendance for a specific session/date
 */
export async function fetchOrCreateClassSessionAttendance(
  teacherId: string,
  classId: string,
  dateStr: string,
  startTime: string = "19:00"
): Promise<{ session: ClassSession; attendance: ClassAttendance[] }> {
  // 1. Fetch or create class session
  let sessionData: any;
  const { data: existingSession } = await supabase
    .from("class_sessions")
    .select("*")
    .eq("class_id", classId)
    .eq("date", dateStr)
    .maybeSingle();

  if (existingSession) {
    sessionData = existingSession;
  } else {
    const { data: newSession, error: createErr } = await supabase
      .from("class_sessions")
      .insert({
        class_id: classId,
        teacher_id: teacherId,
        date: dateStr,
        start_time: formatTimeHHMMSS(startTime),
        end_time: formatTimeHHMMSS(calculateEndTime(startTime, 60)),
        duration: 60,
        status: "scheduled",
      })
      .select()
      .single();

    if (createErr) throw createErr;
    sessionData = newSession;
  }

  // 2. Fetch active class members
  const { data: members } = await supabase
    .from("class_members")
    .select("student_id, students(full_name)")
    .eq("class_id", classId)
    .eq("status", "active");

  // 3. Fetch attendance records
  const { data: existingAttendance } = await supabase
    .from("class_attendance")
    .select("*, students(full_name)")
    .eq("class_session_id", sessionData.id);

  const attendanceMap: Record<string, ClassAttendance> = {};
  (existingAttendance || []).forEach((a: any) => {
    attendanceMap[a.student_id] = {
      id: a.id,
      class_session_id: a.class_session_id,
      student_id: a.student_id,
      teacher_id: a.teacher_id,
      status: a.status as AttendanceStatusType,
      notes: a.notes,
      student_name: a.students?.full_name || "Student",
    };
  });

  // Combine members with attendance
  const attendanceList: ClassAttendance[] = (members || []).map((m: any) => {
    if (attendanceMap[m.student_id]) {
      return attendanceMap[m.student_id];
    }
    return {
      id: "",
      class_session_id: sessionData.id,
      student_id: m.student_id,
      teacher_id: teacherId,
      status: "present",
      student_name: m.students?.full_name || "Student",
    };
  });

  return {
    session: sessionData as ClassSession,
    attendance: attendanceList,
  };
}

/**
 * Saves/upserts per-student attendance list for a class session
 */
export async function saveClassSessionAttendance(
  teacherId: string,
  sessionId: string,
  attendanceList: Array<{ student_id: string; status: AttendanceStatusType; notes?: string }>
) {
  if (!teacherId || !sessionId || !attendanceList) return;

  const rows = attendanceList.map((a) => ({
    class_session_id: sessionId,
    student_id: a.student_id,
    teacher_id: teacherId,
    status: a.status,
    notes: a.notes || "",
  }));

  const { error } = await supabase
    .from("class_attendance")
    .upsert(rows, { onConflict: "class_session_id,student_id" });

  if (error) throw error;
}

/**
 * Fetches the set of student IDs with active memberships in any class
 */
export async function fetchActiveClassMemberStudentIds(teacherId: string): Promise<Set<string>> {
  const activeStudentIds = new Set<string>();
  if (!teacherId) return activeStudentIds;

  try {
    const { data, error } = await supabase
      .from("class_members")
      .select("student_id, status, left_at")
      .eq("teacher_id", teacherId)
      .eq("status", "active")
      .is("left_at", null);

    if (error) {
      console.warn("[class-sync] Error fetching active class memberships:", error.message);
      return activeStudentIds;
    }

    (data || []).forEach((row: any) => {
      if (row.student_id) {
        activeStudentIds.add(row.student_id);
      }
    });
  } catch (err) {
    console.error("[class-sync] Unexpected error fetching active memberships:", err);
  }

  return activeStudentIds;
}

/**
 * Fetches all shared lesson sessions for a class ordered by date desc
 */
export async function fetchClassSessions(classId: string): Promise<ClassSession[]> {
  if (!classId) return [];

  try {
    const { data, error } = await supabase
      .from("class_sessions")
      .select("*")
      .eq("class_id", classId)
      .order("date", { ascending: false });

    if (error) {
      console.warn("[class-sync] Error fetching class sessions:", error.message);
      return [];
    }

    return (data || []) as ClassSession[];
  } catch (err) {
    console.error("[class-sync] Unexpected error fetching class sessions:", err);
    return [];
  }
}

/**
 * Creates a new shared class session record
 */
export async function createClassSession(
  teacherId: string,
  classId: string,
  sessionData: {
    date: string;
    start_time: string;
    end_time?: string;
    duration?: number;
    topic?: string;
    content?: string;
    homework?: string;
    materials_url?: string;
    notes?: string;
    status?: "scheduled" | "completed" | "cancelled";
  }
): Promise<ClassSession> {
  if (!teacherId || !classId || !sessionData.date) {
    throw new Error("Missing required session fields");
  }

  const duration = sessionData.duration || 60;
  const rawStart = sessionData.start_time || "19:00";
  const rawEnd = sessionData.end_time || calculateEndTime(rawStart, duration);

  const { data, error } = await supabase
    .from("class_sessions")
    .insert({
      class_id: classId,
      teacher_id: teacherId,
      date: sessionData.date,
      start_time: formatTimeHHMMSS(rawStart),
      end_time: formatTimeHHMMSS(rawEnd),
      duration: duration,
      topic: sessionData.topic || "",
      content: sessionData.content || "",
      homework: sessionData.homework || "",
      materials_url: sessionData.materials_url || "",
      notes: sessionData.notes || "",
      status: sessionData.status || "completed",
    })
    .select()
    .single();

  if (error) throw error;
  return data as ClassSession;
}

import { supabase } from "@/lib/supabase";
import { ClassEntity, ClassMember, ClassSchedule } from "@/types/classes";
import { formatTimeHHMMSS, calculateEndTime } from "./calendar-sync";
import { generateOccurrences, insertClassEvents } from "./lesson-plans";
import { fetchTeacherTimeOff, formatLocalDateStr } from "./time-off-engine";

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
 * Projects recurring class schedule occurrences to calendar_events.
 * Uses the single shared occurrence generator (teacher time off aware).
 */
export async function projectClassSchedulesToCalendar(
  teacherId: string,
  classId: string,
  className: string,
  level: string,
  schedules: Array<{ weekday: string; startTime: string; duration: number; deliveryMode: "Online" | "In person"; locationLink?: string }>,
  totalOccurrences = 12
) {
  if (!teacherId || !classId || !schedules || schedules.length === 0) return;

  const timeOff = await fetchTeacherTimeOff(teacherId);
  const occurrences = generateOccurrences(
    formatLocalDateStr(new Date()),
    schedules.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime,
      duration: s.duration || 60,
      deliveryMode: s.deliveryMode || "Online",
      locationLink: s.locationLink || null,
    })),
    totalOccurrences,
    timeOff
  );

  if (occurrences.length === 0) return;

  const calendarRows = occurrences.map((o) => ({
    teacher_id: teacherId,
    class_id: classId,
    event_type: "class",
    student_name: className,
    level,
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

  await insertClassEvents(teacherId, classId, calendarRows);
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

import { supabase } from "@/lib/supabase";
import { calculateEndTime, formatTimeHHMMSS } from "@/lib/calendar-sync";
import type { ScheduleFormInput } from "@/lib/student-schedules";

export type ClassScheduleInput = Omit<ScheduleFormInput, "locationLink"> & { locationLink?: string };
export const WEEKLY_LESSON_COUNTS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Retain configured slots (and IDs); only newly added slots need teacher input. */
export function resizeClassSchedules(slots: ClassScheduleInput[], count: number): ClassScheduleInput[] {
  if (!WEEKLY_LESSON_COUNTS.some((value) => value === count)) throw new Error("Invalid weekly lesson count");
  return Array.from({ length: count }, (_, index) => slots[index] ?? {
    weekday: "Monday", startTime: "", duration: 60, deliveryMode: "Online", locationLink: "",
  });
}

/** Existing rows keep their identity; remove only rows omitted by the teacher. */
export async function persistClassSchedules(teacherId: string, classId: string, slots: ClassScheduleInput[]): Promise<ClassScheduleInput[]> {
  if (!teacherId || !classId) throw new Error("Missing class owner");
  const { data: existing, error: readError } = await supabase.from("class_schedules")
    .select("id").eq("teacher_id", teacherId).eq("class_id", classId);
  if (readError) throw readError;
  const existingIds = new Set<string>((existing || []).map((row) => row.id));
  const keptIds = new Set(slots.flatMap((slot) => slot.id && existingIds.has(slot.id) ? [slot.id] : []));
  const removed = [...existingIds].filter((id) => !keptIds.has(id));
  if (removed.length) {
    const { error } = await supabase.from("class_schedules").delete()
      .eq("teacher_id", teacherId).eq("class_id", classId).in("id", removed);
    if (error) throw error;
  }
  const saved: ClassScheduleInput[] = [];
  for (const slot of slots) {
    const payload = {
      weekday: slot.weekday,
      start_time: formatTimeHHMMSS(slot.startTime),
      end_time: formatTimeHHMMSS(calculateEndTime(slot.startTime, slot.duration)),
      duration: slot.duration,
      delivery_mode: slot.deliveryMode,
      location_link: slot.locationLink || "",
      ...(slot.colorKey !== undefined ? { color_key: slot.colorKey && slot.colorKey !== "default" ? slot.colorKey : null } : {}),
    };
    if (slot.id && existingIds.has(slot.id)) {
      const { error } = await supabase.from("class_schedules").update(payload)
        .eq("teacher_id", teacherId).eq("class_id", classId).eq("id", slot.id);
      if (error) throw error;
      saved.push(slot);
    } else {
      const { data, error } = await supabase.from("class_schedules")
        .insert({ ...payload, teacher_id: teacherId, class_id: classId }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("Class schedule was not saved");
      saved.push({ ...slot, id: data.id });
    }
  }
  return saved;
}
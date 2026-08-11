import { supabase } from "@/lib/supabase";

export interface WorkingAvailability {
  day: string; // "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  enabled: boolean;
  startTime: string; // "08:00"
  endTime: string; // "18:00"
}

export const WEEKDAYS_MAP: Array<{ key: string; labelPt: string; labelEn: string; fullPt: string }> = [
  { key: "Monday", labelPt: "Seg", labelEn: "Mon", fullPt: "Segunda-feira" },
  { key: "Tuesday", labelPt: "Ter", labelEn: "Tue", fullPt: "Terça-feira" },
  { key: "Wednesday", labelPt: "Qua", labelEn: "Wed", fullPt: "Quarta-feira" },
  { key: "Thursday", labelPt: "Qui", labelEn: "Thu", fullPt: "Quinta-feira" },
  { key: "Friday", labelPt: "Sex", labelEn: "Fri", fullPt: "Sexta-feira" },
  { key: "Saturday", labelPt: "Sáb", labelEn: "Sat", fullPt: "Sábado" },
  { key: "Sunday", labelPt: "Dom", labelEn: "Sun", fullPt: "Domingo" },
];

/**
 * Fetch teacher working availability from Supabase settings (with LocalStorage fallback)
 * Returns [] if teacher has not configured working availability yet.
 */
export async function fetchTeacherWorkingAvailability(
  teacherId: string
): Promise<WorkingAvailability[]> {
  if (!teacherId) return [];

  // LocalStorage check first for immediate cache
  const localCache = typeof localStorage !== "undefined" ? localStorage.getItem(`bloom.working_availability.${teacherId}`) : null;
  let cachedData: WorkingAvailability[] | null = null;
  if (localCache) {
    try {
      cachedData = JSON.parse(localCache);
    } catch (e) {
      console.error("[availability-engine] Error parsing cached working availability:", e);
    }
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("working_availability")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (!error && data && data.working_availability) {
      const serverAvail = data.working_availability as WorkingAvailability[];
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`bloom.working_availability.${teacherId}`, JSON.stringify(serverAvail));
      }
      return serverAvail;
    }
  } catch (err) {
    console.warn("[availability-engine] Error fetching working availability from server:", err);
  }

  return cachedData || [];
}

/**
 * Save teacher working availability to Supabase settings & LocalStorage
 */
export async function saveTeacherWorkingAvailability(
  teacherId: string,
  availability: WorkingAvailability[]
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) return { success: false, error: "ID de professor inválido." };

  // Always sync LocalStorage
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`bloom.working_availability.${teacherId}`, JSON.stringify(availability));
  }

  try {
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("settings")
        .update({ working_availability: availability })
        .eq("teacher_id", teacherId);
    } else {
      await supabase
        .from("settings")
        .insert({
          teacher_id: teacherId,
          working_availability: availability,
        });
    }

    return { success: true };
  } catch (err: any) {
    console.warn("[availability-engine] Note on server sync for working availability:", err?.message || err);
    return { success: true };
  }
}

/**
 * Check if a proposed weekly availability conflicts with existing student recurring schedules
 */
export async function checkWorkingAvailabilityConflicts(
  teacherId: string,
  newAvailability: WorkingAvailability[]
): Promise<Array<{ studentName: string; weekday: string; startTime: string }>> {
  if (!teacherId || !newAvailability) return [];

  const conflicts: Array<{ studentName: string; weekday: string; startTime: string }> = [];

  try {
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name, status")
      .eq("teacher_id", teacherId)
      .neq("status", "Inactive");

    if (!studentsData || studentsData.length === 0) return [];

    const studentIds = studentsData.map((s) => s.id);
    const { data: schedulesData } = await supabase
      .from("student_schedules")
      .select("student_id, weekday, start_time, end_time")
      .in("student_id", studentIds);

    if (!schedulesData || schedulesData.length === 0) return [];

    const enabledDaysMap = new Map<string, WorkingAvailability>();
    newAvailability.filter((a) => a.enabled).forEach((a) => enabledDaysMap.set(a.day.toLowerCase(), a));

    for (const sch of schedulesData) {
      const student = studentsData.find((s) => s.id === sch.student_id);
      if (!student) continue;

      const dayKey = sch.weekday?.toLowerCase();
      const avail = enabledDaysMap.get(dayKey);

      if (!avail) {
        conflicts.push({
          studentName: student.full_name,
          weekday: sch.weekday,
          startTime: sch.start_time || "09:00",
        });
      } else if (sch.start_time && (sch.start_time < avail.startTime || sch.start_time >= avail.endTime)) {
        conflicts.push({
          studentName: student.full_name,
          weekday: sch.weekday,
          startTime: sch.start_time,
        });
      }
    }
  } catch (err) {
    console.warn("[availability-engine] Error checking availability conflicts:", err);
  }

  return conflicts;
}

export interface RestBlock {
  id: string;
  day: string; // "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
  startTime: string; // "12:00"
  endTime: string; // "13:30"
  label?: string; // "Almoço", "Pausa", "Deslocamento", "Estudo", "Horário pessoal", "Outro"
  type?: "lunch" | "pause" | "commute" | "study" | "personal" | "other";
}

/**
 * Fetch teacher recurring rest blocks from Supabase settings (with LocalStorage fallback)
 */
export async function fetchTeacherRestBlocks(teacherId: string): Promise<RestBlock[]> {
  if (!teacherId) return [];

  const localCache =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(`bloom.rest_blocks.${teacherId}`)
      : null;
  let cachedData: RestBlock[] | null = null;
  if (localCache) {
    try {
      cachedData = JSON.parse(localCache);
    } catch (e) {
      console.error("[availability-engine] Error parsing cached rest blocks:", e);
    }
  }

  try {
    const { data, error } = await supabase
      .from("settings")
      .select("rest_blocks")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (!error && data && (data as any).rest_blocks) {
      const serverBlocks = (data as any).rest_blocks as RestBlock[];
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`bloom.rest_blocks.${teacherId}`, JSON.stringify(serverBlocks));
      }
      return serverBlocks;
    }
  } catch (err) {
    console.warn("[availability-engine] Note on server fetch for rest blocks:", err);
  }

  return cachedData || [];
}

/**
 * Save teacher recurring rest blocks to Supabase settings & LocalStorage
 */
export async function saveTeacherRestBlocks(
  teacherId: string,
  restBlocks: RestBlock[]
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) return { success: false, error: "ID de professor inválido." };

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`bloom.rest_blocks.${teacherId}`, JSON.stringify(restBlocks));
  }

  try {
    const { data: existing } = await supabase
      .from("settings")
      .select("id")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("settings")
        .update({ rest_blocks: restBlocks as any })
        .eq("teacher_id", teacherId);
    } else {
      await supabase.from("settings").insert({
        teacher_id: teacherId,
        rest_blocks: restBlocks as any,
      });
    }

    return { success: true };
  } catch (err: any) {
    console.warn("[availability-engine] Note on server sync for rest blocks:", err?.message || err);
    return { success: true };
  }
}

/**
 * Validate if a rest block falls properly inside working availability
 */
export function validateRestBlock(
  workingAvail: WorkingAvailability[],
  block: RestBlock
): { valid: boolean; error?: string } {
  if (!block.startTime || !block.endTime) {
    return { valid: false, error: "Horários de início e fim são obrigatórios." };
  }

  if (block.startTime >= block.endTime) {
    return { valid: false, error: "O horário de início deve ser anterior ao horário de término." };
  }

  const dayAvail = workingAvail.find(
    (a) => a.day.toLowerCase() === block.day.toLowerCase() && a.enabled
  );

  if (!dayAvail) {
    return {
      valid: false,
      error: `Você não possui horário de trabalho ativado em ${WEEKDAYS_MAP.find((w) => w.key === block.day)?.fullPt || block.day}.`,
    };
  }

  if (block.startTime < dayAvail.startTime || block.endTime > dayAvail.endTime) {
    return {
      valid: false,
      error: `Este horário de descanso (${block.startTime}–${block.endTime}) está fora da sua disponibilidade de trabalho (${dayAvail.startTime}–${dayAvail.endTime}).`,
    };
  }

  return { valid: true };
}

/**
 * Check if proposed rest blocks conflict with existing student or class recurring schedules
 */
export async function checkRestBlockConflicts(
  teacherId: string,
  restBlocks: RestBlock[]
): Promise<Array<{ targetName: string; weekday: string; timeRange: string; restLabel: string }>> {
  if (!teacherId || !restBlocks || restBlocks.length === 0) return [];

  const conflicts: Array<{ targetName: string; weekday: string; timeRange: string; restLabel: string }> = [];

  try {
    // 1. Fetch active students & schedules
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name, status")
      .eq("teacher_id", teacherId)
      .neq("status", "Inactive");

    if (studentsData && studentsData.length > 0) {
      const studentIds = studentsData.map((s) => s.id);
      const { data: schedulesData } = await supabase
        .from("student_schedules")
        .select("student_id, weekday, start_time, end_time")
        .in("student_id", studentIds);

      if (schedulesData) {
        for (const sch of schedulesData) {
          const student = studentsData.find((s) => s.id === sch.student_id);
          if (!student || !sch.start_time || !sch.end_time) continue;

          // Check against rest blocks on same weekday
          const dayBlocks = restBlocks.filter(
            (b) => b.day.toLowerCase() === sch.weekday?.toLowerCase()
          );

          for (const rb of dayBlocks) {
            // Overlap condition: start1 < end2 AND start2 < end1
            if (sch.start_time < rb.endTime && rb.startTime < sch.end_time) {
              conflicts.push({
                targetName: student.full_name,
                weekday: sch.weekday,
                timeRange: `${sch.start_time}–${sch.end_time}`,
                restLabel: rb.label || "Descanso",
              });
            }
          }
        }
      }
    }

    // 2. Fetch active classes & schedules
    const { data: classesData } = await supabase
      .from("classes")
      .select("id, name, status")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    if (classesData && classesData.length > 0) {
      const classIds = classesData.map((c) => c.id);
      const { data: classSchedulesData } = await supabase
        .from("class_schedules")
        .select("class_id, weekday, start_time, end_time")
        .in("class_id", classIds);

      if (classSchedulesData) {
        for (const cSch of classSchedulesData) {
          const cls = classesData.find((c) => c.id === cSch.class_id);
          if (!cls || !cSch.start_time || !cSch.end_time) continue;

          const dayBlocks = restBlocks.filter(
            (b) => b.day.toLowerCase() === cSch.weekday?.toLowerCase()
          );

          for (const rb of dayBlocks) {
            if (cSch.start_time < rb.endTime && rb.startTime < cSch.end_time) {
              conflicts.push({
                targetName: `Turma: ${cls.name}`,
                weekday: cSch.weekday,
                timeRange: `${cSch.start_time}–${cSch.end_time}`,
                restLabel: rb.label || "Descanso",
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("[availability-engine] Error checking rest block conflicts:", err);
  }

  return conflicts;
}

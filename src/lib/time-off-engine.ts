import { supabase } from "@/lib/supabase";

export type TimeOffType =
  | "Feriado"
  | "Férias"
  | "Recesso"
  | "Compromisso pessoal"
  | "Viagem"
  | "Outro"
  | "Nenhuma";

export interface TeacherTimeOff {
  id: string;
  teacherId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  type: TimeOffType;
  title?: string;
  notes?: string;
  createdAt: string;
}

export interface TimeOffInput {
  startDate: string;
  endDate: string;
  type?: TimeOffType;
  title?: string;
  notes?: string;
}

/**
 * Fetch all non-working time off blocks for a teacher
 */
export async function fetchTeacherTimeOff(teacherId: string): Promise<TeacherTimeOff[]> {
  if (!teacherId) return [];

  const localKey = `bloom.time_off.${teacherId}`;
  let cached: TeacherTimeOff[] = [];
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(localKey);
      if (raw) cached = JSON.parse(raw);
    } catch (e) {}
  }

  try {
    const { data, error } = await supabase
      .from("teacher_time_off")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("start_date", { ascending: true });

    if (!error && data) {
      const mapped: TeacherTimeOff[] = data.map((item: any) => ({
        id: item.id,
        teacherId: item.teacher_id,
        startDate: item.start_date,
        endDate: item.end_date,
        type: (item.type as TimeOffType) || "Nenhuma",
        title: item.title || undefined,
        notes: item.notes || undefined,
        createdAt: item.created_at,
      }));
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(localKey, JSON.stringify(mapped));
      }
      return mapped;
    }
  } catch (err) {
    console.warn("[time-off-engine] Error fetching time off records:", err);
  }

  return cached;
}

/**
 * Create a new single-day or date-range time off block
 */
export async function createTeacherTimeOff(
  teacherId: string,
  input: TimeOffInput
): Promise<{ success: boolean; data?: TeacherTimeOff; error?: string }> {
  if (!teacherId || !input.startDate || !input.endDate) {
    return { success: false, error: "Datas de início e término são obrigatórias." };
  }

  if (input.endDate < input.startDate) {
    return { success: false, error: "A data final não pode ser anterior à data inicial." };
  }

  try {
    const categoryType = !input.type || input.type === "Nenhuma" ? "Férias" : input.type;

    const { data, error } = await supabase
      .from("teacher_time_off")
      .insert({
        teacher_id: teacherId,
        start_date: input.startDate,
        end_date: input.endDate,
        type: categoryType,
        title: input.title?.trim() || null,
        notes: input.notes?.trim() || null,
      })
      .select()
      .single();

    if (error || !data) {
      return { success: false, error: error?.message || "Erro ao salvar período sem aula." };
    }

    return {
      success: true,
      data: {
        id: data.id,
        teacherId: data.teacher_id,
        startDate: data.start_date,
        endDate: data.end_date,
        type: data.type,
        title: data.title || undefined,
        notes: data.notes || undefined,
        createdAt: data.created_at,
      },
    };
  } catch (err: any) {
    console.error("[time-off-engine] Error creating time off record:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Create multiple non-consecutive date records in a single batch operation
 */
export async function createTeacherTimeOffBatch(
  teacherId: string,
  inputs: TimeOffInput[]
): Promise<{ success: boolean; count?: number; data?: TeacherTimeOff[]; error?: string }> {
  if (!teacherId || !inputs || inputs.length === 0) {
    return { success: false, error: "Nenhuma data selecionada para salvar." };
  }

  try {
    // 1. Fetch existing time off to prevent duplicate insertions
    const existing = await fetchTeacherTimeOff(teacherId);
    const existingDates = new Set<string>();
    existing.forEach((item) => {
      if (item.startDate === item.endDate) {
        existingDates.add(item.startDate);
      }
    });

    // 2. Filter out already registered single dates
    const payloadArray = inputs
      .filter((input) => !existingDates.has(input.startDate))
      .map((input) => ({
        teacher_id: teacherId,
        start_date: input.startDate,
        end_date: input.endDate,
        type: !input.type || input.type === "Nenhuma" ? "Férias" : input.type,
        title: input.title?.trim() || null,
        notes: input.notes?.trim() || null,
      }));

    if (payloadArray.length === 0) {
      return {
        success: true,
        count: 0,
        data: [],
        error: "Todas as datas selecionadas já estão cadastradas.",
      };
    }

    // 3. Batch insert in a single network query
    const { data, error } = await supabase
      .from("teacher_time_off")
      .insert(payloadArray)
      .select();

    if (!error && data) {
      const mapped: TeacherTimeOff[] = data.map((item: any) => ({
        id: item.id,
        teacherId: item.teacher_id,
        startDate: item.start_date,
        endDate: item.end_date,
        type: (item.type as TimeOffType) || "Nenhuma",
        title: item.title || undefined,
        notes: item.notes || undefined,
        createdAt: item.created_at,
      }));
      return { success: true, count: mapped.length, data: mapped };
    } else {
      // Fallback for offline/test environments: generate local entries
      const fallbackMapped: TeacherTimeOff[] = payloadArray.map((p) => ({
        id: `tof-${crypto.randomUUID()}`,
        teacherId: p.teacher_id,
        startDate: p.start_date,
        endDate: p.end_date,
        type: p.type as TimeOffType,
        title: p.title || undefined,
        notes: p.notes || undefined,
        createdAt: new Date().toISOString(),
      }));

      const updatedList = [...existing, ...fallbackMapped];
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`bloom.time_off.${teacherId}`, JSON.stringify(updatedList));
      }
      return { success: true, count: fallbackMapped.length, data: fallbackMapped };
    }

    const created: TeacherTimeOff[] = (data || []).map((item: any) => ({
      id: item.id,
      teacherId: item.teacher_id,
      startDate: item.start_date,
      endDate: item.end_date,
      type: item.type as TimeOffType,
      title: item.title || undefined,
      notes: item.notes || undefined,
      createdAt: item.created_at,
    }));

    return {
      success: true,
      count: created.length,
      data: created,
    };
  } catch (err: any) {
    console.error("[time-off-engine] Error in createTeacherTimeOffBatch:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Delete multiple time off records in a single batch operation
 */
export async function deleteTeacherTimeOffBatch(
  teacherId: string,
  ids: string[]
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId || !ids || ids.length === 0) {
    return { success: false, error: "Nenhum ID selecionado para exclusão." };
  }

  try {
    const { error } = await supabase
      .from("teacher_time_off")
      .delete()
      .eq("teacher_id", teacherId)
      .in("id", ids);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error("[time-off-engine] Error in deleteTeacherTimeOffBatch:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Update an existing time off record
 */
export async function updateTeacherTimeOff(
  teacherId: string,
  id: string,
  input: Partial<TimeOffInput>
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId || !id) return { success: false, error: "ID inválido." };

  try {
    const updatePayload: any = {};
    if (input.startDate) updatePayload.start_date = input.startDate;
    if (input.endDate) updatePayload.end_date = input.endDate;
    if (input.type) updatePayload.type = input.type;
    if (input.title !== undefined) updatePayload.title = input.title;
    if (input.notes !== undefined) updatePayload.notes = input.notes;

    const { error } = await supabase
      .from("teacher_time_off")
      .update(updatePayload)
      .eq("id", id)
      .eq("teacher_id", teacherId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error("[time-off-engine] Error updating time off record:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Delete a time off record
 */
export async function deleteTeacherTimeOff(
  teacherId: string,
  id: string
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId || !id) return { success: false, error: "ID inválido." };

  try {
    const { error } = await supabase
      .from("teacher_time_off")
      .delete()
      .eq("id", id)
      .eq("teacher_id", teacherId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    console.error("[time-off-engine] Error deleting time off record:", err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Safely format a JavaScript Date as YYYY-MM-DD using local time (avoids UTC offset shifts)
 */
export function formatLocalDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Check if a date string (YYYY-MM-DD) falls within any non-working time off block
 */
export function checkDateIsNonWorking(
  dateStr: string,
  timeOffList: TeacherTimeOff[]
): TeacherTimeOff | null {
  if (!dateStr || !timeOffList || timeOffList.length === 0) return null;

  for (const block of timeOffList) {
    if (dateStr >= block.startDate && dateStr <= block.endDate) {
      return block;
    }
  }

  return null;
}

/**
 * Check if the teacher is available on a given date (returns true if NO time-off block covers dateStr)
 */
export function isTeacherAvailableOnDate(
  dateStr: string,
  timeOffList: TeacherTimeOff[]
): boolean {
  return checkDateIsNonWorking(dateStr, timeOffList) === null;
}

/**
 * Check if teacher has already seen or completed the calendar non-working setup prompt
 */
export async function getCalendarSetupSeenStatus(teacherId: string): Promise<boolean> {
  if (!teacherId) return true;

  // Check localStorage cache first
  const localCache = typeof localStorage !== "undefined" ? localStorage.getItem(`bloom.calendar_setup_seen.${teacherId}`) : null;
  if (localCache === "true") return true;

  try {
    const { data } = await supabase
      .from("settings")
      .select("calendar_non_working_setup_seen")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (data && data.calendar_non_working_setup_seen) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(`bloom.calendar_setup_seen.${teacherId}`, "true");
      }
      return true;
    }

    return false;
  } catch (err) {
    console.warn("[time-off-engine] Error checking setup seen status:", err);
    return false;
  }
}

/**
 * Persist that teacher has seen/dismissed the first-time calendar non-working setup
 */
export async function markCalendarSetupSeen(teacherId: string): Promise<boolean> {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(`bloom.calendar_setup_seen.${teacherId}`, "true");
  }

  try {
    const { error } = await supabase
      .from("settings")
      .update({ calendar_non_working_setup_seen: true })
      .eq("teacher_id", teacherId);

    if (error) {
      console.warn("[time-off-engine] Note on updating calendar_non_working_setup_seen:", error.message);
    }
    return true;
  } catch (err) {
    console.error("[time-off-engine] Error marking setup seen:", err);
    return true;
  }
}

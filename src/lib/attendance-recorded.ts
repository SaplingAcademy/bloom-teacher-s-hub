import { supabase } from "@/lib/supabase";

/**
 * Keeps calendar_events.attendance_recorded derived from attendance_records.
 * Recomputed (never one-way) after every attendance write or clear.
 */

export interface ClassMemberPeriod {
  student_id: string;
  joined_at?: string | null;
  left_at?: string | null;
}

/** Members who belonged to the class on the occurrence date (ended memberships included). */
export function expectedClassAttendees(members: ClassMemberPeriod[], eventDate: string): string[] {
  const ids = new Set<string>();
  for (const m of members) {
    const joined = m.joined_at ? String(m.joined_at).slice(0, 10) : null;
    const left = m.left_at ? String(m.left_at).slice(0, 10) : null;
    if (joined && joined > eventDate) continue;
    if (left && left <= eventDate) continue;
    ids.add(m.student_id);
  }
  return [...ids];
}

/** Complete only when every expected student has a record; no expected students means not recorded. */
export function isAttendanceComplete(expectedStudentIds: string[], recordedStudentIds: string[]): boolean {
  if (expectedStudentIds.length === 0) return false;
  const recorded = new Set(recordedStudentIds);
  return expectedStudentIds.every((id) => recorded.has(id));
}

export async function syncEventAttendanceRecorded(teacherId: string, eventId: string): Promise<boolean> {
  const { data: event, error } = await supabase
    .from("calendar_events")
    .select("id, student_id, class_id, date, attendance_recorded, attendance_records(student_id)")
    .eq("teacher_id", teacherId)
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw error;
  if (!event) return false;

  const recordedIds = ((event as any).attendance_records || []).map((r: any) => r.student_id);
  let expected: string[] = [];
  if ((event as any).class_id) {
    const { data: members, error: membersError } = await supabase
      .from("class_members")
      .select("student_id, joined_at, left_at")
      .eq("teacher_id", teacherId)
      .eq("class_id", (event as any).class_id);
    if (membersError) throw membersError;
    expected = expectedClassAttendees((members || []) as ClassMemberPeriod[], (event as any).date);
  } else if ((event as any).student_id) {
    expected = [(event as any).student_id];
  }

  const complete = isAttendanceComplete(expected, recordedIds);
  if (Boolean((event as any).attendance_recorded) !== complete) {
    const { error: updateError } = await supabase
      .from("calendar_events")
      .update({ attendance_recorded: complete })
      .eq("teacher_id", teacherId)
      .eq("id", eventId);
    if (updateError) throw updateError;
  }
  return complete;
}

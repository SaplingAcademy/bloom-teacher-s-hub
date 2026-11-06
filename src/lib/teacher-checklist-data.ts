import { supabase } from "@/lib/supabase";
import { checklistCommandIds, checklistTitle, sortChecklist, type ChecklistCommand, type TeacherChecklistItem } from "./teacher-checklist";

const TABLE = "teacher_checklist_items";
const FIELDS = "id,teacher_id,title,completed,created_at,updated_at";
export const teacherChecklistKey = (owner: string | undefined) => ["teacher-checklist", owner] as const;

async function authenticatedTeacher(expectedId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expectedId || data.user?.id !== expectedId) throw new Error("authentication_changed");
  return data.user.id;
}

function readItem(value: unknown, owner: string): TeacherChecklistItem {
  if (!value || typeof value !== "object") throw new Error("checklist_invalid_row");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id || row.teacher_id !== owner
    || typeof row.title !== "string" || !row.title.trim() || typeof row.completed !== "boolean"
    || typeof row.created_at !== "string" || typeof row.updated_at !== "string") throw new Error("checklist_invalid_row");
  return { id: row.id, teacher_id: owner, title: row.title, completed: row.completed,
    created_at: row.created_at, updated_at: row.updated_at };
}

export async function fetchTeacherChecklist(expectedId: string, signal?: AbortSignal): Promise<TeacherChecklistItem[]> {
  const owner = await authenticatedTeacher(expectedId);
  const rows: TeacherChecklistItem[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(TABLE).select(FIELDS).eq("teacher_id", owner)
      .order("completed").order("created_at").order("id").range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("checklist_invalid_rows");
    rows.push(...data.map((row) => readItem(row, owner)));
    if (data.length < 500) return sortChecklist(rows);
  }
}

export type ChecklistResult = { item: TeacherChecklistItem } | { deletedIds: string[] };

/** Session client and owner filters complement, never bypass, the installed RLS. */
export async function persistChecklistCommand(expectedId: string, command: ChecklistCommand): Promise<ChecklistResult> {
  const owner = await authenticatedTeacher(expectedId);
  if (command.type === "create") {
    const title = checklistTitle(command.title);
    const { data, error } = await supabase.from(TABLE).insert({ id: command.id, teacher_id: owner, title, completed: false })
      .select(FIELDS).single();
    if (!error) return { item: readItem(data, owner) };
    if (error.code !== "23505") throw error;
    // Reusing the form UUID safely recovers a create whose response was lost after commit.
    const { data: saved, error: readError } = await supabase.from(TABLE).select(FIELDS)
      .eq("teacher_id", owner).eq("id", command.id).single();
    if (readError) throw readError;
    const item = readItem(saved, owner);
    if (item.title !== title) throw new Error("checklist_item_changed");
    return { item };
  }
  if (command.type === "clear") {
    const ids = checklistCommandIds(command);
    if (!ids.length) return { deletedIds: [] };
    const { data, error } = await supabase.from(TABLE).delete().eq("teacher_id", owner)
      .eq("completed", true).in("id", [...ids]).select("id");
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("checklist_invalid_rows");
    return { deletedIds: data.map((row) => String(row.id)) };
  }
  if (command.type === "delete") {
    const { data, error } = await supabase.from(TABLE).delete().eq("teacher_id", owner).eq("id", command.id).select("id").maybeSingle();
    if (error) throw error;
    // Deletion is idempotent if an earlier request committed but its response was lost.
    return { deletedIds: data ? [String(data.id)] : [] };
  }
  const patch = command.type === "edit" ? { title: checklistTitle(command.title) } : { completed: command.completed };
  const { data, error } = await supabase.from(TABLE).update(patch).eq("teacher_id", owner).eq("id", command.id).select(FIELDS).single();
  if (error) throw error;
  const item = readItem(data, owner);
  if (item.id !== command.id) throw new Error("checklist_invalid_row");
  return { item };
}
import { supabase } from "@/lib/supabase";
import { notePosition, prepareNoteDraft, sortNotes, type NoteCommand, type WorkspaceNote } from "./workspace-notes";

const FIELDS = "id,user_id,title,content,color,pinned,order_index,pos_x,pos_y,project_id,created_at,updated_at";
/** Each board has its own cache: the personal board (project_id IS NULL) or one project's board. */
export const workspaceNotesKey = (userId: string | undefined, projectId: string | null = null) =>
  ["workspace-notes", userId, projectId ?? "personal"] as const;

async function authenticatedOwner(expectedId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expectedId || data.user?.id !== expectedId) throw new Error("authentication_changed");
  return data.user.id;
}

export async function fetchWorkspaceNotes(expectedId: string, signal?: AbortSignal, projectId: string | null = null): Promise<WorkspaceNote[]> {
  const owner = await authenticatedOwner(expectedId);
  const rows: WorkspaceNote[] = [];
  // Read complete boards rather than silently truncating at the Data API row limit.
  for (let offset = 0; ; offset += 500) {
    const notes = supabase.from("workspace_notes").select(FIELDS);
    // Boards never mix: personal reads only the teacher's project_id IS NULL notes; a project board
    // reads every note of that project (owner and accepted participants, decided by RLS).
    let query = (projectId ? notes.eq("project_id", projectId) : notes.eq("user_id", owner).is("project_id", null))
      .order("pinned", { ascending: false }).order("order_index").order("created_at").order("id").range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as WorkspaceNote[]));
    if (data.length < 500) return sortNotes(rows);
  }
}

/**
 * Author comes from Auth, never draft input. Personal notes filter by author; notes of a project
 * board filter by that project, and RLS decides (participants edit any note; deleting another
 * author's note is owner-only). projectId comes from the board (route) and is set only on create.
 */
export async function persistNoteCommand(expectedId: string, command: NoteCommand, optimistic: readonly WorkspaceNote[], projectId: string | null = null): Promise<WorkspaceNote | null> {
  const owner = await authenticatedOwner(expectedId);
  const note = optimistic.find((entry) => entry.id === command.id);
  const scope = <Q extends { eq: (column: string, value: string) => Q }>(query: Q) =>
    projectId ? query.eq("project_id", projectId) : query.eq("user_id", owner);
  if (command.type === "delete") {
    const { data, error } = await scope(supabase.from("workspace_notes").delete()).eq("id", command.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("note_not_found");
    return null;
  }
  if (!note || (note.user_id !== owner && (!projectId || command.type === "create"))) throw new Error("note_not_found");
  if (command.type === "create") {
    const { data, error } = await supabase.from("workspace_notes").insert({
      id: command.id, user_id: owner, ...prepareNoteDraft(command.draft), pinned: false, order_index: note.order_index,
      ...(projectId ? { project_id: projectId } : {}),
    }).select(FIELDS).single();
    if (!error) return data as WorkspaceNote;
    // Same editor keeps its UUID across uncertain-network retries; do not create another note.
    if (error.code !== "23505") throw error;
    const { data: saved, error: readError } = await supabase.from("workspace_notes").select(FIELDS).eq("user_id", owner).eq("id", command.id).single();
    if (readError) throw readError;
    const draft = prepareNoteDraft(command.draft);
    if (saved.title !== draft.title || saved.content !== draft.content || saved.color !== draft.color) throw new Error("note_changed");
    return saved as WorkspaceNote;
  }
  // Each command writes only its own columns (position: pos_x/pos_y; layer: order_index).
  const patch = command.type === "edit" ? prepareNoteDraft(command.draft)
    : command.type === "pin" ? { pinned: command.pinned }
    : command.type === "position" ? notePosition(command.x, command.y)
    : { order_index: note.order_index };
  const { data, error } = await scope(supabase.from("workspace_notes").update(patch)).eq("id", command.id).select(FIELDS).single();
  if (error) throw error;
  return data as WorkspaceNote;
}
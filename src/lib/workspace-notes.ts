export const NOTE_COLORS = ["yellow", "peach", "mint", "lavender", "rose", "sky", "neutral"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];
export interface WorkspaceNote {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  color: NoteColor;
  pinned: boolean;
  order_index: number;
  created_at: string;
  updated_at: string;
}
export interface NoteDraft { title: string; content: string; color: NoteColor }
export type NoteCommand =
  | { type: "create"; id: string; draft: NoteDraft }
  | { type: "edit"; id: string; draft: NoteDraft }
  | { type: "pin"; id: string; pinned: boolean }
  | { type: "delete"; id: string }
  | { type: "move"; id: string; direction: -1 | 1 };

export function prepareNoteDraft(draft: NoteDraft) {
  if (!draft.content.trim()) throw new Error("empty_content");
  if (!NOTE_COLORS.includes(draft.color)) throw new Error("invalid_color");
  return { title: draft.title.trim() || null, content: draft.content.trim(), color: draft.color };
}

export function sortNotes(notes: readonly WorkspaceNote[]): WorkspaceNote[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order_index - b.order_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/** Single-row moves to either end of the pinned group need no multi-write transaction. */
export function moveNote(notes: readonly WorkspaceNote[], id: string, direction: -1 | 1): WorkspaceNote[] {
  const ordered = sortNotes(notes);
  const note = ordered.find((entry) => entry.id === id);
  if (!note) return ordered;
  const group = ordered.filter((entry) => entry.pinned === note.pinned);
  if ((direction === -1 ? group[0] : group.at(-1))?.id === id) return ordered;
  const indexes = group.map((entry) => entry.order_index);
  const order_index = direction === -1 ? Math.min(...indexes) - 1 : Math.max(...indexes) + 1;
  return sortNotes(ordered.map((entry) => entry.id === id ? { ...entry, order_index } : entry));
}

export function applyNoteCommand(notes: readonly WorkspaceNote[], command: NoteCommand, userId: string, now: string): WorkspaceNote[] {
  if (command.type === "create") {
    if (notes.some((note) => note.id === command.id)) return [...notes];
    return sortNotes([...notes, { ...prepareNoteDraft(command.draft), id: command.id, user_id: userId, pinned: false,
      order_index: Math.max(-1, ...notes.map((note) => note.order_index)) + 1, created_at: now, updated_at: now }]);
  }
  if (command.type === "delete") return notes.filter((note) => note.id !== command.id);
  if (command.type === "move") return moveNote(notes, command.id, command.direction);
  return sortNotes(notes.map((note) => note.id !== command.id ? note : {
    ...note, ...(command.type === "edit" ? prepareNoteDraft(command.draft) : { pinned: command.pinned }), updated_at: now,
  }));
}
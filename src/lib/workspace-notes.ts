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
  /** Free position on the board (px, board origin). NULL on both = automatic slot (older notes). */
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
  updated_at: string;
}
export interface NoteDraft { title: string; content: string; color: NoteColor }
export type NoteCommand =
  | { type: "create"; id: string; draft: NoteDraft }
  | { type: "edit"; id: string; draft: NoteDraft }
  | { type: "pin"; id: string; pinned: boolean }
  | { type: "delete"; id: string }
  | { type: "position"; id: string; x: number; y: number }
  | { type: "layer"; id: string; to: "front" | "back" };

/** Saved coordinates must stay within the database constraint (integers 0–20000). */
export const MAX_NOTE_POSITION = 20000;
export function notePosition(x: number, y: number) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("invalid_position");
  const clamp = (value: number) => Math.min(MAX_NOTE_POSITION, Math.max(0, Math.round(value)));
  return { pos_x: clamp(x), pos_y: clamp(y) };
}

export function prepareNoteDraft(draft: NoteDraft) {
  if (!draft.content.trim()) throw new Error("empty_content");
  if (!NOTE_COLORS.includes(draft.color)) throw new Error("invalid_color");
  // Existing SQL defines title NOT NULL DEFAULT ''; optional means empty text, not NULL.
  return { title: draft.title.trim(), content: draft.content.trim(), color: draft.color };
}

export function sortNotes(notes: readonly WorkspaceNote[]): WorkspaceNote[] {
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order_index - b.order_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/**
 * Stacking order on the board: higher order_index is drawn on top. "Front"/"back" move one row
 * past every other note (single-row write, no multi-write transaction); a note already alone at
 * that end is left unchanged.
 */
export function canLayer(notes: readonly WorkspaceNote[], id: string, to: "front" | "back"): boolean {
  const note = notes.find((entry) => entry.id === id);
  if (!note) return false;
  return notes.some((entry) => entry.id !== id && (to === "front" ? entry.order_index >= note.order_index : entry.order_index <= note.order_index));
}

export function layerNote(notes: readonly WorkspaceNote[], id: string, to: "front" | "back"): WorkspaceNote[] {
  if (!canLayer(notes, id, to)) return sortNotes(notes);
  const others = notes.filter((entry) => entry.id !== id).map((entry) => entry.order_index);
  const order_index = to === "front" ? Math.max(...others) + 1 : Math.min(...others) - 1;
  return sortNotes(notes.map((entry) => entry.id === id ? { ...entry, order_index } : entry));
}

export function applyNoteCommand(notes: readonly WorkspaceNote[], command: NoteCommand, userId: string, now: string): WorkspaceNote[] {
  if (command.type === "create") {
    if (notes.some((note) => note.id === command.id)) return [...notes];
    return sortNotes([...notes, { ...prepareNoteDraft(command.draft), id: command.id, user_id: userId, pinned: false,
      order_index: Math.max(-1, ...notes.map((note) => note.order_index)) + 1, pos_x: null, pos_y: null, created_at: now, updated_at: now }]);
  }
  if (command.type === "delete") return notes.filter((note) => note.id !== command.id);
  if (command.type === "layer") return layerNote(notes, command.id, command.to);
  return sortNotes(notes.map((note) => note.id !== command.id ? note : {
    ...note,
    ...(command.type === "edit" ? prepareNoteDraft(command.draft)
      : command.type === "position" ? notePosition(command.x, command.y)
      : { pinned: command.pinned }),
    updated_at: now,
  }));
}
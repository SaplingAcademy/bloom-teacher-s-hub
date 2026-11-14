import { MAX_NOTE_POSITION, type WorkspaceNote } from "./workspace-notes";

/** Board grid step (matches the 24px texture) and the fixed note width on the free board. */
export const BOARD_GRID_STEP = 24;
export const BOARD_NOTE_WIDTH = 288; // 12 grid cells
/** Height assumed for a note before it has been measured. */
export const DEFAULT_NOTE_HEIGHT = 168;
/** Empty space kept below the lowest note so there is room to drag downwards. */
export const BOARD_BOTTOM_ROOM = 120;

export interface BoardPoint { x: number; y: number }
export interface PlacedNote extends BoardPoint { auto: boolean }

const ceilToGrid = (value: number) => Math.ceil(value / BOARD_GRID_STEP) * BOARD_GRID_STEP;
const floorToGrid = (value: number) => Math.floor(value / BOARD_GRID_STEP) * BOARD_GRID_STEP;

/** Furthest top-left corner that keeps a note of this height fully inside the board. */
export function boardLimits(boardWidth: number, boardHeight: number, noteHeight: number): BoardPoint {
  return {
    x: Math.min(MAX_NOTE_POSITION, Math.max(0, boardWidth - BOARD_NOTE_WIDTH)),
    y: Math.min(MAX_NOTE_POSITION, Math.max(0, boardHeight - noteHeight)),
  };
}

/** Keeps a point inside the board (used live while dragging, no snapping). */
export function clampToBoard(point: BoardPoint, limits: BoardPoint): BoardPoint {
  return { x: Math.min(limits.x, Math.max(0, point.x)), y: Math.min(limits.y, Math.max(0, point.y)) };
}

/** Final drop position: snapped to the 24px grid, never past the board's edges. */
export function snapToBoard(point: BoardPoint, limits: BoardPoint): BoardPoint {
  const snap = (value: number, max: number) =>
    Math.min(floorToGrid(max), Math.max(0, Math.round(value / BOARD_GRID_STEP) * BOARD_GRID_STEP));
  return { x: snap(point.x, limits.x), y: snap(point.y, limits.y) };
}

export function boardColumns(boardWidth: number): number {
  return Math.max(1, Math.floor((boardWidth + BOARD_GRID_STEP) / (BOARD_NOTE_WIDTH + BOARD_GRID_STEP)));
}

/**
 * Order of the automatic slots: creation time, then id. Both are immutable, so locking a note
 * (pinned) or changing its layer (order_index) never moves any automatically placed note, in the
 * session or after a reload, and older notes need no saved coordinates.
 */
export function slotOrder(notes: readonly WorkspaceNote[]): WorkspaceNote[] {
  return [...notes].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

/**
 * Automatic slots for notes without saved coordinates: left-to-right rows in creation order, each
 * column stacked by the measured heights. Every note keeps a slot, so dragging one note never
 * shifts the others. Nothing is saved.
 */
export function automaticSlots(notes: readonly WorkspaceNote[], heights: Readonly<Record<string, number>>, boardWidth: number): Record<string, BoardPoint> {
  const columns = boardColumns(boardWidth);
  const bottoms = Array.from({ length: columns }, () => 0);
  const slots: Record<string, BoardPoint> = {};
  slotOrder(notes).forEach((note, index) => {
    const column = index % columns;
    const y = ceilToGrid(bottoms[column]);
    slots[note.id] = { x: column * (BOARD_NOTE_WIDTH + BOARD_GRID_STEP), y };
    bottoms[column] = y + (heights[note.id] ?? DEFAULT_NOTE_HEIGHT) + BOARD_GRID_STEP;
  });
  return slots;
}

/** Where each note is drawn: saved coordinates (kept inside the current width) or its automatic slot. */
export function placeNotes(notes: readonly WorkspaceNote[], heights: Readonly<Record<string, number>>, boardWidth: number): Record<string, PlacedNote> {
  const slots = automaticSlots(notes, heights, boardWidth);
  const maxX = Math.max(0, boardWidth - BOARD_NOTE_WIDTH);
  const placed: Record<string, PlacedNote> = {};
  for (const note of notes) {
    placed[note.id] = note.pos_x !== null && note.pos_y !== null
      ? { x: Math.min(note.pos_x, maxX), y: note.pos_y, auto: false }
      : { ...slots[note.id], auto: true };
  }
  return placed;
}

/** Board height: tall enough for the lowest note plus room to drag further down. */
export function boardHeightFor(placed: Readonly<Record<string, BoardPoint>>, heights: Readonly<Record<string, number>>, minHeight: number): number {
  const lowest = Math.max(0, ...Object.entries(placed).map(([id, point]) => point.y + (heights[id] ?? DEFAULT_NOTE_HEIGHT)));
  return Math.max(minHeight, ceilToGrid(lowest + BOARD_BOTTOM_ROOM));
}

/** Drawing order (back to front): order_index ascending, then creation for stable ties. */
export function stackingOrder(notes: readonly WorkspaceNote[]): WorkspaceNote[] {
  return [...notes].sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

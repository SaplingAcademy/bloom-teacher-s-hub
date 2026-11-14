import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { sortNotes, type NoteCommand, type WorkspaceNote } from "@/lib/workspace-notes";
import {
  BOARD_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT, boardHeightFor, boardLimits, clampToBoard, placeNotes, snapToBoard, stableSlotOrder, stackingOrder,
  type BoardPoint,
} from "@/lib/workspace-notes-layout";
import { cn } from "@/lib/utils";

/** Pointer travel (px) before a press becomes a drag; below it the press stays a normal click. */
export const DRAG_THRESHOLD = 4;
const MIN_BOARD_HEIGHT = 480;

interface Drag {
  id: string;
  pointerId: number;
  start: BoardPoint;
  origin: BoardPoint;
  current: BoardPoint;
  active: boolean;
  /** Dropped and waiting for the save; the note stays where it was dropped meanwhile. */
  settling: boolean;
}

interface NotesCanvasProps {
  notes: readonly WorkspaceNote[];
  pending: boolean;
  execute: (command: NoteCommand) => Promise<boolean>;
  label: string;
  renderNote: (note: WorkspaceNote) => ReactNode;
}

/**
 * Free-positioning board (≥768px). Drag is local state only: nothing is written while the pointer
 * moves; one position command (snapped to the grid, inside the board) is sent on release. Failed
 * saves are rolled back by the notes hook, so the note simply returns to its saved place.
 */
export function NotesCanvas({ notes, pending, execute, label, renderNote }: NotesCanvasProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardWidth, setBoardWidth] = useState(0);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const update = (next: Drag | null) => { dragRef.current = next; setDrag(next); };

  // Board width and note heights come from the rendered layout (heights depend on content).
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () => {
      setBoardWidth(board.clientWidth);
      const next: Record<string, number> = {};
      board.querySelectorAll<HTMLElement>("[data-board-note]").forEach((element) => {
        next[element.dataset.boardNote!] = element.offsetHeight || DEFAULT_NOTE_HEIGHT;
      });
      setHeights((previous) => {
        const keys = Object.keys(next);
        return keys.length === Object.keys(previous).length && keys.every((key) => previous[key] === next[key]) ? previous : next;
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    board.querySelectorAll("[data-board-note]").forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [notes]);

  const slotOrder = useRef<string[]>([]);
  const order = useMemo(() => (slotOrder.current = stableSlotOrder(slotOrder.current, notes)), [notes]);
  const placed = useMemo(() => placeNotes(notes, heights, boardWidth, order), [notes, heights, boardWidth, order]);
  const boardHeight = boardHeightFor(placed, heights, MIN_BOARD_HEIGHT);
  const layer = useMemo(() => new Map(stackingOrder(notes).map((note, index) => [note.id, index + 1])), [notes]);
  const limitsFor = (id: string) => boardLimits(boardWidth, boardHeight, heights[id] ?? DEFAULT_NOTE_HEIGHT);

  // Window-level listeners read the latest render through this ref (limits, execute).
  const live = useRef({ limitsFor, execute });
  live.current = { limitsFor, execute };
  const detach = useRef<(() => void) | null>(null);
  useEffect(() => () => detach.current?.(), []);

  const onPointerMove = (event: PointerEvent) => {
    const current = dragRef.current;
    if (!current || current.settling || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (!current.active && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    event.preventDefault();
    if (!current.active) {
      // No text selection across the page while a note is carried.
      document.body.style.userSelect = "none";
      window.getSelection?.()?.removeAllRanges();
    }
    update({ ...current, active: true, current: clampToBoard({ x: current.origin.x + dx, y: current.origin.y + dy }, live.current.limitsFor(current.id)) });
  };

  const finish = async (event: PointerEvent, cancelled: boolean) => {
    const current = dragRef.current;
    if (!current || current.settling || current.pointerId !== event.pointerId) return;
    detach.current?.();
    if (!current.active || cancelled) { update(null); return; }
    suppressClick.current = true;
    // A drop outside any element produces no click; do not swallow the next real click.
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const target = snapToBoard(current.current, live.current.limitsFor(current.id));
    // Dropped back where it started: nothing to save (older notes keep their automatic slot).
    if (target.x === current.origin.x && target.y === current.origin.y) { update(null); return; }
    update({ ...current, current: target, settling: true });
    await live.current.execute({ type: "position", id: current.id, x: target.x, y: target.y });
    update(null);
  };

  const onPointerDown = (note: WorkspaceNote, event: ReactPointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    // Mouse/pen only, primary button, never from the note's own controls, locked notes stay put.
    if (event.pointerType === "touch" || event.button !== 0 || note.pinned || pending || dragRef.current) return;
    if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
    const origin = placed[note.id];
    if (!origin) return;
    update({ id: note.id, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { x: origin.x, y: origin.y },
      current: { x: origin.x, y: origin.y }, active: false, settling: false });
    // Track the pointer anywhere on the page, so fast moves that leave the note still drag it.
    const up = (e: PointerEvent) => void finish(e, false);
    const cancel = (e: PointerEvent) => void finish(e, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    detach.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      document.body.style.userSelect = "";
      detach.current = null;
    };
  };

  return (
    <div ref={boardRef} role="region" aria-label={label} data-testid="notes-canvas" className="relative w-full" style={{ height: boardHeight }}>
      {sortNotes(notes).map((note) => {
        const isDragged = drag?.id === note.id && (drag.active || drag.settling);
        const point = isDragged ? drag!.current : placed[note.id];
        if (!point) return null;
        return (
          <div key={note.id} data-board-note={note.id} data-dragging={isDragged || undefined}
            className={cn("absolute left-0 top-0 select-none",
              note.pinned ? "cursor-default" : "cursor-grab active:cursor-grabbing",
              drag?.active && drag.id === note.id && "[&_article]:shadow-lg")}
            style={{ width: BOARD_NOTE_WIDTH, transform: `translate3d(${point.x}px, ${point.y}px, 0)`, zIndex: isDragged ? notes.length + 1 : layer.get(note.id) }}
            onPointerDown={(event) => onPointerDown(note, event)}
            onClickCapture={(event) => {
              // A drag release must not also open the editor.
              if (suppressClick.current) { suppressClick.current = false; event.preventDefault(); event.stopPropagation(); }
            }}>
            {renderNote(note)}
          </div>
        );
      })}
    </div>
  );
}

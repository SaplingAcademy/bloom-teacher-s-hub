import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface WeekDropPosition {
  date: string;
  startTime: string;
}

/** Translate the existing hour cell into a quarter-hour target; no booking rules. */
export function weekDropPosition(date: string, hour: string, y: number, top: number, height: number): WeekDropPosition {
  const fraction = Math.max(0, Math.min(1, (y - top) / Math.max(1, height)));
  const minutes = Math.min(45, Math.round(fraction * 4) * 15);
  return { date, startTime: `${hour.slice(0, 2)}:${String(minutes).padStart(2, "0")}` };
}

export function useWeekLessonDrag(onDrop: (eventId: string, position: WeekDropPosition) => void | Promise<void>) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [target, setTarget] = useState<(WeekDropPosition & { hour: string }) | null>(null);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;
  const gesture = useRef<{
    id: string; pointerId: number; x: number; y: number; moved: boolean;
    element: HTMLElement; target: WeekDropPosition | null;
  } | null>(null);
  const suppressedClick = useRef<string | null>(null);

  useEffect(() => {
    const reset = () => {
      const active = gesture.current;
      if (active?.element.hasPointerCapture(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
      gesture.current = null;
      setDraggedId(null);
      setTarget(null);
    };
    const move = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      if (!active.moved && Math.hypot(event.clientX - active.x, event.clientY - active.y) < 6) return;
      active.moved = true;
      suppressedClick.current = active.id;
      setDraggedId(active.id);
      event.preventDefault();
      const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-calendar-drop-cell]");
      if (!cell?.dataset.date || !cell.dataset.hour) {
        active.target = null;
        setTarget(null);
        return;
      }
      const rect = cell.getBoundingClientRect();
      const position = weekDropPosition(cell.dataset.date, cell.dataset.hour, event.clientY, rect.top, rect.height);
      active.target = position;
      setTarget({ ...position, hour: cell.dataset.hour });
    };
    const finish = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      const position = active.moved ? active.target : null;
      const id = active.id;
      reset();
      if (position) void dropRef.current(id, position);
    };
    const cancel = () => reset();
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") reset(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("blur", cancel);
    };
  }, []);

  const start = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    suppressedClick.current = null;
    gesture.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false, element: event.currentTarget, target: null };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const consumeClick = (id: string) => {
    if (suppressedClick.current !== id) return false;
    suppressedClick.current = null;
    return true;
  };
  return { draggedId, target, start, consumeClick };
}
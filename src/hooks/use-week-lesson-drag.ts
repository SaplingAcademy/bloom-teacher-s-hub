import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { CALENDAR_CELL_PAD_PX, minuteOffsetPx, snapMinutesInCell } from "@/lib/calendar-grid";

export interface WeekDropPosition {
  date: string;
  startTime: string;
}

export type WeekDropTarget = WeekDropPosition & { hour: string };
export type WeekDragPhase = "dragging" | "pending" | "returning" | "settling";

export interface WeekLessonDragPreview {
  id: string;
  phase: WeekDragPhase;
  source: HTMLElement;
  origin: { left: number; top: number; width: number; height: number };
  reducedMotion: boolean;
}

interface WeekDragGesture {
  id: string;
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  latestX: number;
  latestY: number;
  ready: boolean;
  moved: boolean;
  element: HTMLElement;
  target: WeekDropTarget | null;
  origin: WeekLessonDragPreview["origin"];
  grabX: number;
  grabY: number;
  reducedMotion: boolean;
  holdTimer?: ReturnType<typeof setTimeout>;
}

export const WEEK_DRAG_TRANSITION_MS = 180;
export const WEEK_DRAG_TOUCH_HOLD_MS = 450;

/**
 * Translate the dragged card's top edge inside an hour cell into a quarter-hour target (:00, :15,
 * :30, :45); no booking rules. `cardTop` and `cellTop` are viewport coordinates.
 */
export function weekDropPosition(date: string, hour: string, cardTop: number, cellTop: number): WeekDropPosition {
  const minutes = snapMinutesInCell(cardTop - cellTop - CALENDAR_CELL_PAD_PX);
  return { date, startTime: `${hour.slice(0, 2)}:${String(minutes).padStart(2, "0")}` };
}

/** Where the dragged card is drawn for a target: magnetically aligned to its quarter inside the cell. */
export function weekSnappedCardPoint(cell: { left: number; top: number }, startTime: string): { x: number; y: number } {
  return {
    x: cell.left + CALENDAR_CELL_PAD_PX,
    y: cell.top + CALENDAR_CELL_PAD_PX + minuteOffsetPx(Number(startTime.slice(3, 5))),
  };
}

function sameTarget(a: WeekDropTarget | null, b: WeekDropTarget | null) {
  return a?.date === b?.date && a?.hour === b?.hour && a?.startTime === b?.startTime;
}

/**
 * Presentation-only Pointer Events gesture. The callback remains the sole owner
 * of confirmation and persistence; false/null means cancel/failure, true/void success.
 */
export function useWeekLessonDrag(onDrop: (eventId: string, position: WeekDropPosition) => void | boolean | Promise<void | boolean>) {
  const [previewState, setPreviewState] = useState<WeekLessonDragPreview | null>(null);
  const [target, setTarget] = useState<WeekDropTarget | null>(null);
  const targetRef = useRef<WeekDropTarget | null>(null);
  const preview = useRef<WeekLessonDragPreview | null>(null);
  const overlay = useRef<HTMLElement | null>(null);
  const position = useRef({ x: 0, y: 0 });
  const frame = useRef<number | null>(null);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const dropRef = useRef(onDrop);
  dropRef.current = onDrop;

  const gesture = useRef<WeekDragGesture | null>(null);
  const suppressedClick = useRef<string | null>(null);

  const setPreview = useCallback((next: WeekLessonDragPreview | null) => {
    preview.current = next;
    if (mounted.current) setPreviewState(next);
  }, []);

  const paint = useCallback((x: number, y: number, animate = false) => {
    position.current = { x, y };
    const element = overlay.current;
    if (!element) return;
    const reduced = preview.current?.reducedMotion ?? true;
    element.style.transition = animate && !reduced
      ? `transform ${WEEK_DRAG_TRANSITION_MS}ms cubic-bezier(0.2, 0, 0, 1)`
      : "none";
    element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  const previewRef = useCallback((element: HTMLElement | null) => {
    overlay.current = element;
    if (element) paint(position.current.x, position.current.y);
  }, [paint]);

  const releaseGesture = useCallback(() => {
    const active = gesture.current;
    if (!active) return;
    if (active.holdTimer) clearTimeout(active.holdTimer);
    try {
      if (active.element.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    } catch {
      // The browser may already have released capture after pointercancel.
    }
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  const clearPreview = useCallback(() => {
    targetRef.current = null;
    setPreview(null);
    setTarget(null);
  }, [setPreview]);

  const settle = useCallback((successful: boolean) => {
    const current = preview.current;
    if (!current || !mounted.current) return;
    const activeTarget = targetRef.current;
    let nextPhase: WeekDragPhase = "returning";
    if (successful && activeTarget) {
      const cell = Array.from(document.querySelectorAll<HTMLElement>("[data-calendar-drop-cell]"))
        .find((candidate) => candidate.dataset.date === activeTarget.date && candidate.dataset.hour === activeTarget.hour);
      const canonical = Array.from(document.querySelectorAll<HTMLElement>("[data-calendar-event-id]"))
        .find((candidate) => candidate.dataset.calendarEventId === current.id && candidate.closest<HTMLElement>("[data-calendar-drop-cell]") === cell);
      const destination = canonical?.getBoundingClientRect() ?? cell?.getBoundingClientRect();
      if (destination) {
        nextPhase = "settling";
        paint(destination.left + (canonical ? 0 : 4), destination.top + (canonical ? 0 : 4), true);
      } else {
        paint(current.origin.left, current.origin.top, true);
      }
    } else {
      paint(current.origin.left, current.origin.top, true);
    }
    setPreview({ ...current, phase: nextPhase });
    if (finishTimer.current) clearTimeout(finishTimer.current);
    finishTimer.current = setTimeout(clearPreview, current.reducedMotion ? 0 : WEEK_DRAG_TRANSITION_MS);
  }, [clearPreview, paint, setPreview]);

  /**
   * Resolves the target from the card's top edge (pointer minus grab offset), so the card keeps its
   * place under the pointer. Returns where the card snaps to, or null when there is no target.
   */
  const updateTarget = useCallback((active: WeekDragGesture, clientX: number, clientY: number): { x: number; y: number } | null => {
    const cardTop = clientY - active.grabY;
    const hit = (y: number) => document.elementFromPoint(clientX, y)?.closest<HTMLElement>("[data-calendar-drop-cell]") ?? null;
    const cell = hit(cardTop + 1) ?? hit(clientY);
    if (!cell?.dataset.date || !cell.dataset.hour) {
      active.target = null;
      targetRef.current = null;
      setTarget(null);
      return null;
    }
    const rect = cell.getBoundingClientRect();
    // Lane cells (week view) snap the card itself; other cells keep the free-following card.
    const snaps = cell.dataset.calendarSnap !== undefined;
    const position = weekDropPosition(cell.dataset.date, cell.dataset.hour, snaps ? cardTop : clientY - active.grabY, rect.top);
    const next = { ...position, hour: cell.dataset.hour };
    active.target = next;
    targetRef.current = next;
    setTarget((current) => sameTarget(current, next) ? current : next);
    return snaps ? weekSnappedCardPoint(rect, next.startTime) : null;
  }, []);

  /** Draws the card at its magnetic position when it has one, otherwise where the pointer carries it. */
  const paintCard = useCallback((active: WeekDragGesture, clientX: number, clientY: number) => {
    const snapped = updateTarget(active, clientX, clientY);
    if (snapped) paint(snapped.x, snapped.y);
    else paint(clientX - active.grabX, clientY - active.grabY);
  }, [paint, updateTarget]);

  const beginPreview = useCallback((active: WeekDragGesture, clientX: number, clientY: number) => {
    active.moved = true;
    suppressedClick.current = active.id;
    const x = clientX - active.grabX;
    const y = clientY - active.grabY;
    position.current = { x, y };
    setPreview({
      id: active.id,
      phase: "dragging",
      source: active.element,
      origin: active.origin,
      reducedMotion: active.reducedMotion,
    });
    paint(x, y);
    paintCard(active, clientX, clientY);
  }, [paint, paintCard, setPreview]);

  const scrollAtEdge = useCallback((active: WeekDragGesture) => {
    const area = active.element.closest<HTMLElement>("[data-calendar-scroll-area]");
    if (!area || area.scrollHeight <= area.clientHeight) return false;
    const rect = area.getBoundingClientRect();
    if (active.latestX < rect.left || active.latestX > rect.right || active.latestY < rect.top || active.latestY > rect.bottom) return false;
    const edge = Math.min(40, rect.height / 4);
    const delta = active.latestY > rect.bottom - edge ? 10 : active.latestY < rect.top + edge ? -10 : 0;
    const before = area.scrollTop;
    area.scrollTop = Math.max(0, Math.min(area.scrollHeight - area.clientHeight, before + delta));
    if (area.scrollTop === before) return false;
    paintCard(active, active.latestX, active.latestY);
    return true;
  }, [paintCard]);

  useEffect(() => {
    mounted.current = true;
    const move = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      active.latestX = event.clientX;
      active.latestY = event.clientY;
      const distance = Math.hypot(event.clientX - active.x, event.clientY - active.y);
      if (!active.ready) {
        // Before the touch hold completes, movement belongs to normal scrolling.
        if (distance > 8) releaseGesture();
        return;
      }
      if (!active.moved) {
        if (distance < 6) return;
        beginPreview(active, event.clientX, event.clientY);
      }
      event.preventDefault();
      updateTarget(active, event.clientX, event.clientY);
      if (frame.current === null) {
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          const tick = () => {
            frame.current = null;
            if (gesture.current !== active) return;
            paintCard(active, active.latestX, active.latestY);
            if (scrollAtEdge(active)) frame.current = requestAnimationFrame(tick);
          };
          tick();
        });
      }
    };

    const finish = (event: PointerEvent) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      if (!active.moved) {
        releaseGesture();
        return;
      }
      event.preventDefault();
      const id = active.id;
      const nextTarget = active.target;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      // The card stays exactly where it was last shown (its snapped slot) while the save runs.
      paintCard(active, active.latestX, active.latestY);
      releaseGesture();
      const current = preview.current;
      if (current) setPreview({ ...current, phase: "pending" });
      if (!nextTarget) {
        settle(false);
        return;
      }
      void Promise.resolve(dropRef.current(id, nextTarget))
        .then((result) => settle(result !== false))
        .catch(() => settle(false));
    };

    const cancel = () => {
      const active = gesture.current;
      if (!active) return;
      const moved = active.moved;
      releaseGesture();
      if (moved) settle(false);
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("blur", cancel);
    return () => {
      mounted.current = false;
      releaseGesture();
      if (finishTimer.current) clearTimeout(finishTimer.current);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("blur", cancel);
    };
  }, [beginPreview, paintCard, releaseGesture, scrollAtEdge, setPreview, settle, updateTarget]);

  const start = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current || preview.current) return;
    suppressedClick.current = null;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const pointerType = event.pointerType || "mouse";
    const active: WeekDragGesture = {
      id,
      pointerId: event.pointerId,
      pointerType,
      x: event.clientX,
      y: event.clientY,
      latestX: event.clientX,
      latestY: event.clientY,
      ready: pointerType !== "touch",
      moved: false,
      element,
      target: null,
      origin: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      grabX: event.clientX - rect.left,
      grabY: event.clientY - rect.top,
      reducedMotion: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    };
    gesture.current = active;
    if (active.ready) {
      try { element.setPointerCapture?.(event.pointerId); } catch { /* Capture is an enhancement. */ }
    } else {
      active.holdTimer = setTimeout(() => {
        if (gesture.current !== active) return;
        active.ready = true;
        active.holdTimer = undefined;
        try { element.setPointerCapture?.(active.pointerId); } catch { /* Capture is an enhancement. */ }
        beginPreview(active, active.latestX, active.latestY);
      }, WEEK_DRAG_TOUCH_HOLD_MS);
    }
  };

  const consumeClick = (id: string) => {
    if (suppressedClick.current !== id) return false;
    suppressedClick.current = null;
    return true;
  };

  return {
    draggedId: previewState?.id ?? null,
    preview: previewState,
    target,
    start,
    consumeClick,
    previewRef,
  };
}

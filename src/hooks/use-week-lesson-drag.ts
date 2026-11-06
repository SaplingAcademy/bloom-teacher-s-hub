import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

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

/** Translate the existing hour cell into a quarter-hour target; no booking rules. */
export function weekDropPosition(date: string, hour: string, y: number, top: number, height: number): WeekDropPosition {
  const fraction = Math.max(0, Math.min(1, (y - top) / Math.max(1, height)));
  const minutes = Math.min(45, Math.round(fraction * 4) * 15);
  return { date, startTime: `${hour.slice(0, 2)}:${String(minutes).padStart(2, "0")}` };
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

  const updateTarget = useCallback((active: NonNullable<typeof gesture.current>, clientX: number, clientY: number) => {
    const cell = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-calendar-drop-cell]");
    if (!cell?.dataset.date || !cell.dataset.hour) {
      active.target = null;
      targetRef.current = null;
      setTarget(null);
      return;
    }
    const rect = cell.getBoundingClientRect();
    const position = weekDropPosition(cell.dataset.date, cell.dataset.hour, clientY, rect.top, rect.height);
    const next = { ...position, hour: cell.dataset.hour };
    active.target = next;
    targetRef.current = next;
    setTarget((current) => sameTarget(current, next) ? current : next);
  }, []);

  const beginPreview = useCallback((active: NonNullable<typeof gesture.current>, clientX: number, clientY: number) => {
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
    updateTarget(active, clientX, clientY);
  }, [paint, setPreview, updateTarget]);

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
          paint(active.latestX - active.grabX, active.latestY - active.grabY);
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
      paint(active.latestX - active.grabX, active.latestY - active.grabY);
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
  }, [beginPreview, paint, releaseGesture, setPreview, settle, updateTarget]);

  const start = (event: ReactPointerEvent<HTMLElement>, id: string) => {
    if (event.button !== 0 || !event.isPrimary || gesture.current || preview.current) return;
    suppressedClick.current = null;
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const pointerType = event.pointerType || "mouse";
    const active: NonNullable<typeof gesture.current> = {
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

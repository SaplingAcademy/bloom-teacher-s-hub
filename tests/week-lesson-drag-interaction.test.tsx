// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWeekLessonDrag, WEEK_DRAG_TOUCH_HOLD_MS, WEEK_DRAG_TRANSITION_MS, type WeekDropPosition } from "../src/hooks/use-week-lesson-drag";
import { WeekLessonDragPreview } from "../src/components/bloom/WeekLessonDragPreview";

let root: Root;
let container: HTMLDivElement;
let cell: HTMLDivElement;
let rafCallbacks: Map<number, FrameRequestCallback>;
let rafId: number;

function Harness({ onDrop }: { onDrop: (id: string, position: WeekDropPosition) => Promise<boolean> }) {
  const drag = useWeekLessonDrag(onDrop);
  return createElement(
    "div",
    null,
    createElement("div", {
      id: "lesson",
      "data-calendar-event": "",
      "data-calendar-event-id": "lesson-1",
      className: "bg-primary-soft opacity-100",
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => drag.start(event, "lesson-1"),
    }, "Julia · English"),
    createElement("div", { id: "target", "data-calendar-drop-cell": "", "data-date": "2026-11-06", "data-hour": "16:00" }),
    createElement("output", { id: "phase" }, drag.preview?.phase || "idle"),
    createElement(WeekLessonDragPreview, {
      preview: drag.preview,
      target: drag.target,
      duration: 60,
      previewRef: drag.previewRef,
      destinationLabel: "New time",
      pendingLabel: "Saving new time...",
      savedLabel: "Time updated",
    }),
  );
}

function pointer(target: EventTarget, type: string, init: { pointerId?: number; pointerType?: string; clientX?: number; clientY?: number } = {}) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    isPrimary: true,
    pointerId: 1,
    pointerType: "mouse",
    clientX: 110,
    clientY: 120,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function flushRaf() {
  const pending = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  pending.forEach((callback) => callback(0));
}

async function startMouseDrag() {
  const source = container.querySelector<HTMLElement>("#lesson")!;
  await act(async () => { pointer(source, "pointerdown"); });
  await act(async () => { pointer(window, "pointermove", { clientX: 310, clientY: 132 }); });
  await act(async () => { flushRaf(); });
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  rafCallbacks = new Map();
  rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafCallbacks.set(++rafId, callback);
    return rafId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => rafCallbacks.delete(id));
  Object.assign(window, {
    matchMedia: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
  Object.assign(HTMLElement.prototype, {
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    hasPointerCapture: vi.fn().mockReturnValue(false),
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.querySelectorAll("[data-calendar-drag-preview]").forEach((element) => element.remove());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("week drag presentation lifecycle", () => {
  it("clones the original lesson, follows the pointer and returns after a cancelled save", async () => {
    let rejectDrop!: (success: boolean) => void;
    const onDrop = vi.fn(() => new Promise<boolean>((resolve) => { rejectDrop = resolve; }));
    await act(async () => { root.render(createElement(Harness, { onDrop })); });
    const source = container.querySelector<HTMLElement>("#lesson")!;
    cell = container.querySelector<HTMLDivElement>("#target")!;
    source.getBoundingClientRect = () => ({ left: 100, top: 100, width: 160, height: 80, right: 260, bottom: 180, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
    cell.getBoundingClientRect = () => ({ left: 300, top: 100, width: 180, height: 64, right: 480, bottom: 164, x: 300, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.elementFromPoint = vi.fn(() => cell);

    await startMouseDrag();
    const preview = document.querySelector<HTMLElement>("[data-calendar-drag-preview]")!;
    expect(preview.textContent).toContain("Julia · English");
    expect(preview.textContent).toContain("16:30");
    expect(preview.textContent).toContain("60 min");
    expect(preview.style.transform).toBe("translate3d(300px, 112px, 0)");

    await act(async () => { pointer(window, "pointerup", { clientX: 310, clientY: 132 }); });
    expect(onDrop).toHaveBeenCalledWith("lesson-1", expect.objectContaining({ date: "2026-11-06", startTime: "16:30" }));
    expect(preview.dataset.dragPhase).toBe("pending");
    expect(preview.textContent).toContain("Saving new time...");

    await act(async () => { rejectDrop(false); });
    expect(preview.dataset.dragPhase).toBe("returning");
    expect(preview.style.transform).toBe("translate3d(100px, 100px, 0)");
    expect(preview.style.transition).toContain(`${WEEK_DRAG_TRANSITION_MS}ms`);
    await act(async () => { vi.advanceTimersByTime(WEEK_DRAG_TRANSITION_MS); });
    expect(document.querySelector("[data-calendar-drag-preview]")).toBeNull();
  });

  it("settles into the destination after a successful save without issuing another drop", async () => {
    const onDrop = vi.fn().mockResolvedValue(true);
    await act(async () => { root.render(createElement(Harness, { onDrop })); });
    const source = container.querySelector<HTMLElement>("#lesson")!;
    cell = container.querySelector<HTMLDivElement>("#target")!;
    source.getBoundingClientRect = () => ({ left: 100, top: 100, width: 160, height: 80, right: 260, bottom: 180, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
    cell.getBoundingClientRect = () => ({ left: 300, top: 100, width: 180, height: 64, right: 480, bottom: 164, x: 300, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.elementFromPoint = vi.fn(() => cell);

    await startMouseDrag();
    await act(async () => { pointer(window, "pointerup", { clientX: 310, clientY: 132 }); });
    const preview = document.querySelector<HTMLElement>("[data-calendar-drag-preview]")!;
    expect(preview.dataset.dragPhase).toBe("settling");
    expect(preview.style.transform).toBe("translate3d(304px, 104px, 0)");
    expect(preview.textContent).toContain("Time updated");
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("cancels a short touch movement for scrolling and starts only after a long press", async () => {
    const onDrop = vi.fn().mockResolvedValue(false);
    await act(async () => { root.render(createElement(Harness, { onDrop })); });
    const source = container.querySelector<HTMLElement>("#lesson")!;
    cell = container.querySelector<HTMLDivElement>("#target")!;
    source.getBoundingClientRect = () => ({ left: 100, top: 100, width: 160, height: 80, right: 260, bottom: 180, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
    cell.getBoundingClientRect = () => ({ left: 300, top: 100, width: 180, height: 64, right: 480, bottom: 164, x: 300, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.elementFromPoint = vi.fn(() => cell);

    await act(async () => { pointer(source, "pointerdown", { pointerType: "touch" }); });
    const scrollMove = await act(async () => pointer(window, "pointermove", { pointerType: "touch", clientX: 110, clientY: 145 }));
    expect(scrollMove.defaultPrevented).toBe(false);
    await act(async () => { vi.advanceTimersByTime(WEEK_DRAG_TOUCH_HOLD_MS); });
    expect(document.querySelector("[data-calendar-drag-preview]")).toBeNull();

    await act(async () => { pointer(source, "pointerdown", { pointerType: "touch" }); });
    await act(async () => { vi.advanceTimersByTime(WEEK_DRAG_TOUCH_HOLD_MS); });
    expect(document.querySelector("[data-calendar-drag-preview]")).not.toBeNull();
    await act(async () => { pointer(window, "pointermove", { pointerType: "touch", clientX: 310, clientY: 132 }); });
    await act(async () => { pointer(window, "pointerup", { pointerType: "touch", clientX: 310, clientY: 132 }); });
    expect(onDrop).toHaveBeenCalledTimes(1);
  });

  it("uses no transition animation when reduced motion is requested", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onDrop = vi.fn().mockResolvedValue(true);
    await act(async () => { root.render(createElement(Harness, { onDrop })); });
    const source = container.querySelector<HTMLElement>("#lesson")!;
    cell = container.querySelector<HTMLDivElement>("#target")!;
    source.getBoundingClientRect = () => ({ left: 100, top: 100, width: 160, height: 80, right: 260, bottom: 180, x: 100, y: 100, toJSON: () => ({}) }) as DOMRect;
    cell.getBoundingClientRect = () => ({ left: 300, top: 100, width: 180, height: 64, right: 480, bottom: 164, x: 300, y: 100, toJSON: () => ({}) }) as DOMRect;
    document.elementFromPoint = vi.fn(() => cell);

    await startMouseDrag();
    await act(async () => { pointer(window, "pointerup", { clientX: 310, clientY: 132 }); });
    const preview = document.querySelector<HTMLElement>("[data-calendar-drag-preview]")!;
    expect(preview.style.transition).toBe("none");
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(document.querySelector("[data-calendar-drag-preview]")).toBeNull();
  });
});

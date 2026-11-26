// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWeekLessonDrag, weekSnappedCardPoint, type WeekDropPosition } from "../src/hooks/use-week-lesson-drag";
import { WeekLessonDragPreview } from "../src/components/bloom/WeekLessonDragPreview";
import { CALENDAR_CELL_PAD_PX, minuteOffsetPx } from "../src/lib/calendar-grid";

let root: Root;
let container: HTMLDivElement;
let raf: Map<number, FrameRequestCallback>;
let rafId = 0;

function Harness({ onDrop }: { onDrop: (id: string, position: WeekDropPosition) => Promise<boolean> }) {
  const drag = useWeekLessonDrag(onDrop);
  const cell = (id: string, date: string) => createElement("div", { id, "data-calendar-drop-cell": "", "data-calendar-snap": "", "data-date": date, "data-hour": "16:00" });
  return createElement("div", { "data-calendar-scroll-area": "" },
    // A 10:30 lesson: the grid draws it at its minute inside the cell (margin-top), like the week view.
    createElement("div", { id: "lesson", "data-calendar-event": "", "data-calendar-event-id": "l1", className: "rounded-xl", style: { marginTop: minuteOffsetPx(30) },
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => drag.start(event, "l1") },
      createElement("span", { "data-calendar-event-time": "" }, "10:30–11:20")),
    cell("thu", "2026-11-19"), cell("fri", "2026-11-20"),
    createElement(WeekLessonDragPreview, { preview: drag.preview, target: drag.target, duration: 50, previewRef: drag.previewRef,
      destinationLabel: "New time", pendingLabel: "Saving", savedLabel: "Saved" }));
}
const pointer = (target: EventTarget, type: string, clientX: number, clientY: number) =>
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerId: 1, pointerType: "mouse", clientX, clientY }));
const flush = () => { const pending = [...raf.values()]; raf.clear(); pending.forEach((cb) => cb(0)); };
const rect = (left: number, top: number, width = 180, height = 54) =>
  () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  raf = new Map();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { raf.set(++rafId, cb); return rafId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => raf.delete(id));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

async function setup(onDrop = vi.fn().mockResolvedValue(false)) {
  await act(async () => { root.render(createElement(Harness, { onDrop })); });
  const source = container.querySelector<HTMLElement>("#lesson")!;
  const thu = container.querySelector<HTMLElement>("#thu")!;
  const fri = container.querySelector<HTMLElement>("#fri")!;
  source.getBoundingClientRect = rect(100, 100, 160, 80);
  thu.getBoundingClientRect = rect(300, 400);
  fri.getBoundingClientRect = rect(500, 400);
  // Columns by x; the card's top edge decides the row.
  document.elementFromPoint = vi.fn((x: number) => (x >= 500 ? fri : thu));
  await act(async () => { pointer(source, "pointerdown", 110, 120); }); // grabbed 20px below the card top
  return { onDrop, preview: () => document.querySelector<HTMLElement>("[data-calendar-drag-preview]")! };
}
const move = async (x: number, y: number) => { await act(async () => { pointer(window, "pointermove", x, y); }); await act(async () => { flush(); }); };

describe("magnetic quarter-hour drag (the card itself snaps)", () => {
  it("the card jumps between :00/:15/:30/:45 and stays put between two quarters", async () => {
    const { preview } = await setup();
    // No vertical padding: the card's top is measured from the hour line on the 54px scale.
    await move(310, 420); // card top 400 → :00, drawn on the hour line
    expect(preview().style.transform).toBe(`translate3d(304px, 400px, 0)`);
    await move(310, 424); // a few px further: still :00 (magnet holds)
    expect(preview().style.transform).toBe(`translate3d(304px, 400px, 0)`);
    await move(310, 432); // past half a quarter → snaps to :15
    expect(preview().style.transform).toBe(`translate3d(304px, ${400 + minuteOffsetPx(15)}px, 0)`);
    await move(310, 456); // card top 436 → 36px into the cell → :45 (75% of the row)
    expect(preview().style.transform).toBe(`translate3d(304px, ${400 + minuteOffsetPx(45)}px, 0)`);
  });
  it("the time inside the card follows the snapped position and keeps the duration", async () => {
    const { preview } = await setup();
    await move(310, 432);
    expect(preview().textContent).toContain("16:15–17:05");
    await move(310, 445);
    expect(preview().textContent).toContain("16:30–17:20");
    expect(preview().querySelector<HTMLElement>("[data-calendar-event-time]")!.parentElement!.style.marginTop).toBe("0px"); // no doubled offset
  });
  it("moves across days: the card snaps into the other column", async () => {
    const { preview } = await setup();
    await move(510, 445);
    expect(preview().style.transform).toBe(`translate3d(504px, ${400 + minuteOffsetPx(30)}px, 0)`); // exactly halfway
  });
  it("drops exactly at the shown day and time, and the saved card is drawn at that same spot", async () => {
    const { onDrop, preview } = await setup(vi.fn(() => new Promise<boolean>(() => {}))); // save still running
    await move(510, 445);
    const shown = preview().style.transform;
    await act(async () => { pointer(window, "pointerup", 510, 445); });
    expect(onDrop).toHaveBeenCalledWith("l1", expect.objectContaining({ date: "2026-11-20", startTime: "16:30" }));
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(preview().style.transform).toBe(shown); // no jump while saving
    // The grid draws a saved 16:30 card at cell top + the same minute offset (horizontal inset only).
    expect(weekSnappedCardPoint({ left: 500, top: 400 }, "16:30")).toEqual({ x: 500 + CALENDAR_CELL_PAD_PX, y: 400 + minuteOffsetPx(30) });
  });
});

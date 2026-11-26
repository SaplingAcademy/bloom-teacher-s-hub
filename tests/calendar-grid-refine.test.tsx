// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_HOUR_ROW_PX, currentTimeMarker, minuteFraction } from "../src/lib/calendar-grid";
import { weekDropPosition } from "../src/hooks/use-week-lesson-drag";
import { weekLessonPreviewTimeRange } from "../src/components/bloom/WeekLessonDragPreview";
import { CalendarNowLine } from "../src/components/bloom/CalendarNowLine";
import { useCurrentMinute } from "../src/hooks/use-current-minute";

const ROW = CALENDAR_HOUR_ROW_PX;

describe("compact grid", () => {
  it("rows are ~15% shorter than before (64px → 54px)", () => {
    expect(ROW).toBe(54);
    expect(ROW / 64).toBeCloseTo(0.85, 1);
  });
});

describe("15-minute snapping on the compact rows", () => {
  const cardAt = (top: number, minutes: number) => top + (minutes / 60) * ROW; // no vertical padding
  it("snaps the card's top to :00, :15, :30 and :45 (nearest quarter)", () => {
    const top = 300;
    const at = (minutes: number) => weekDropPosition("2026-11-18", "10:00", cardAt(top, minutes), top).startTime;
    expect([0, 15, 30, 45].map(at)).toEqual(["10:00", "10:15", "10:30", "10:45"]);
    expect(at(6)).toBe("10:00");
    expect(at(8)).toBe("10:15");
    expect(at(37)).toBe("10:30");
    expect(at(59)).toBe("10:45"); // stays in this hour row (existing rule)
  });
  it("works after scrolling: only the cell's on-screen position matters", () => {
    for (const top of [-860, 0, 412]) {
      expect(weekDropPosition("2026-11-18", "14:00", cardAt(top, 30), top).startTime).toBe("14:30");
    }
  });
  it("keeps the original duration in the destination shown while dragging", () => {
    expect(weekLessonPreviewTimeRange("10:15", 50)).toBe("10:15–11:05");
    expect(weekLessonPreviewTimeRange("16:45", 90)).toBe("16:45–18:15");
  });
});

describe("current-time indicator", () => {
  it("marks today's date, the hour row and the minute offset", () => {
    expect(currentTimeMarker(new Date(2026, 10, 18, 14, 30))).toEqual({ date: "2026-11-18", hour: "14:00", fraction: 0.5 });
    expect(currentTimeMarker(new Date(2026, 10, 18, 9, 0)).fraction).toBe(0);
    expect(minuteFraction(45)).toBe(0.75);
  });
  it("is a thin green line with a dot, positioned by percentage, never catching the pointer", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root.render(createElement(CalendarNowLine, { fraction: 0.25, className: "left-1 right-0" })));
    const line = document.querySelector<HTMLElement>("[data-calendar-now]")!;
    expect(line.style.top).toBe("25%");
    expect(line.className).toContain("pointer-events-none");
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.querySelector("[data-calendar-now-dot]")!.className).toContain("rounded-full");
    expect(line.innerHTML).toContain("bg-primary");
    await act(async () => root.unmount());
  });
});

describe("indicator refresh", () => {
  afterEach(() => vi.useRealTimers());
  it("moves with time, without reloading", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 18, 14, 0, 30));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let seen: Date | null = null;
    function Probe() { seen = useCurrentMinute(); return null; }
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(createElement(Probe)));
    expect(currentTimeMarker(seen!).fraction).toBe(0);
    await act(async () => { vi.advanceTimersByTime(30_000); }); // reaches 14:01
    expect(seen!.getMinutes()).toBe(1);
    await act(async () => { vi.advanceTimersByTime(60_000 * 29); }); // 14:30
    expect(currentTimeMarker(seen!).fraction).toBe(0.5);
    await act(async () => root.unmount());
  });
});

describe("week cards on the fixed hour scale", () => {
  it("17:00, 17:30 and 17:45 start on the hour line, halfway and at 75% of the row", async () => {
    const { layoutWeekDayCards } = await import("../src/lib/calendar-grid");
    const layout = layoutWeekDayCards([
      { id: "a", startTime: "17:00", durationMinutes: 15 },
      { id: "b", startTime: "17:30", durationMinutes: 10 },
      { id: "c", startTime: "17:45", durationMinutes: 10 },
    ]);
    expect(layout.get("a")!.top).toBe(0);
    expect(layout.get("b")!.top).toBe(ROW / 2);
    expect(layout.get("c")!.top).toBe(ROW * 0.75);
  });
  it("card height follows the duration on the same scale, never taller than the compact card", async () => {
    const { weekCardHeightPx, CALENDAR_CARD_MAX_PX, CALENDAR_CARD_MIN_PX } = await import("../src/lib/calendar-grid");
    expect(weekCardHeightPx(30)).toBe(ROW / 2);
    expect(weekCardHeightPx(60)).toBe(CALENDAR_CARD_MAX_PX);
    expect(weekCardHeightPx(120)).toBe(CALENDAR_CARD_MAX_PX);
    expect(weekCardHeightPx(5)).toBe(CALENDAR_CARD_MIN_PX);
  });
  it("back-to-back short lessons stack; overlapping boxes share the width side by side", async () => {
    const { layoutWeekDayCards } = await import("../src/lib/calendar-grid");
    const stacked = layoutWeekDayCards([
      { id: "a", startTime: "17:00", durationMinutes: 30 },
      { id: "b", startTime: "17:30", durationMinutes: 30 },
    ]);
    expect([stacked.get("a")!.columns, stacked.get("b")!.columns]).toEqual([1, 1]);
    const clash = layoutWeekDayCards([
      { id: "a", startTime: "17:00", durationMinutes: 60 },
      { id: "b", startTime: "17:00", durationMinutes: 60 },
      { id: "c", startTime: "17:30", durationMinutes: 60 },
      { id: "d", startTime: "19:00", durationMinutes: 60 },
    ]);
    // 17:30 (top 27px) overlaps both 40px cards that start at 17:00 → three lanes.
    expect(["a", "b", "c"].map((id) => [clash.get(id)!.column, clash.get(id)!.columns])).toEqual([[0, 3], [1, 3], [2, 3]]);
    expect(clash.get("d")).toMatchObject({ column: 0, columns: 1 });
  });
});

import { useCallback, useLayoutEffect, useRef } from "react";
import { calendarInitialHour } from "@/lib/calendar-grid";

type CalendarView = "day" | "week" | "month";
interface ScrollPosition { top: number; left: number }

/** Route-lifetime, per-view viewport state; unrelated rerenders never reposition it. */
export function useCalendarGridScroll({ teacherId, view, ready, days }: {
  teacherId?: string;
  view: CalendarView;
  ready: boolean;
  days: readonly { enabled: boolean; startTime: string }[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const positions = useRef<Partial<Record<CalendarView, ScrollPosition>>>({});
  const owner = useRef(teacherId);
  const activeView = useRef<CalendarView | null>(null);

  useLayoutEffect(() => {
    if (owner.current !== teacherId) {
      owner.current = teacherId;
      positions.current = {};
      activeView.current = null;
    }
    if (view === "month" || !ready) {
      activeView.current = null;
      return;
    }
    const area = scrollRef.current;
    if (!area || activeView.current === view) return;
    const saved = positions.current[view];
    if (saved) {
      area.scrollTop = saved.top;
      area.scrollLeft = saved.left;
    } else {
      const row = area.querySelector<HTMLElement>(`[data-calendar-drop-cell][data-hour="${calendarInitialHour(days)}"]`);
      if (!row) return;
      const header = area.querySelector<HTMLElement>("[data-calendar-grid-header]");
      area.scrollTop = Math.max(0, area.scrollTop + row.getBoundingClientRect().top - area.getBoundingClientRect().top - (header?.getBoundingClientRect().height ?? 0));
      area.scrollLeft = 0;
    }
    positions.current[view] = { top: area.scrollTop, left: area.scrollLeft };
    activeView.current = view;
  }, [teacherId, view, ready, days]);

  const onScroll = useCallback(() => {
    const area = scrollRef.current;
    if (area && ready && view !== "month" && activeView.current === view) {
      positions.current[view] = { top: area.scrollTop, left: area.scrollLeft };
    }
  }, [ready, view]);

  return { scrollRef, onScroll };
}
import type { CalendarEvent } from "@/lib/calendar-sync";

export const DASHBOARD_TIME_ZONE = "America/Sao_Paulo";

/** Current date (YYYY-MM-DD) and time (HH:MM) in the given time zone. */
export function zonedNow(now: Date, timeZone: string = DASHBOARD_TIME_ZONE): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/**
 * Presentation-only selector over the dashboard's existing `todayEvents`: the earliest lesson dated
 * today (America/Sao_Paulo) whose start time has not been reached yet. A lesson starting in the
 * current minute counts as already started. Returns null when no future lesson remains today.
 */
export function nextTodayLesson(events: CalendarEvent[], now: Date): CalendarEvent | null {
  const { date, time } = zonedNow(now);
  const upcoming = events
    .filter((e) => e.date === date && /^\d{2}:\d{2}$/.test(e.startTime) && e.startTime > time)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  return upcoming[0] ?? null;
}

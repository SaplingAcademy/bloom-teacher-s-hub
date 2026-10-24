/**
 * Date window loaded by the Calendar: first day of the month before the viewed date
 * through the last day of the month after it. Covers day/week/month grids (including
 * month-edge spillover) so week navigation within it reuses the same cached query.
 */
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function calendarEventsWindow(viewDate: Date): { start: string; end: string } {
  const y = viewDate.getFullYear();
  const m = viewDate.getMonth();
  return { start: ymd(new Date(y, m - 1, 1)), end: ymd(new Date(y, m + 2, 0)) };
}

export const calendarEventsQueryKey = (teacherId: string | undefined, start: string, end: string) =>
  ["calendar-events", teacherId, start, end] as const;

export const calendarEventsRootKey = (teacherId: string | undefined) => ["calendar-events", teacherId] as const;

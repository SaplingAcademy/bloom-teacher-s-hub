/** Display only: every hour is reachable regardless of events or availability. */
export function calendarGridHours(): string[] {
  return Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`);
}

interface CalendarScrollAvailability { enabled: boolean; startTime: string }

/** Initial viewport only; never changes availability or scheduling eligibility. */
export function calendarInitialHour(days: readonly CalendarScrollAvailability[]): string {
  const starts = days.filter(day => day.enabled).map(day => {
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(day.startTime);
    if (!match) return NaN;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    return hour < 24 && minute < 60 ? hour * 60 + minute : NaN;
  }).filter(Number.isFinite);
  const hour = starts.length ? Math.floor(Math.min(...starts) / 60) : 8;
  return `${String(hour).padStart(2, "0")}:00`;
}

/** Minimum height of one hour row in the week/day grids (64px reduced by ~15%). Display only. */
export const CALENDAR_HOUR_ROW_PX = 54;

/** Where a minute falls inside its hour row, as a fraction (0 = top, 1 = bottom). */
export function minuteFraction(minutes: number): number {
  return Math.max(0, Math.min(59, minutes)) / 60;
}

/**
 * Current-time indicator: the local day, the hour row and the offset inside it. Positioned as a
 * percentage of the real row height, so it stays aligned however tall a row grows.
 */
export function currentTimeMarker(now: Date): { date: string; hour: string; fraction: number } {
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    hour: `${pad(now.getHours())}:00`,
    fraction: minuteFraction(now.getMinutes()),
  };
}

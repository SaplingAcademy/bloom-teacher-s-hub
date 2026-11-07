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
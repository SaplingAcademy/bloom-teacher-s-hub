export interface CalendarGridEvent { startTime: string }

/** Display range only: never derive the grid's end from working availability. */
export function calendarGridHours(events: readonly CalendarGridEvent[] = []): string[] {
  const eventHours = events.map(event => Number(event.startTime.slice(0, 2)))
    .filter(hour => Number.isInteger(hour) && hour >= 0 && hour < 24);
  const firstHour = Math.min(8, ...eventHours);
  return Array.from({ length: 24 - firstHour }, (_, index) => `${String(firstHour + index).padStart(2, "0")}:00`);
}
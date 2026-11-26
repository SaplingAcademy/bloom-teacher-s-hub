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

/**
 * Height of one hour row (64px reduced by ~15%). Display only. In the week view this is the FIXED
 * row height and the single vertical scale for card position, card height and drag-and-drop; events
 * never stretch a row. (The day view keeps it as a minimum height.)
 */
export const CALENDAR_HOUR_ROW_PX = 54;

/**
 * Horizontal inset of week-view cards inside their hour cell. Vertically there is no padding: a card
 * starting at hh:00 sits on the hour line, hh:30 exactly halfway and hh:45 at 75% of the row.
 */
export const CALENDAR_CELL_PAD_PX = 4;

/** Week-view card height bounds: never taller than the compact card (PR #116), never unreadable. */
export const CALENDAR_CARD_MAX_PX = 40;
export const CALENDAR_CARD_MIN_PX = 20;
/** Below this height a card shows a single line (name and time). */
export const CALENDAR_CARD_TWO_LINE_PX = 34;

/** Card height on the hour scale for a duration, clamped to the compact bounds. */
export function weekCardHeightPx(durationMinutes: number): number {
  const scaled = (Math.max(0, durationMinutes) / 60) * CALENDAR_HOUR_ROW_PX;
  return Math.max(CALENDAR_CARD_MIN_PX, Math.min(CALENDAR_CARD_MAX_PX, scaled));
}

export interface WeekCardInput { id: string; startTime: string; durationMinutes: number }
export interface WeekCardLayout {
  /** Offset from the top of the card's hour cell (minute scale). */
  top: number;
  height: number;
  /** Side-by-side lane among cards whose drawn boxes overlap, and how many lanes that group has. */
  column: number;
  columns: number;
}

/**
 * Display-only layout of one day's cards on the hour scale. Cards whose drawn boxes overlap
 * (simultaneous or close lessons) share the width in lanes, so none is hidden behind another.
 * Times and durations are only read, never changed.
 */
export function layoutWeekDayCards(cards: readonly WeekCardInput[]): Map<string, WeekCardLayout> {
  const placed = cards
    .map((card) => {
      const [hour, minute] = card.startTime.split(":").map(Number);
      const safeMinute = Math.max(0, Math.min(59, minute || 0));
      const height = weekCardHeightPx(card.durationMinutes);
      const start = ((hour || 0) * 60 + safeMinute) / 60 * CALENDAR_HOUR_ROW_PX;
      return { id: card.id, top: minuteOffsetPx(safeMinute), height, start, end: start + height };
    })
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const result = new Map<string, WeekCardLayout>();
  let group: { id: string; column: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const closeGroup = () => {
    for (const member of group) {
      const layout = result.get(member.id)!;
      result.set(member.id, { ...layout, columns: laneEnds.length });
    }
    group = [];
    laneEnds = [];
  };
  for (const card of placed) {
    if (card.start >= groupEnd) closeGroup();
    let column = laneEnds.findIndex((end) => end <= card.start);
    if (column === -1) {
      column = laneEnds.length;
      laneEnds.push(card.end);
    } else {
      laneEnds[column] = card.end;
    }
    groupEnd = Math.max(groupEnd === -Infinity ? card.end : groupEnd, card.end);
    group.push({ id: card.id, column });
    result.set(card.id, { top: card.top, height: card.height, column, columns: 1 });
  }
  closeGroup();
  return result;
}

/**
 * Magnetic quarter-hour snapping inside an hour cell. `offset` is the card's top edge measured from
 * the cell's top; the result is 0, 15, 30 or 45 (a later quarter belongs to the next cell).
 */
export function snapMinutesInCell(offset: number): number {
  const quarter = CALENDAR_HOUR_ROW_PX / 4;
  return Math.max(0, Math.min(45, Math.round(offset / quarter) * 15));
}

/**
 * Vertical offset of a card starting `minutes` past the hour, inside its cell. The same value is used
 * for the dragged card and for the saved card, so the drop lands exactly where the card was shown.
 */
export function minuteOffsetPx(minutes: number): number {
  return (Math.max(0, Math.min(59, minutes)) / 60) * CALENDAR_HOUR_ROW_PX;
}

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

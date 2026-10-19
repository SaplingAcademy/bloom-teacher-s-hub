/** Chronological ordering and rescheduling display for lesson occurrences. event_id stays the identity. */
export interface ChronoLesson {
  event_id?: string;
  scheduled_date: string;
  start_time: string;
  original_date?: string | null;
  original_start_time?: string | null;
}

const hhmm = (t?: string | null) => String(t || "").slice(0, 5);

export function sortLessonsChronologically<T extends ChronoLesson>(lessons: T[]): T[] {
  return [...lessons].sort((a, b) =>
    `${a.scheduled_date} ${hhmm(a.start_time)}`.localeCompare(`${b.scheduled_date} ${hhmm(b.start_time)}`)
  );
}

/** Map event_id -> visible sequence number (1-based) from current chronological order. */
export function lessonSequenceMap<T extends ChronoLesson>(lessons: T[]): Map<string, number> {
  const map = new Map<string, number>();
  sortLessonsChronologically(lessons).forEach((l, i) => { if (l.event_id) map.set(l.event_id, i + 1); });
  return map;
}

/** Shows the original slot only when it really differs from the current one; rescheduled_at alone is ignored. */
export function rescheduledOriginal(lesson: ChronoLesson): { date: string; time: string } | null {
  if (!lesson.original_date) return null;
  const origTime = hhmm(lesson.original_start_time || lesson.start_time);
  if (lesson.original_date === lesson.scheduled_date && origTime === hhmm(lesson.start_time)) return null;
  return { date: lesson.original_date, time: origTime };
}

export function formatOriginalDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

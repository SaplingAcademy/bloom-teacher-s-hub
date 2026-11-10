/**
 * Real start of lessons of a student (`students.course_start_date`): the date the teacher enters
 * ("Início das aulas"), which may be earlier than the Bloom registration. It is a calendar date and
 * is never replaced by the registration date (`created_at`). Every indicator that dates new students
 * (Growth & Scale, Dashboard) reads it through these helpers, so they cannot diverge.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/;

/** The stored start date as "YYYY-MM-DD", or null when missing/invalid. No time-zone conversion. */
export function studentStartDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DATE_ONLY.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y), month = Number(m), day = Number(d);
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) return null;
  return `${y}-${m}-${d}`;
}

/** Start month "YYYY-MM" (local calendar), or null when the student has no valid start date. */
export function studentStartMonth(value: unknown): string | null {
  return studentStartDate(value)?.slice(0, 7) ?? null;
}

/** Local calendar month key "YYYY-MM" of a Date. */
export function localMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Today's local calendar date "YYYY-MM-DD" (for the "Hoje" shortcut; never the UTC date). */
export function todayLocalDate(now: Date = new Date()): string {
  return `${localMonthKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
}

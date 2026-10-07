/**
 * Academic period of a student (students.course_start_date / course_end_date).
 * Never derived from billing data (student_packages, invoices, due dates).
 */
export interface StudentCoursePeriod {
  startDate: string;
  endDate: string;
}

const isDate = (v?: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export function coursePeriodFromStudent(row: { course_start_date?: string | null; course_end_date?: string | null } | null | undefined): StudentCoursePeriod {
  return {
    startDate: isDate(row?.course_start_date) ? row!.course_start_date!.slice(0, 10) : "",
    endDate: isDate(row?.course_end_date) ? row!.course_end_date!.slice(0, 10) : "",
  };
}

/** Initial Lesson Plan period for the selected student; empty fields stay open for manual input. */
export function initialLessonPlanPeriod(course: Partial<StudentCoursePeriod> | null | undefined): StudentCoursePeriod {
  return { startDate: isDate(course?.startDate) ? course!.startDate! : "", endDate: isDate(course?.endDate) ? course!.endDate! : "" };
}

/** Keeps only occurrences inside the chosen period when an end date is set. */
export function clipToPeriod<T extends { scheduled_date: string }>(items: T[], endDate?: string | null): T[] {
  return isDate(endDate) ? items.filter((i) => i.scheduled_date <= endDate) : items;
}

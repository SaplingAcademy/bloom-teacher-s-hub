import type { AcademyLessonRow, AcademyModuleRow } from "./academy-content";

/**
 * Pure learning-experience helpers. Only published lessons ever enter an
 * outline, so progress, navigation and resume never count or expose drafts.
 */

export type OutlineModule = { module: AcademyModuleRow; lessons: AcademyLessonRow[] };

export function buildCourseOutline(
  modules: readonly AcademyModuleRow[],
  lessons: readonly AcademyLessonRow[],
): OutlineModule[] {
  const byModule = new Map<string, AcademyLessonRow[]>();
  for (const lesson of lessons) {
    if (lesson.status !== "published") continue;
    const list = byModule.get(lesson.module_id) ?? [];
    list.push(lesson);
    byModule.set(lesson.module_id, list);
  }
  return [...modules]
    .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    .map((module) => ({
      module,
      lessons: (byModule.get(module.id) ?? []).sort(
        (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
      ),
    }))
    .filter((entry) => entry.lessons.length > 0);
}

export function flattenOutline(outline: readonly OutlineModule[]): AcademyLessonRow[] {
  return outline.flatMap((entry) => entry.lessons);
}

export type CourseProgress = { completed: number; total: number; percent: number };

/** Percent of published lessons completed (e.g. 3 of 5 = 60). */
export function computeCourseProgress(
  publishedLessonIds: readonly string[],
  completedLessonIds: ReadonlySet<string>,
): CourseProgress {
  const total = publishedLessonIds.length;
  const completed = publishedLessonIds.filter((id) => completedLessonIds.has(id)).length;
  return { completed, total, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

export function lessonNeighbors(
  flat: readonly AcademyLessonRow[],
  currentId: string,
): { previous: AcademyLessonRow | null; next: AcademyLessonRow | null } {
  const index = flat.findIndex((lesson) => lesson.id === currentId);
  if (index < 0) return { previous: null, next: null };
  return { previous: flat[index - 1] ?? null, next: flat[index + 1] ?? null };
}

/**
 * Lesson to resume: last accessed (if still published), otherwise the first
 * incomplete lesson, otherwise the first lesson.
 */
export function resumeLesson(
  flat: readonly AcademyLessonRow[],
  lastLessonId: string | null,
  completedLessonIds: ReadonlySet<string>,
): AcademyLessonRow | null {
  if (lastLessonId) {
    const last = flat.find((lesson) => lesson.id === lastLessonId);
    if (last) return last;
  }
  return flat.find((lesson) => !completedLessonIds.has(lesson.id)) ?? flat[0] ?? null;
}

/** Started (any access or completion) and not finished. */
export function isCourseInProgress(progress: CourseProgress, started: boolean): boolean {
  return started && progress.total > 0 && progress.completed < progress.total;
}

export function youtubeEmbedUrl(youtubeId: string): string {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(youtubeId)}?rel=0&modestbranding=1`;
}

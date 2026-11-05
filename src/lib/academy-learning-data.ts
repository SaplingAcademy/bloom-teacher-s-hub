import { supabase } from "./supabase";
import type { AcademyCourseRow, AcademyLessonRow, AcademyModuleRow, AcademyVideoRow } from "./academy-content";

/**
 * Learning reads/writes via the session client. RLS limits content to
 * super_admin during private development and progress rows to the caller's
 * own user_id. Every content read filters status='published', so drafts are
 * never reachable from learning pages. Errors propagate to UI error states.
 */

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("ACADEMY_AUTH_REQUIRED");
  return data.user.id;
}

export type CourseLearningData = {
  course: AcademyCourseRow;
  modules: AcademyModuleRow[];
  lessons: AcademyLessonRow[];
  completedLessonIds: string[];
  lastLessonId: string | null;
};

/** Returns null when the course does not exist or is not published. */
export async function fetchCourseLearning(courseId: string): Promise<CourseLearningData | null> {
  const userId = await requireUserId();
  const { data: course, error } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("id", courseId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!course) return null;

  const { data: modules, error: modulesError } = await supabase
    .from("academy_modules")
    .select("*")
    .eq("course_id", courseId);
  if (modulesError) throw modulesError;
  const moduleIds = (modules ?? []).map((m) => m.id as string);

  let lessons: AcademyLessonRow[] = [];
  if (moduleIds.length > 0) {
    const { data, error: lessonsError } = await supabase
      .from("academy_lessons")
      .select("*")
      .in("module_id", moduleIds)
      .eq("status", "published");
    if (lessonsError) throw lessonsError;
    lessons = (data ?? []) as AcademyLessonRow[];
  }

  const lessonIds = lessons.map((l) => l.id);
  let completedLessonIds: string[] = [];
  if (lessonIds.length > 0) {
    const { data, error: progressError } = await supabase
      .from("academy_lesson_progress")
      .select("lesson_id")
      .eq("user_id", userId)
      .in("lesson_id", lessonIds);
    if (progressError) throw progressError;
    completedLessonIds = (data ?? []).map((r) => r.lesson_id as string);
  }

  const { data: courseProgress, error: courseProgressError } = await supabase
    .from("academy_course_progress")
    .select("last_lesson_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (courseProgressError) throw courseProgressError;

  return {
    course: course as AcademyCourseRow,
    modules: (modules ?? []) as AcademyModuleRow[],
    lessons,
    completedLessonIds,
    lastLessonId: (courseProgress?.last_lesson_id as string | null | undefined) ?? null,
  };
}

/** Resolves the published course that owns a published lesson. */
export async function fetchLessonCourseId(lessonId: string): Promise<string | null> {
  await requireUserId();
  const { data: lesson, error } = await supabase
    .from("academy_lessons")
    .select("module_id")
    .eq("id", lessonId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!lesson) return null;
  const { data: module, error: moduleError } = await supabase
    .from("academy_modules")
    .select("course_id")
    .eq("id", lesson.module_id as string)
    .maybeSingle();
  if (moduleError) throw moduleError;
  return (module?.course_id as string | undefined) ?? null;
}

/** Upsert keeps exactly one row per user/course. */
export async function recordLastLesson(courseId: string, lessonId: string): Promise<void> {
  const userId = await requireUserId();
  const { error } = await supabase
    .from("academy_course_progress")
    .upsert(
      { user_id: userId, course_id: courseId, last_lesson_id: lessonId, last_accessed_at: new Date().toISOString() },
      { onConflict: "user_id,course_id" },
    );
  if (error) throw error;
}

export async function setLessonCompleted(lessonId: string, completed: boolean): Promise<void> {
  const userId = await requireUserId();
  if (completed) {
    const { error } = await supabase
      .from("academy_lesson_progress")
      .upsert({ user_id: userId, lesson_id: lessonId }, { onConflict: "user_id,lesson_id", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("academy_lesson_progress")
      .delete()
      .eq("user_id", userId)
      .eq("lesson_id", lessonId);
    if (error) throw error;
  }
}

export type VideoLearningData = { video: AcademyVideoRow; completed: boolean };

export async function fetchVideoLearning(videoId: string): Promise<VideoLearningData | null> {
  const userId = await requireUserId();
  const { data: video, error } = await supabase
    .from("academy_videos")
    .select("*")
    .eq("id", videoId)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!video) return null;
  const { data: progress, error: progressError } = await supabase
    .from("academy_video_progress")
    .select("video_id")
    .eq("user_id", userId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (progressError) throw progressError;
  return { video: video as AcademyVideoRow, completed: Boolean(progress) };
}

export async function setVideoCompleted(videoId: string, completed: boolean): Promise<void> {
  const userId = await requireUserId();
  if (completed) {
    const { error } = await supabase
      .from("academy_video_progress")
      .upsert({ user_id: userId, video_id: videoId }, { onConflict: "user_id,video_id", ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("academy_video_progress")
      .delete()
      .eq("user_id", userId)
      .eq("video_id", videoId);
    if (error) throw error;
  }
}

export type MyCourseProgress = {
  startedCourseIds: string[];
  completedLessonIds: string[];
};

/** Caller's own progress rows for the home "Continue learning" section. */
export async function fetchMyCourseProgress(): Promise<MyCourseProgress> {
  const userId = await requireUserId();
  const [courses, lessons] = await Promise.all([
    supabase.from("academy_course_progress").select("course_id").eq("user_id", userId),
    supabase.from("academy_lesson_progress").select("lesson_id").eq("user_id", userId),
  ]);
  if (courses.error) throw courses.error;
  if (lessons.error) throw lessons.error;
  return {
    startedCourseIds: (courses.data ?? []).map((r) => r.course_id as string),
    completedLessonIds: (lessons.data ?? []).map((r) => r.lesson_id as string),
  };
}

/** Published lesson IDs per course (for progress percentages). */
export async function fetchPublishedLessonIdsByCourse(courseIds: string[]): Promise<Record<string, string[]>> {
  if (courseIds.length === 0) return {};
  await requireUserId();
  const { data: modules, error } = await supabase
    .from("academy_modules")
    .select("id, course_id")
    .in("course_id", courseIds);
  if (error) throw error;
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return {};
  const { data: lessons, error: lessonsError } = await supabase
    .from("academy_lessons")
    .select("id, module_id")
    .in("module_id", moduleIds)
    .eq("status", "published");
  if (lessonsError) throw lessonsError;
  const moduleToCourse = new Map((modules ?? []).map((m) => [m.id as string, m.course_id as string]));
  const result: Record<string, string[]> = {};
  for (const lesson of lessons ?? []) {
    const courseId = moduleToCourse.get(lesson.module_id as string);
    if (courseId) (result[courseId] ??= []).push(lesson.id as string);
  }
  return result;
}

import { supabase } from "./supabase";
import type {
  AcademyCourseRow,
  AcademyLessonRow,
  AcademyModuleRow,
  AcademyVideoRow,
} from "./academy-content";

/**
 * Academy content administration. Every call uses the authenticated session
 * client: the database RLS policies (super_admin only) are the real boundary,
 * so no client-side role checks are duplicated here. Errors propagate — the
 * UI shows failure states instead of pretending success.
 */

export type CourseInput = {
  title: string;
  short_description: string;
  full_description: string | null;
  category: string;
  cover_url: string | null;
  status: "draft" | "published";
  is_featured: boolean;
};

export type ModuleInput = { title: string; description: string | null; position: number };

export type LessonInput = {
  title: string;
  description: string | null;
  youtube_id: string;
  duration_minutes: number | null;
  position: number;
  status: "draft" | "published";
};

export type VideoInput = {
  title: string;
  description: string | null;
  category: string;
  youtube_id: string;
  thumbnail_url: string | null;
  duration_minutes: number | null;
  status: "draft" | "published";
  is_featured: boolean;
};

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("ACADEMY_AUTH_REQUIRED");
  return data.user.id;
}

// --- Reads (management sees everything, including drafts) ---

export async function fetchAllCourses(): Promise<AcademyCourseRow[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_courses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcademyCourseRow[];
}

export async function fetchCourseModules(courseId: string): Promise<AcademyModuleRow[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_modules")
    .select("*")
    .eq("course_id", courseId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AcademyModuleRow[];
}

export async function fetchModuleLessons(moduleId: string): Promise<AcademyLessonRow[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_lessons")
    .select("*")
    .eq("module_id", moduleId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AcademyLessonRow[];
}

export async function fetchAllVideos(): Promise<AcademyVideoRow[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_videos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcademyVideoRow[];
}

// --- Published catalog reads (home page; drafts never appear here) ---

export async function fetchPublishedCourses(): Promise<AcademyCourseRow[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcademyCourseRow[];
}

export async function fetchPublishedVideos(): Promise<AcademyVideoRow[]> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_videos")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AcademyVideoRow[];
}

/** Published lesson counts per course, for catalog cards. */
export async function fetchPublishedLessonCounts(courseIds: string[]): Promise<Record<string, number>> {
  if (courseIds.length === 0) return {};
  await requireUserId();
  const { data: modules, error: modulesError } = await supabase
    .from("academy_modules")
    .select("id, course_id")
    .in("course_id", courseIds);
  if (modulesError) throw modulesError;
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return {};
  const { data: lessons, error: lessonsError } = await supabase
    .from("academy_lessons")
    .select("module_id")
    .in("module_id", moduleIds)
    .eq("status", "published");
  if (lessonsError) throw lessonsError;
  const moduleToCourse = new Map((modules ?? []).map((m) => [m.id as string, m.course_id as string]));
  const counts: Record<string, number> = {};
  for (const lesson of lessons ?? []) {
    const courseId = moduleToCourse.get(lesson.module_id as string);
    if (courseId) counts[courseId] = (counts[courseId] ?? 0) + 1;
  }
  return counts;
}

// --- Course writes ---

export async function createCourse(input: CourseInput): Promise<AcademyCourseRow> {
  await requireUserId();
  const { data, error } = await supabase.from("academy_courses").insert(input).select().single();
  if (error) throw error;
  return data as AcademyCourseRow;
}

export async function updateCourse(id: string, input: CourseInput): Promise<AcademyCourseRow> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_courses")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as AcademyCourseRow;
}

export async function setCourseStatus(id: string, status: "draft" | "published"): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_courses").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteCourse(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_courses").delete().eq("id", id);
  if (error) throw error;
}

/** Duplicates a course as a new draft, copying modules and lessons. */
export async function duplicateCourse(courseId: string, copyTitle: string): Promise<AcademyCourseRow> {
  await requireUserId();
  const { data: source, error: sourceError } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("id", courseId)
    .single();
  if (sourceError) throw sourceError;

  const { data: copy, error: copyError } = await supabase
    .from("academy_courses")
    .insert({
      title: copyTitle,
      short_description: source.short_description,
      full_description: source.full_description,
      category: source.category,
      cover_url: source.cover_url,
      status: "draft",
      is_featured: false,
    })
    .select()
    .single();
  if (copyError) throw copyError;

  const modules = await fetchCourseModules(courseId);
  for (const module of modules) {
    const { data: moduleCopy, error: moduleError } = await supabase
      .from("academy_modules")
      .insert({
        course_id: copy.id,
        title: module.title,
        description: module.description,
        position: module.position,
      })
      .select()
      .single();
    if (moduleError) throw moduleError;

    const lessons = await fetchModuleLessons(module.id);
    if (lessons.length > 0) {
      const { error: lessonsError } = await supabase.from("academy_lessons").insert(
        lessons.map((lesson) => ({
          module_id: moduleCopy.id,
          title: lesson.title,
          description: lesson.description,
          youtube_id: lesson.youtube_id,
          duration_minutes: lesson.duration_minutes,
          position: lesson.position,
          status: lesson.status,
        })),
      );
      if (lessonsError) throw lessonsError;
    }
  }
  return copy as AcademyCourseRow;
}

// --- Module writes ---

export async function createModule(courseId: string, input: ModuleInput): Promise<AcademyModuleRow> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_modules")
    .insert({ course_id: courseId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as AcademyModuleRow;
}

export async function updateModule(id: string, input: ModuleInput): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_modules").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteModule(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_modules").delete().eq("id", id);
  if (error) throw error;
}

/** Persists a new module order as sequential positions. */
export async function reorderModules(orderedIds: string[]): Promise<void> {
  await requireUserId();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("academy_modules")
      .update({ position: index })
      .eq("id", orderedIds[index]);
    if (error) throw error;
  }
}

// --- Lesson writes ---

export async function createLesson(moduleId: string, input: LessonInput): Promise<AcademyLessonRow> {
  await requireUserId();
  const { data, error } = await supabase
    .from("academy_lessons")
    .insert({ module_id: moduleId, ...input })
    .select()
    .single();
  if (error) throw error;
  return data as AcademyLessonRow;
}

export async function updateLesson(id: string, input: LessonInput): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_lessons").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteLesson(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_lessons").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderLessons(orderedIds: string[]): Promise<void> {
  await requireUserId();
  for (let index = 0; index < orderedIds.length; index += 1) {
    const { error } = await supabase
      .from("academy_lessons")
      .update({ position: index })
      .eq("id", orderedIds[index]);
    if (error) throw error;
  }
}

// --- Independent video writes ---

export async function createVideo(input: VideoInput): Promise<AcademyVideoRow> {
  await requireUserId();
  const { data, error } = await supabase.from("academy_videos").insert(input).select().single();
  if (error) throw error;
  return data as AcademyVideoRow;
}

export async function updateVideo(id: string, input: VideoInput): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_videos").update(input).eq("id", id);
  if (error) throw error;
}

export async function setVideoStatus(id: string, status: "draft" | "published"): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_videos").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteVideo(id: string): Promise<void> {
  await requireUserId();
  const { error } = await supabase.from("academy_videos").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateVideo(videoId: string, copyTitle: string): Promise<AcademyVideoRow> {
  await requireUserId();
  const { data: source, error: sourceError } = await supabase
    .from("academy_videos")
    .select("*")
    .eq("id", videoId)
    .single();
  if (sourceError) throw sourceError;
  const { data, error } = await supabase
    .from("academy_videos")
    .insert({
      title: copyTitle,
      description: source.description,
      category: source.category,
      youtube_id: source.youtube_id,
      thumbnail_url: source.thumbnail_url,
      duration_minutes: source.duration_minutes,
      status: "draft",
      is_featured: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AcademyVideoRow;
}

// --- Cover image upload (academy-covers bucket; RLS limits writes to super_admin) ---

const COVER_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const COVER_MAX_BYTES = 5 * 1024 * 1024;

export async function uploadAcademyCover(file: File): Promise<string> {
  const userId = await requireUserId();
  if (!COVER_MIME_TYPES.has(file.type)) throw new Error("ACADEMY_COVER_TYPE");
  if (file.size > COVER_MAX_BYTES) throw new Error("ACADEMY_COVER_SIZE");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("academy-covers").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from("academy-covers").getPublicUrl(path);
  return data.publicUrl;
}

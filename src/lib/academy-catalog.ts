/**
 * Academy content model and official categories.
 * Content lists start empty: no courses, lessons or numbers are invented.
 * Future stages will populate these types from the database.
 */

export type AcademyCategoryId =
  | "teaching_methodology"
  | "student_management"
  | "business_management"
  | "professional_development"
  | "mastering_bloom";

export type AcademyCategory = {
  id: AcademyCategoryId;
  /** Moderate visual highlight for the platform-tutorials category. */
  highlighted: boolean;
};

export const ACADEMY_CATEGORIES: readonly AcademyCategory[] = [
  { id: "teaching_methodology", highlighted: false },
  { id: "student_management", highlighted: false },
  { id: "business_management", highlighted: false },
  { id: "professional_development", highlighted: false },
  { id: "mastering_bloom", highlighted: true },
] as const;

export type AcademyCourse = {
  id: string;
  title: string;
  category: AcademyCategoryId;
  description: string;
  coverUrl: string | null;
  lessonCount: number;
  /** 0–100; only present when real progress exists. */
  progressPercent: number | null;
  featured?: boolean;
};

export type AcademyVideo = {
  id: string;
  title: string;
  category: AcademyCategoryId;
  thumbnailUrl: string | null;
  durationMinutes: number;
  featured?: boolean;
};

export type AcademyContentFilter = {
  search: string;
  category: AcademyCategoryId | null;
};

export const EMPTY_ACADEMY_FILTER: AcademyContentFilter = { search: "", category: null };

function matchesSearch(text: string, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return text.toLowerCase().includes(query);
}

/** Pure filter shared by courses and videos; empty lists stay empty. */
export function filterAcademyCourses(courses: readonly AcademyCourse[], filter: AcademyContentFilter): AcademyCourse[] {
  return courses.filter(
    (course) =>
      (!filter.category || course.category === filter.category) &&
      matchesSearch(`${course.title} ${course.description}`, filter.search),
  );
}

export function filterAcademyVideos(videos: readonly AcademyVideo[], filter: AcademyContentFilter): AcademyVideo[] {
  return videos.filter(
    (video) =>
      (!filter.category || video.category === filter.category) &&
      matchesSearch(video.title, filter.search),
  );
}

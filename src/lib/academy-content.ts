import type { AcademyCategoryId } from "./academy-catalog";

/**
 * Academy content rows and pure helpers. All database access goes through the
 * session client under RLS: during private development only super_admin can
 * read or write these tables, so the UI never decides authorization by itself.
 */

export type AcademyContentStatus = "draft" | "published";

export type AcademyCourseRow = {
  id: string;
  title: string;
  short_description: string;
  full_description: string | null;
  category: AcademyCategoryId;
  cover_url: string | null;
  status: AcademyContentStatus;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

export type AcademyModuleRow = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type AcademyLessonRow = {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  youtube_id: string;
  duration_minutes: number | null;
  position: number;
  status: AcademyContentStatus;
  created_at: string;
  updated_at: string;
};

export type AcademyVideoRow = {
  id: string;
  title: string;
  description: string | null;
  category: AcademyCategoryId;
  youtube_id: string;
  thumbnail_url: string | null;
  duration_minutes: number | null;
  status: AcademyContentStatus;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
};

const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the normalized 11-character YouTube video ID from a raw ID or a
 * common URL (watch?v=, youtu.be, shorts/, embed/, live/). Returns null when
 * the input is not a recognizable YouTube reference.
 */
export function extractYoutubeId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (YOUTUBE_ID_PATTERN.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
    return YOUTUBE_ID_PATTERN.test(id) ? id : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const fromQuery = url.searchParams.get("v");
    if (fromQuery && YOUTUBE_ID_PATTERN.test(fromQuery)) return fromQuery;
    const segments = url.pathname.split("/").filter(Boolean);
    if (["shorts", "embed", "live", "v"].includes(segments[0] ?? "")) {
      const id = segments[1] ?? "";
      return YOUTUBE_ID_PATTERN.test(id) ? id : null;
    }
  }
  return null;
}

export function isValidYoutubeId(id: string): boolean {
  return YOUTUBE_ID_PATTERN.test(id);
}

/** Blank optional fields persist as NULL, never as invented defaults. */
export function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function parseOptionalDuration(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export type AcademyManageFilter = {
  search: string;
  category: AcademyCategoryId | null;
  status: AcademyContentStatus | null;
};

export const EMPTY_MANAGE_FILTER: AcademyManageFilter = { search: "", category: null, status: null };

function matches(text: string, search: string): boolean {
  const query = search.trim().toLowerCase();
  return !query || text.toLowerCase().includes(query);
}

export function filterManageableCourses(
  courses: readonly AcademyCourseRow[],
  filter: AcademyManageFilter,
): AcademyCourseRow[] {
  return courses.filter(
    (course) =>
      (!filter.category || course.category === filter.category) &&
      (!filter.status || course.status === filter.status) &&
      matches(`${course.title} ${course.short_description}`, filter.search),
  );
}

export function filterManageableVideos(
  videos: readonly AcademyVideoRow[],
  filter: AcademyManageFilter,
): AcademyVideoRow[] {
  return videos.filter(
    (video) =>
      (!filter.category || video.category === filter.category) &&
      (!filter.status || video.status === filter.status) &&
      matches(`${video.title} ${video.description ?? ""}`, filter.search),
  );
}

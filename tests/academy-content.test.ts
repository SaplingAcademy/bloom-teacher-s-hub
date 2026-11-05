import { describe, expect, it } from "vitest";
import {
  blankToNull,
  extractYoutubeId,
  filterManageableCourses,
  filterManageableVideos,
  isValidYoutubeId,
  parseOptionalDuration,
  EMPTY_MANAGE_FILTER,
  type AcademyCourseRow,
  type AcademyVideoRow,
} from "@/lib/academy-content";

describe("extractYoutubeId", () => {
  const ID = "dQw4w9WgXcQ";

  it("accepts a raw 11-character ID", () => {
    expect(extractYoutubeId(ID)).toBe(ID);
  });

  it("extracts from watch URLs", () => {
    expect(extractYoutubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://m.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
    expect(extractYoutubeId(`youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("extracts from short and embed URLs", () => {
    expect(extractYoutubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it("rejects invalid input without throwing", () => {
    expect(extractYoutubeId("")).toBeNull();
    expect(extractYoutubeId("   ")).toBeNull();
    expect(extractYoutubeId("not-a-video")).toBeNull();
    expect(extractYoutubeId("https://vimeo.com/12345")).toBeNull();
    expect(extractYoutubeId(`https://www.youtube.com/watch?v=short`)).toBeNull();
    expect(extractYoutubeId(`https://youtu.be/${ID}extra`)).toBeNull();
  });

  it("validates the normalized ID format", () => {
    expect(isValidYoutubeId(ID)).toBe(true);
    expect(isValidYoutubeId("too-short")).toBe(false);
    expect(isValidYoutubeId("dQw4w9WgXcQ!")).toBe(false);
  });
});

describe("optional field helpers", () => {
  it("maps blank optionals to null", () => {
    expect(blankToNull("")).toBeNull();
    expect(blankToNull("   ")).toBeNull();
    expect(blankToNull(" texto ")).toBe("texto");
  });

  it("parses optional durations strictly", () => {
    expect(parseOptionalDuration("")).toBeNull();
    expect(parseOptionalDuration("12")).toBe(12);
    expect(parseOptionalDuration("0")).toBeNull();
    expect(parseOptionalDuration("-3")).toBeNull();
    expect(parseOptionalDuration("abc")).toBeNull();
  });
});

describe("management filters", () => {
  const courses: AcademyCourseRow[] = [
    {
      id: "c1", title: "Metodologia ativa", short_description: "Aprenda metodologias",
      full_description: null, category: "teaching_methodology", cover_url: null,
      status: "published", is_featured: true, created_at: "2026-01-01", updated_at: "2026-01-01",
    },
    {
      id: "c2", title: "Financeiro do professor", short_description: "Organize o negócio",
      full_description: null, category: "business_management", cover_url: null,
      status: "draft", is_featured: false, created_at: "2026-01-02", updated_at: "2026-01-02",
    },
  ];
  const videos: AcademyVideoRow[] = [
    {
      id: "v1", title: "Tour do calendário", description: null, category: "mastering_bloom",
      youtube_id: "dQw4w9WgXcQ", thumbnail_url: null, duration_minutes: 6,
      status: "published", is_featured: false, created_at: "2026-01-01", updated_at: "2026-01-01",
    },
  ];

  it("returns everything with the empty filter", () => {
    expect(filterManageableCourses(courses, EMPTY_MANAGE_FILTER)).toHaveLength(2);
    expect(filterManageableVideos(videos, EMPTY_MANAGE_FILTER)).toHaveLength(1);
  });

  it("filters drafts and published content separately", () => {
    expect(filterManageableCourses(courses, { ...EMPTY_MANAGE_FILTER, status: "draft" }).map((c) => c.id)).toEqual(["c2"]);
    expect(filterManageableCourses(courses, { ...EMPTY_MANAGE_FILTER, status: "published" }).map((c) => c.id)).toEqual(["c1"]);
  });

  it("combines search, category and status", () => {
    const result = filterManageableCourses(courses, {
      search: "financeiro",
      category: "business_management",
      status: "draft",
    });
    expect(result.map((c) => c.id)).toEqual(["c2"]);
    expect(
      filterManageableVideos(videos, { search: "calendário", category: "mastering_bloom", status: "published" }),
    ).toHaveLength(1);
  });
});

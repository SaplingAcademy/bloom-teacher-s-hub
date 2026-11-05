import { describe, expect, it } from "vitest";
import {
  ACADEMY_CATEGORIES,
  EMPTY_ACADEMY_FILTER,
  filterAcademyCourses,
  filterAcademyVideos,
  type AcademyCourse,
  type AcademyVideo,
} from "@/lib/academy-catalog";

describe("Academy official categories", () => {
  it("defines exactly the five official categories in order", () => {
    expect(ACADEMY_CATEGORIES.map((c) => c.id)).toEqual([
      "teaching_methodology",
      "student_management",
      "business_management",
      "professional_development",
      "mastering_bloom",
    ]);
  });

  it("highlights only the Mastering Bloom category", () => {
    const highlighted = ACADEMY_CATEGORIES.filter((c) => c.highlighted);
    expect(highlighted.map((c) => c.id)).toEqual(["mastering_bloom"]);
  });
});

describe("Academy content filters", () => {
  const courses: AcademyCourse[] = [
    {
      id: "c1",
      title: "Planejamento de aulas",
      category: "teaching_methodology",
      description: "Organize seu planejamento semanal",
      coverUrl: null,
      lessonCount: 8,
      progressPercent: null,
    },
    {
      id: "c2",
      title: "Precificação",
      category: "business_management",
      description: "Defina preços com confiança",
      coverUrl: null,
      lessonCount: 5,
      progressPercent: 40,
    },
  ];
  const videos: AcademyVideo[] = [
    { id: "v1", title: "Como usar o calendário", category: "mastering_bloom", thumbnailUrl: null, durationMinutes: 6 },
    { id: "v2", title: "Reagendamento de aulas", category: "student_management", thumbnailUrl: null, durationMinutes: 4 },
  ];

  it("returns everything with the empty filter", () => {
    expect(filterAcademyCourses(courses, EMPTY_ACADEMY_FILTER)).toHaveLength(2);
    expect(filterAcademyVideos(videos, EMPTY_ACADEMY_FILTER)).toHaveLength(2);
  });

  it("filters courses by category", () => {
    const result = filterAcademyCourses(courses, { search: "", category: "business_management" });
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("filters videos by category", () => {
    const result = filterAcademyVideos(videos, { search: "", category: "mastering_bloom" });
    expect(result.map((v) => v.id)).toEqual(["v1"]);
  });

  it("combines search and category, case-insensitively", () => {
    const result = filterAcademyCourses(courses, { search: "PREÇOS", category: "business_management" });
    expect(result.map((c) => c.id)).toEqual(["c2"]);
    expect(filterAcademyCourses(courses, { search: "preços", category: "teaching_methodology" })).toHaveLength(0);
  });

  it("keeps empty lists empty instead of inventing content", () => {
    expect(filterAcademyCourses([], EMPTY_ACADEMY_FILTER)).toEqual([]);
    expect(filterAcademyVideos([], { search: "qualquer", category: null })).toEqual([]);
  });
});

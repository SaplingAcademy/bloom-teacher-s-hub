import { describe, expect, it } from "vitest";
import {
  buildCourseOutline,
  computeCourseProgress,
  flattenOutline,
  isCourseInProgress,
  lessonNeighbors,
  resumeLesson,
  withLessonCompletion,
  youtubeEmbedUrl,
} from "../src/lib/academy-learning";
import type { AcademyLessonRow, AcademyModuleRow } from "../src/lib/academy-content";

const mod = (id: string, position: number): AcademyModuleRow => ({
  id, course_id: "c", title: id, description: null, position, created_at: "2026-01-01", updated_at: "2026-01-01",
});
const lesson = (id: string, module_id: string, position: number, status: "draft" | "published" = "published"): AcademyLessonRow => ({
  id, module_id, title: id, description: null, youtube_id: "abcdefghijk", duration_minutes: null, position, status,
  created_at: "2026-01-01", updated_at: "2026-01-01",
});

const outline = buildCourseOutline(
  [mod("m2", 2), mod("m1", 1)],
  [lesson("b", "m1", 2), lesson("a", "m1", 1), lesson("draft", "m1", 3, "draft"), lesson("c", "m2", 1)],
);
const flat = flattenOutline(outline);

describe("academy learning", () => {
  it("orders modules/lessons and excludes drafts", () => {
    expect(flat.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("3 of 5 published lessons completed = 60%", () => {
    expect(computeCourseProgress(["1", "2", "3", "4", "5"], new Set(["1", "2", "3"])).percent).toBe(60);
  });

  it("ignores completions of lessons that are not published", () => {
    expect(computeCourseProgress(["a", "b"], new Set(["a", "draft"]))).toEqual({ completed: 1, total: 2, percent: 50 });
  });

  it("previous/next follow course order across modules", () => {
    const n = lessonNeighbors(flat, "b");
    expect(n.previous?.id).toBe("a");
    expect(n.next?.id).toBe("c");
    expect(lessonNeighbors(flat, "a").previous).toBeNull();
  });

  it("resumes at last accessed lesson, else first incomplete", () => {
    expect(resumeLesson(flat, "c", new Set())?.id).toBe("c");
    expect(resumeLesson(flat, "draft", new Set(["a"]))?.id).toBe("b");
  });

  it("in progress only when started and not finished", () => {
    expect(isCourseInProgress({ completed: 0, total: 3, percent: 0 }, true)).toBe(true);
    expect(isCourseInProgress({ completed: 3, total: 3, percent: 100 }, true)).toBe(false);
    expect(isCourseInProgress({ completed: 0, total: 3, percent: 0 }, false)).toBe(false);
  });

  it("optimistic completion adds the lesson without mutating the previous list", () => {
    const before = ["a", "b"];
    const after = withLessonCompletion(before, "c", true);
    expect(after).toEqual(["a", "b", "c"]);
    expect(before).toEqual(["a", "b"]);
    expect(withLessonCompletion(before, "a", true)).toEqual(["a", "b"]);
  });

  it("optimistic undo removes only the toggled lesson", () => {
    expect(withLessonCompletion(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
    expect(withLessonCompletion(["a"], "missing", false)).toEqual(["a"]);
  });

  it("builds the official embed from the stored id", () => {
    expect(youtubeEmbedUrl("abcdefghijk")).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0&modestbranding=1");
  });
});

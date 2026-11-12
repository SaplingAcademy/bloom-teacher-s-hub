import { describe, expect, it } from "vitest";
import {
  COMMUNITY_FILTERS,
  countNeedsHelp,
  filterCommunityPosts,
  isMissingTopicColumn,
  needsHelp,
  normalizeCommunityTopic,
} from "@/lib/community-topics";

const post = (over: Partial<{ title: string; content: string; tags: string[]; topic: any; commentCount: number }> = {}) => ({
  title: "Título", content: "Conteúdo", tags: [], topic: null, commentCount: 0, ...over,
});

describe("community topics", () => {
  it("lists Tudo, the five topics and Ajude outro professor", () => {
    expect(COMMUNITY_FILTERS).toEqual(["all", "questions", "lesson_ideas", "materials", "management", "achievements", "help"]);
  });

  it("normalizes unknown or missing topics to no label", () => {
    expect(normalizeCommunityTopic("materials")).toBe("materials");
    expect(normalizeCommunityTopic(null)).toBeNull();
    expect(normalizeCommunityTopic("other")).toBeNull();
  });

  it("help = questions without comments", () => {
    expect(needsHelp(post({ topic: "questions", commentCount: 0 }))).toBe(true);
    expect(needsHelp(post({ topic: "questions", commentCount: 1 }))).toBe(false);
    expect(needsHelp(post({ topic: "materials", commentCount: 0 }))).toBe(false);
    expect(needsHelp(post({ topic: null, commentCount: 0 }))).toBe(false);
    expect(countNeedsHelp([post({ topic: "questions" }), post({ topic: "questions", commentCount: 2 }), post()])).toBe(1);
  });

  it("filters by topic and keeps the previous text search", () => {
    const posts = [
      post({ title: "Como cobrar faltas?", topic: "management" }),
      post({ title: "Jogo de verbos", topic: "lesson_ideas", tags: ["gramática"] }),
      post({ title: "Post antigo sem assunto" }),
    ];
    expect(filterCommunityPosts(posts, "all", "").length).toBe(3);
    expect(filterCommunityPosts(posts, "management", "").map((p) => p.title)).toEqual(["Como cobrar faltas?"]);
    expect(filterCommunityPosts(posts, "all", "GRAMÁTICA").map((p) => p.title)).toEqual(["Jogo de verbos"]);
    expect(filterCommunityPosts(posts, "management", "verbos")).toEqual([]);
  });

  it("recognizes only the missing topic column error, never masking other Supabase errors", () => {
    // Matched: the column does not exist yet (read 42703 / write PGRST204).
    expect(isMissingTopicColumn({ code: "42703", message: "column community_posts.topic does not exist" })).toBe(true);
    expect(isMissingTopicColumn({ code: "42703", message: 'column "topic" does not exist' })).toBe(true);
    expect(isMissingTopicColumn({ code: "PGRST204", message: "Could not find the 'topic' column of 'community_posts' in the schema cache" })).toBe(true);
    // Not matched: other columns, similar names, other tables, other codes.
    expect(isMissingTopicColumn({ code: "42703", message: "column community_posts.foo does not exist" })).toBe(false);
    expect(isMissingTopicColumn({ code: "42703", message: "column community_posts.topic_id does not exist" })).toBe(false);
    expect(isMissingTopicColumn({ code: "42703", message: "column community_posts.subtopic does not exist" })).toBe(false);
    expect(isMissingTopicColumn({ code: "PGRST204", message: "Could not find the 'topic' column of 'comments' in the schema cache" })).toBe(false);
    expect(isMissingTopicColumn({ code: "42501", message: "permission denied for table community_posts (topic)" })).toBe(false);
    expect(isMissingTopicColumn({ code: "PGRST301", message: "JWT expired" })).toBe(false);
    expect(isMissingTopicColumn({ message: "column community_posts.topic does not exist" })).toBe(false);
    expect(isMissingTopicColumn(null)).toBe(false);
  });
});

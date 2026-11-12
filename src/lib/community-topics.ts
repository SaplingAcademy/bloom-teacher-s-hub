/**
 * Community topics (one feed, filtered by subject). New posts must have a topic; posts created
 * before topics existed have none and appear normally, without a label.
 */
export const COMMUNITY_TOPICS = ["questions", "lesson_ideas", "materials", "management", "achievements"] as const;
export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number];

/** "all" = every post; "help" = "Ajude outro professor" (questions nobody answered yet). */
export type CommunityFilter = "all" | CommunityTopic | "help";
export const COMMUNITY_FILTERS: CommunityFilter[] = ["all", ...COMMUNITY_TOPICS, "help"];

export function isCommunityTopic(value: unknown): value is CommunityTopic {
  return typeof value === "string" && (COMMUNITY_TOPICS as readonly string[]).includes(value);
}

/** Unknown or missing values become null (no label) instead of breaking the feed. */
export function normalizeCommunityTopic(value: unknown): CommunityTopic | null {
  return isCommunityTopic(value) ? value : null;
}

interface FilterablePost {
  title: string;
  content: string;
  tags: string[];
  topic: CommunityTopic | null;
  commentCount: number;
}

/** A question with no comments yet: shown under "Ajude outro professor". */
export function needsHelp(post: Pick<FilterablePost, "topic" | "commentCount">): boolean {
  return post.topic === "questions" && post.commentCount === 0;
}

export function matchesCommunityFilter(post: FilterablePost, filter: CommunityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "help") return needsHelp(post);
  return post.topic === filter;
}

/** Same text search as before (title, content, tags), combined with the selected filter. */
export function filterCommunityPosts<T extends FilterablePost>(posts: T[], filter: CommunityFilter, search: string): T[] {
  const q = search.trim().toLowerCase();
  return posts.filter(
    (p) =>
      matchesCommunityFilter(p, filter) &&
      (!q ||
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.tags.some((tag) => tag.toLowerCase().includes(q))),
  );
}

/** Number of unanswered questions (badge on the "Ajude outro professor" filter). */
export function countNeedsHelp(posts: Pick<FilterablePost, "topic" | "commentCount">[]): number {
  return posts.filter(needsHelp).length;
}

/**
 * True when Supabase reports that the topic column does not exist yet (migration not applied):
 * "42703" on reads, "PGRST204" (schema cache) on writes. The feed then falls back to the legacy
 * read, so publishing the app before the SQL never breaks the Community.
 */
export function isMissingTopicColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const mentionsTopic = /\btopic\b/i.test(error.message ?? "");
  return (error.code === "42703" || error.code === "PGRST204") && mentionsTopic;
}

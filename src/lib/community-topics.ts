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
 * True only for "the topic column does not exist" (migration not applied):
 *   - Postgres 42703 on reads: `column community_posts.topic does not exist` (or `column "topic" ...`);
 *   - PostgREST PGRST204 on writes: `Could not find the 'topic' column of 'community_posts' ...`.
 * Any other error (other columns, permissions, network, RLS) is NOT matched, so it surfaces as a
 * load error instead of being masked by the legacy read.
 */
export function isMissingTopicColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code === "42703") {
    return /column (?:community_posts\.topic|"topic"|topic) does not exist/i.test(message);
  }
  if (error.code === "PGRST204") {
    return /could not find the 'topic' column of 'community_posts'/i.test(message);
  }
  return false;
}

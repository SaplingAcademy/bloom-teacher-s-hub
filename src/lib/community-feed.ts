import { supabase } from "@/lib/supabase";
import { isMissingTopicColumn } from "@/lib/community-topics";

const POST_COLUMNS = "id, author_id, title, content, tags, likes_count, created_at, updated_at";

export interface CommunityPostRowsResult {
  data: any[] | null;
  error: { code?: string; message?: string } | null;
  /** False while the topic column migration is not applied: no filters, publish without topic. */
  topicsEnabled: boolean;
}

/**
 * Reads the feed rows with `topic`. If the column does not exist yet (migration pending), reads
 * again with the previous columns so the Community keeps working exactly as before.
 */
export async function fetchCommunityPostRows(): Promise<CommunityPostRowsResult> {
  const read = (columns: string) =>
    supabase.from("community_posts").select(columns).order("created_at", { ascending: false });
  const withTopic = await read(`${POST_COLUMNS}, topic`);
  if (isMissingTopicColumn(withTopic.error)) {
    const legacy = await read(POST_COLUMNS);
    return { data: legacy.data as any[] | null, error: legacy.error, topicsEnabled: false };
  }
  return { data: withTopic.data as any[] | null, error: withTopic.error, topicsEnabled: true };
}

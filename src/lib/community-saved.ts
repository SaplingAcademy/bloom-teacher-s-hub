import { supabase } from "@/lib/supabase";

/**
 * Private saved posts (Comunidade Bloom · Etapa 2). Rows live in public.community_saved_posts,
 * protected by RLS (each teacher reads/writes only their own) and a (user_id, post_id) primary key.
 * Saving never touches reactions, comments, ranking or notifications.
 */
const TABLE = "community_saved_posts";

type SupabaseError = { code?: string; message?: string } | null | undefined;

/**
 * True only when the saved-posts table does not exist yet (migration not applied):
 *   - PostgREST PGRST205: `Could not find the table 'public.community_saved_posts' in the schema cache`;
 *   - Postgres 42P01: `relation "public.community_saved_posts" does not exist`.
 * Permission, auth, network or other-table errors are NOT matched, so they surface as errors.
 */
export function isMissingSavedPostsTable(error: SupabaseError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  if (error.code === "PGRST205") return /could not find the table '(?:public\.)?community_saved_posts'/i.test(message);
  if (error.code === "42P01") return /relation "(?:public\.)?community_saved_posts" does not exist/i.test(message);
  return false;
}

export interface SavedPostIdsResult {
  ids: Set<string>;
  error: { code?: string; message?: string } | null;
  /** False while the table does not exist: Save and the "Salvos" filter stay hidden. */
  savedEnabled: boolean;
}

/** The current teacher's saved post ids (RLS also restricts the rows to their own). */
export async function fetchSavedPostIds(userId: string): Promise<SavedPostIdsResult> {
  const { data, error } = await supabase.from(TABLE).select("post_id").eq("user_id", userId);
  if (isMissingSavedPostsTable(error)) return { ids: new Set(), error: null, savedEnabled: false };
  if (error) return { ids: new Set(), error, savedEnabled: true };
  return { ids: new Set((data ?? []).map((row: { post_id: string }) => row.post_id)), error: null, savedEnabled: true };
}

/** Saves a post. Saving twice is harmless: the duplicate (23505) means it is already saved. */
export async function savePost(userId: string, postId: string): Promise<{ error: SupabaseError }> {
  const { error } = await supabase.from(TABLE).insert({ user_id: userId, post_id: postId });
  if (error?.code === "23505") return { error: null };
  return { error };
}

/** Removes a saved post (idempotent). */
export async function unsavePost(userId: string, postId: string): Promise<{ error: SupabaseError }> {
  const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("post_id", postId);
  return { error };
}

import { supabase } from "@/lib/supabase";

export interface PostVersion {
  id: string;
  post_id: string;
  author_id: string;
  version_number: number;
  title_snapshot: string;
  content_snapshot: string;
  metadata_snapshot: Record<string, any>;
  edit_reason?: string;
  change_type: "edit" | "restoration" | "accepted_solution_update";
  created_at: string;
  created_by: string;
  created_by_name?: string;
}

export interface CommunityDraft {
  id?: string;
  teacher_id: string;
  draft_type: "post" | "comment" | "article";
  linked_post_id?: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
  last_saved_at?: string;
}

export interface PublicationHistoryItem {
  id: string;
  title: string;
  category: string;
  subject_name?: string;
  created_at: string;
  last_edited_at?: string;
  version_number: number;
  water_count: number;
  is_accepted_solution: boolean;
  is_community_article: boolean;
}

/**
 * Fetch all version history snapshots for a post
 */
export async function fetchPostVersions(postId: string): Promise<PostVersion[]> {
  if (!postId) return [];

  try {
    const { data, error } = await supabase
      .from("community_post_versions")
      .select("*, profiles:created_by(full_name)")
      .eq("post_id", postId)
      .order("version_number", { ascending: false });

    if (error) {
      console.error("[community-persistence] Error fetching post versions:", error);
      return [];
    }

    return (data || []).map((v: any) => ({
      ...v,
      created_by_name: v.profiles?.full_name || "Educador Bloom",
    })) as PostVersion[];
  } catch (err) {
    console.error("[community-persistence] Failed to fetch post versions:", err);
    return [];
  }
}

/**
 * Edit a post transactionally via RPC edit_community_post.
 * Automatically saves a snapshot of the previous version.
 */
export async function editPostWithVersion(params: {
  postId: string;
  teacherId: string;
  newTitle: string;
  newContent: string;
  editReason?: string;
  expectedVersion?: number;
}): Promise<{
  success: boolean;
  newVersionNumber?: number;
  concurrencyConflict?: boolean;
  error?: string;
}> {
  const { postId, teacherId, newTitle, newContent, editReason, expectedVersion } = params;

  if (!postId || !teacherId) {
    return { success: false, error: "Parâmetros inválidos para edição" };
  }

  try {
    const { data, error } = await supabase.rpc("edit_community_post", {
      p_post_id: postId,
      p_teacher_id: teacherId,
      p_new_title: newTitle,
      p_new_content: newContent,
      p_edit_reason: editReason || null,
      p_expected_version: expectedVersion || null,
    });

    if (error) {
      console.error("[community-persistence] edit_community_post RPC error:", error);
      return { success: false, error: error.message };
    }

    if (!data.success) {
      return {
        success: false,
        concurrencyConflict: data.concurrency_conflict,
        error: data.error,
      };
    }

    return {
      success: true,
      newVersionNumber: data.new_version_number,
    };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Restore a previous version snapshot of a post via RPC restore_community_post_version
 */
export async function restorePostVersion(
  postId: string,
  teacherId: string,
  targetVersionNumber: number
): Promise<{ success: boolean; newVersionNumber?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("restore_community_post_version", {
      p_post_id: postId,
      p_teacher_id: teacherId,
      p_target_version_number: targetVersionNumber,
    });

    if (error || !data.success) {
      return { success: false, error: error?.message || data?.error || "Erro ao restaurar versão" };
    }

    return { success: true, newVersionNumber: data.new_version_number };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Soft-delete a publication while preserving audit and version records
 */
export async function softDeletePost(
  postId: string,
  teacherId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc("soft_delete_community_post", {
      p_post_id: postId,
      p_teacher_id: teacherId,
      p_reason: reason || null,
    });

    if (error || !data.success) {
      return { success: false, error: error?.message || data?.error || "Erro ao remover publicação" };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Save / autosave a private draft to Supabase community_drafts
 */
export async function saveCommunityDraft(
  teacherId: string,
  draftType: "post" | "comment" | "article",
  title: string,
  content: string,
  metadata?: Record<string, any>,
  linkedPostId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) return { success: false, error: "Não autenticado" };

  try {
    const payload = {
      teacher_id: teacherId,
      draft_type: draftType,
      linked_post_id: linkedPostId || null,
      title: title || "",
      content: content || "",
      metadata: metadata || {},
      last_saved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("community_drafts").upsert(payload, {
      onConflict: "teacher_id,draft_type",
    });

    if (error) {
      console.warn("[community-persistence] Error saving draft:", error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Fetch saved private draft for teacher
 */
export async function fetchCommunityDraft(
  teacherId: string,
  draftType: "post" | "comment" | "article" = "post"
): Promise<CommunityDraft | null> {
  if (!teacherId) return null;

  try {
    const { data, error } = await supabase
      .from("community_drafts")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("draft_type", draftType)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[community-persistence] Error fetching draft:", error);
    }

    return data as CommunityDraft | null;
  } catch (err) {
    return null;
  }
}

/**
 * Clear draft after successful publication
 */
export async function clearCommunityDraft(
  teacherId: string,
  draftType: "post" | "comment" | "article" = "post"
) {
  if (!teacherId) return;
  try {
    await supabase
      .from("community_drafts")
      .delete()
      .eq("teacher_id", teacherId)
      .eq("draft_type", draftType);
  } catch (err) {
    console.error("[community-persistence] Error clearing draft:", err);
  }
}

/**
 * Fetch publication history for profile page with pagination & filtering
 */
export async function fetchTeacherPublicationHistory(
  teacherId: string,
  categoryFilter = "all",
  page = 1,
  limit = 10
): Promise<{ items: PublicationHistoryItem[]; totalCount: number }> {
  if (!teacherId) return { items: [], totalCount: 0 };

  try {
    let query = supabase
      .from("community_posts")
      .select("id, title, category, created_at, last_edited_at, version_number, water_count, is_accepted_solution, is_community_article", {
        count: "exact",
      })
      .eq("author_id", teacherId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (categoryFilter !== "all") {
      if (categoryFilter === "articles") {
        query = query.eq("is_community_article", true);
      } else {
        query = query.eq("category", categoryFilter);
      }
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await query.range(from, to);

    if (error) {
      console.error("[community-persistence] Error fetching publication history:", error);
      return { items: [], totalCount: 0 };
    }

    const items: PublicationHistoryItem[] = (data || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      category: p.category || "Tip",
      created_at: p.created_at,
      last_edited_at: p.last_edited_at,
      version_number: p.version_number || 1,
      water_count: p.water_count || 0,
      is_accepted_solution: p.is_accepted_solution || false,
      is_community_article: p.is_community_article || false,
    }));

    return { items, totalCount: count || 0 };
  } catch (err) {
    console.error("[community-persistence] Failed to fetch publication history:", err);
    return { items: [], totalCount: 0 };
  }
}

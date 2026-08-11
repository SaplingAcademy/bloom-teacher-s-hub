import { supabase } from "@/lib/supabase";

export type GrowthStage = "seedling" | "growing" | "blooming" | "favorite" | "reference";

export interface GrowthStageMeta {
  id: GrowthStage;
  label: string;
  emoji: string;
  description: string;
  badgeClass: string;
  containerClass: string;
  minWaterings: number;
}

export const GROWTH_STAGES: Record<GrowthStage, GrowthStageMeta> = {
  seedling: {
    id: "seedling",
    label: "Mudinha",
    emoji: "🌱",
    description: "Ideia recém-plantada pela comunidade",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    containerClass: "border-border",
    minWaterings: 0,
  },
  growing: {
    id: "growing",
    label: "Crescendo",
    emoji: "🌿",
    description: "Ideia enraizando com interesse ativo",
    badgeClass: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
    containerClass: "border-teal-500/30 shadow-sm",
    minWaterings: 5,
  },
  blooming: {
    id: "blooming",
    label: "Florindo",
    emoji: "🌼",
    description: "Contribuição pedagógica de grande valor",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    containerClass: "border-amber-500/40 shadow-sm bg-amber-500/5",
    minWaterings: 15,
  },
  favorite: {
    id: "favorite",
    label: "Favorita da Comunidade",
    emoji: "🌸",
    description: "Recurso de alto impacto aprovado pelos professores",
    badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    containerClass: "border-rose-500/40 shadow-md bg-rose-500/5",
    minWaterings: 30,
  },
  reference: {
    id: "reference",
    label: "Referência Bloom",
    emoji: "🌳",
    description: "Material de referência essencial para educadores",
    badgeClass: "bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border-emerald-600/40 font-bold",
    containerClass: "border-emerald-500/50 shadow-md bg-emerald-500/5 ring-1 ring-emerald-500/20",
    minWaterings: 50,
  },
};

export function getStageMeta(waterCount: number, stage?: string): GrowthStageMeta {
  if (waterCount >= 50) return GROWTH_STAGES.reference;
  if (waterCount >= 30) return GROWTH_STAGES.favorite;
  if (waterCount >= 15) return GROWTH_STAGES.blooming;
  if (waterCount >= 5) return GROWTH_STAGES.growing;
  return GROWTH_STAGES.seedling;
}

export interface PostComment {
  id: string;
  authorId?: string;
  authorName: string;
  content: string;
  waterCount: number;
  wateredByUser?: boolean;
  isAcceptedAnswer?: boolean;
  timeAgo: string;
}

export interface GardenPost {
  id: string;
  authorId?: string;
  authorName: string;
  authorAvatar?: string;
  category: "Question" | "Tip" | "Need Help" | "Resource" | "Article";
  title: string;
  content: string;
  tags?: string[];
  waterCount: number;
  growthStage: GrowthStage;
  commentsCount: number;
  commentsList?: PostComment[];
  timeAgo: string;
  wateredByUser?: boolean;
  cultivatedByUser?: boolean;
  isAcceptedSolution?: boolean;
  isCommunityArticle?: boolean;
  articleContributors?: string[];
  subject_garden_id?: string;
  thematic_garden_ids?: string[];
}

export interface DailyWateringStatus {
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
}

/**
 * Fetch daily waterings used by teacher today
 */
export async function getDailyWateringStatus(
  teacherId: string,
  dailyLimit = 5
): Promise<DailyWateringStatus> {
  if (!teacherId) {
    return { usedToday: 0, dailyLimit, remainingToday: dailyLimit };
  }

  const todayStr = new Date().toISOString().split("T")[0];
  try {
    const { count, error } = await supabase
      .from("idea_waterings")
      .select("id", { count: "exact", head: true })
      .eq("teacher_id", teacherId)
      .eq("watered_date", todayStr);

    if (error) {
      console.warn("[knowledge-garden] Error fetching daily quota:", error.message);
      return { usedToday: 0, dailyLimit, remainingToday: dailyLimit };
    }

    const usedToday = count || 0;
    return {
      usedToday,
      dailyLimit,
      remainingToday: Math.max(0, dailyLimit - usedToday),
    };
  } catch (err) {
    return { usedToday: 0, dailyLimit, remainingToday: dailyLimit };
  }
}

/**
 * Water an idea (Post or Comment) via RPC with daily quota enforcement
 */
export async function waterIdea(
  teacherId: string,
  postId?: string,
  commentId?: string,
  dailyLimit = 5
): Promise<{
  success: boolean;
  waterCount?: number;
  growthStage?: GrowthStage;
  usedToday?: number;
  remainingToday?: number;
  limitReached?: boolean;
  error?: string;
}> {
  if (!teacherId) {
    return { success: false, error: "Usuário não autenticado." };
  }

  try {
    const { data, error } = await supabase.rpc("water_idea", {
      p_teacher_id: teacherId,
      p_post_id: postId || null,
      p_comment_id: commentId || null,
      p_daily_limit: dailyLimit,
    });

    if (error) {
      console.error("[knowledge-garden] water_idea RPC error:", error);
      return { success: false, error: error.message };
    }

    if (!data.success) {
      return {
        success: false,
        limitReached: data.limit_reached,
        usedToday: data.used_today,
        error: data.error || "Não foi possível regar esta ideia.",
      };
    }

    return {
      success: true,
      waterCount: data.water_count,
      growthStage: data.growth_stage as GrowthStage,
      usedToday: data.used_today,
      remainingToday: data.remaining_today,
    };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Cultivar (Save) / Uncultivar an item into "Meu Jardim"
 */
export async function toggleCultivateItem(
  teacherId: string,
  postId: string,
  currentlyCultivated: boolean,
  itemType: "discussion" | "resource" | "activity" = "discussion"
): Promise<{ success: boolean; cultivated: boolean; error?: string }> {
  if (!teacherId || !postId) return { success: false, cultivated: false, error: "Parâmetros inválidos" };

  try {
    if (currentlyCultivated) {
      const { error } = await supabase
        .from("cultivated_items")
        .delete()
        .eq("teacher_id", teacherId)
        .eq("post_id", postId);

      if (error) return { success: false, cultivated: true, error: error.message };
      return { success: true, cultivated: false };
    } else {
      const { error } = await supabase.from("cultivated_items").insert({
        teacher_id: teacherId,
        post_id: postId,
        item_type: itemType,
      });

      if (error) return { success: false, cultivated: false, error: error.message };
      return { success: true, cultivated: true };
    }
  } catch (err: any) {
    return { success: false, cultivated: currentlyCultivated, error: err.message || String(err) };
  }
}

/**
 * Convert high-value discussion into a Community Article with contributor preservation
 */
export async function convertDiscussionToCommunityArticle(
  postId: string,
  teacherId: string,
  contributors: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("community_posts")
      .update({
        is_community_article: true,
        article_contributors: contributors,
        updated_at: new Date().toISOString(),
      })
      .eq("id", postId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

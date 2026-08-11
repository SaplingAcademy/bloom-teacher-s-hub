import { supabase } from "@/lib/supabase";

export interface SubjectGarden {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon: string;
}

export interface ThematicGarden {
  id: string;
  name: string;
  slug: string;
  category: string;
  icon: string;
}

export interface TeacherPreferences {
  teacher_id: string;
  preferred_content_language: string;
  preferred_ui_language: string;
  subjects_taught: string[];
}

export interface BloomLibraryArticle {
  id: string;
  post_id: string;
  title: string;
  summary: string;
  content: string;
  contributors: Array<{ name: string; avatar?: string }>;
  category: string;
  created_at: string;
}

export const DEFAULT_SUBJECT_GARDENS: SubjectGarden[] = [
  { id: "sg-en", name: "Inglês", slug: "english", category: "language", icon: "Globe" },
  { id: "sg-es", name: "Espanhol", slug: "spanish", category: "language", icon: "Globe" },
  { id: "sg-fr", name: "Francês", slug: "french", category: "language", icon: "Globe" },
  { id: "sg-it", name: "Italiano", slug: "italian", category: "language", icon: "Globe" },
  { id: "sg-de", name: "Alemão", slug: "german", category: "language", icon: "Globe" },
  { id: "sg-ja", name: "Japonês", slug: "japanese", category: "language", icon: "Globe" },
  { id: "sg-pt", name: "Português", slug: "portuguese", category: "language", icon: "Globe" },
  { id: "sg-ma", name: "Matemática", slug: "math", category: "science", icon: "BookOpen" },
  { id: "sg-pr", name: "Programação", slug: "programming", category: "science", icon: "Code" },
];

export const DEFAULT_THEMATIC_GARDENS: ThematicGarden[] = [
  { id: "tg-kids", name: "Crianças (Kids)", slug: "kids", category: "audience", icon: "User" },
  { id: "tg-teens", name: "Adolescentes (Teens)", slug: "teens", category: "audience", icon: "Users" },
  { id: "tg-adults", name: "Adultos", slug: "adults", category: "audience", icon: "UserCheck" },
  { id: "tg-business", name: "Inglês para Negócios", slug: "business", category: "methodology", icon: "Briefcase" },
  { id: "tg-conversation", name: "Conversação & Fluência", slug: "conversation", category: "methodology", icon: "MessageSquare" },
  { id: "tg-grammar", name: "Gramática Prática", slug: "grammar", category: "methodology", icon: "BookOpen" },
  { id: "tg-gamification", name: "Gamificação", slug: "gamification", category: "methodology", icon: "Sparkles" },
  { id: "tg-ai", name: "Inteligência Artificial", slug: "ai", category: "tech", icon: "Cpu" },
  { id: "tg-marketing", name: "Marketing & Leads", slug: "marketing", category: "business", icon: "TrendingUp" },
];

/**
 * Fetch Subject Gardens from DB or return fallback defaults
 */
export async function fetchSubjectGardens(): Promise<SubjectGarden[]> {
  try {
    const { data, error } = await supabase.from("subject_gardens").select("*").order("name");
    if (!error && data && data.length > 0) return data as SubjectGarden[];
  } catch (err) {
    console.warn("[community-ecosystem] Using default subject gardens fallback.");
  }
  return DEFAULT_SUBJECT_GARDENS;
}

/**
 * Fetch Thematic Gardens from DB or return fallback defaults
 */
export async function fetchThematicGardens(): Promise<ThematicGarden[]> {
  try {
    const { data, error } = await supabase.from("thematic_gardens").select("*").order("name");
    if (!error && data && data.length > 0) return data as ThematicGarden[];
  } catch (err) {
    console.warn("[community-ecosystem] Using default thematic gardens fallback.");
  }
  return DEFAULT_THEMATIC_GARDENS;
}

/**
 * Fetch followed garden IDs for teacher
 */
export async function fetchFollowedGardens(teacherId: string): Promise<Set<string>> {
  if (!teacherId) return new Set();
  try {
    const { data, error } = await supabase
      .from("teacher_gardens")
      .select("garden_id")
      .eq("teacher_id", teacherId);

    if (!error && data) {
      return new Set(data.map((row) => row.garden_id));
    }
  } catch (err) {
    console.error("[community-ecosystem] Error fetching teacher gardens:", err);
  }
  return new Set();
}

/**
 * Toggle follow/unfollow status for a garden
 */
export async function toggleFollowGarden(
  teacherId: string,
  gardenType: "subject" | "thematic",
  gardenId: string,
  currentlyFollowed: boolean
): Promise<{ success: boolean; followed: boolean; error?: string }> {
  if (!teacherId || !gardenId) return { success: false, followed: false, error: "Parâmetros inválidos" };

  try {
    if (currentlyFollowed) {
      const { error } = await supabase
        .from("teacher_gardens")
        .delete()
        .eq("teacher_id", teacherId)
        .eq("garden_type", gardenType)
        .eq("garden_id", gardenId);

      if (error) return { success: false, followed: true, error: error.message };
      return { success: true, followed: false };
    } else {
      const { error } = await supabase.from("teacher_gardens").insert({
        teacher_id: teacherId,
        garden_type: gardenType,
        garden_id: gardenId,
      });

      if (error) return { success: false, followed: false, error: error.message };
      return { success: true, followed: true };
    }
  } catch (err: any) {
    return { success: false, followed: currentlyFollowed, error: err.message || String(err) };
  }
}

/**
 * Fetch Bloom Library Articles
 */
export async function fetchBloomLibraryArticles(): Promise<BloomLibraryArticle[]> {
  try {
    const { data, error } = await supabase
      .from("bloom_library_articles")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data && data.length > 0) return data as BloomLibraryArticle[];
  } catch (err) {
    console.error("[community-ecosystem] Failed to fetch Bloom Library articles:", err);
  }
  return [];
}

/**
 * Scoring algorithm for "Meu Jardim" personalized feed
 */
export function scorePostForPersonalizedFeed(
  post: any,
  followedGardenIds: Set<string>,
  subjectsTaught: string[] = []
): number {
  let score = 0;

  // Match Subject Garden (+40)
  if (post.subject_garden_id && followedGardenIds.has(post.subject_garden_id)) {
    score += 40;
  }

  // Match Thematic Gardens (+20 per matched garden)
  if (post.thematic_garden_ids && Array.isArray(post.thematic_garden_ids)) {
    for (const tgId of post.thematic_garden_ids) {
      if (followedGardenIds.has(tgId)) score += 20;
    }
  }

  // Match subjects taught (+15)
  if (post.tags && Array.isArray(post.tags)) {
    for (const tag of post.tags) {
      if (subjectsTaught.some((st) => st.toLowerCase() === tag.toLowerCase())) {
        score += 15;
      }
    }
  }

  // Water count boost (+1 per regada)
  score += Math.min(30, post.waterCount || post.water_count || 0);

  // Accepted solution boost (+25)
  if (post.isAcceptedSolution || post.is_accepted_solution) {
    score += 25;
  }

  return score;
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  Sprout,
  Plus,
  MessageSquare,
  Bookmark,
  Share2,
  X,
  Sparkles,
  BookOpen,
  ArrowRight,
  Filter,
  Search,
  CheckCircle2,
  HelpCircle,
  Flower2,
  TreeDeciduous,
  Globe,
  Tag as TagIcon,
  RefreshCw,
  Sun,
  Award,
  Users,
  Compass,
  Cpu,
  User,
  Briefcase,
  Languages,
  History,
  Edit2,
  Trash2,
  Save,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  GardenPost,
  GrowthStage,
  getStageMeta,
  getDailyWateringStatus,
  waterIdea,
  toggleCultivateItem,
  convertDiscussionToCommunityArticle,
  DailyWateringStatus,
} from "@/lib/knowledge-garden";
import {
  SubjectGarden,
  ThematicGarden,
  BloomLibraryArticle,
  DEFAULT_SUBJECT_GARDENS,
  DEFAULT_THEMATIC_GARDENS,
  fetchSubjectGardens,
  fetchThematicGardens,
  fetchFollowedGardens,
  toggleFollowGarden,
  fetchBloomLibraryArticles,
  scorePostForPersonalizedFeed,
} from "@/lib/community-ecosystem";
import { analyzeAndAutoTagPost, AutoTagResult } from "@/lib/ai-autotagging";
import {
  editPostWithVersion,
  softDeletePost,
  saveCommunityDraft,
  fetchCommunityDraft,
  clearCommunityDraft,
} from "@/lib/community-persistence";
import { PostVersionHistoryModal } from "@/components/bloom/PostVersionHistoryModal";

export const Route = createFileRoute("/_app/community")({
  head: () => ({
    meta: [
      { title: "Ecossistema do Conhecimento · Comunidade Bloom" },
      {
        name: "description",
        content: "Espaço global colaborativo onde educadores cultivam, regam e compartilham saberes.",
      },
    ],
  }),
  component: CommunityEcosystemPage,
});

const DEFAULT_POSTS: GardenPost[] = [
  {
    id: "p1",
    authorName: "Profa. Maria Silva",
    category: "Question",
    title: "Como transicionar de Past Simple para Present Perfect com alunos adultos?",
    content:
      "Tenho uma turma de adultos que trava ao entender a diferença entre tempo definido e experiência de vida. Quais dinâmicas visuais ou jogos de linha do tempo vocês usam que realmente funcionam em sala?",
    tags: ["Gramática Prática", "Adultos", "Metodologia"],
    waterCount: 18,
    growthStage: "blooming",
    commentsCount: 3,
    timeAgo: "há 2 horas",
  },
  {
    id: "p2",
    authorName: "Prof. Lucas Meyer",
    category: "Tip",
    title: "Atividade de conversão: 1-Minute Pitch de Invenções Malucas",
    content:
      "Toda sexta faço o 'Pitch de 1 Minuto'. Os alunos sorteiam uma invenção absurda (ex: guarda-chuva solar) e têm 60 segundos para vender para a turma. Força o raciocínio direto em inglês sem tradução prévia!",
    tags: ["Conversação", "Fluência", "Atividade Prática"],
    waterCount: 34,
    growthStage: "favorite",
    commentsCount: 2,
    timeAgo: "há 4 horas",
  },
];

function CommunityEcosystemPage() {
  const { user } = useAuth();
  const teacherId = user?.id;

  const [subjectGardens, setSubjectGardens] = useState<SubjectGarden[]>(DEFAULT_SUBJECT_GARDENS);
  const [thematicGardens, setThematicGardens] = useState<ThematicGarden[]>(DEFAULT_THEMATIC_GARDENS);
  const [followedGardens, setFollowedGardens] = useState<Set<string>>(new Set(["sg-en", "tg-conversation"]));
  const [posts, setPosts] = useState<GardenPost[]>(DEFAULT_POSTS);
  const [activeView, setActiveView] = useState<"my_garden" | "blooming" | "discover" | "library" | "cultivated">("my_garden");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Translation & Version History Modals State
  const [showOriginalMap, setShowOriginalMap] = useState<Record<string, boolean>>({});
  const [historyPostId, setHistoryPostId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  // Daily Waterings Quota
  const [wateringStatus, setWateringStatus] = useState<DailyWateringStatus>({
    usedToday: 0,
    dailyLimit: 5,
    remainingToday: 5,
  });

  // Modal & AI Auto-Tagging State
  const [isNewIdeaOpen, setIsNewIdeaOpen] = useState(false);
  const [newIdeaForm, setNewIdeaForm] = useState({
    title: "",
    content: "",
    category: "Tip" as GardenPost["category"],
  });
  const [aiTagResult, setAiTagResult] = useState<AutoTagResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Draft Autosave Status Indicator
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Edit Modal State
  const [editingPost, setEditingPost] = useState<GardenPost | null>(null);
  const [editForm, setEditForm] = useState({ title: "", content: "", reason: "" });

  const loadEcosystemData = async () => {
    if (!teacherId) return;

    const quota = await getDailyWateringStatus(teacherId);
    setWateringStatus(quota);

    const sGardens = await fetchSubjectGardens();
    const tGardens = await fetchThematicGardens();
    setSubjectGardens(sGardens);
    setThematicGardens(tGardens);

    const followed = await fetchFollowedGardens(teacherId);
    if (followed.size > 0) setFollowedGardens(followed);

    try {
      const { data: dbPosts, error } = await supabase
        .from("community_posts")
        .select("*, profiles:author_id(full_name, avatar_url)")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (!error && dbPosts && dbPosts.length > 0) {
        const { data: teacherWaterings } = await supabase.from("idea_waterings").select("post_id").eq("teacher_id", teacherId);
        const { data: teacherCultivated } = await supabase.from("cultivated_items").select("post_id").eq("teacher_id", teacherId);

        const wateredIds = new Set((teacherWaterings || []).map((w) => w.post_id));
        const cultivatedIds = new Set((teacherCultivated || []).map((c) => c.post_id));

        const mapped: GardenPost[] = dbPosts.map((p: any) => ({
          id: p.id,
          authorId: p.author_id,
          authorName: p.profiles?.full_name || "Educador Bloom",
          authorAvatar: p.profiles?.avatar_url,
          category: p.category || "Tip",
          title: p.title,
          content: p.content,
          tags: p.tags || [],
          waterCount: p.water_count || p.likes_count || 0,
          growthStage: (p.growth_stage as GrowthStage) || getStageMeta(p.water_count || 0).id,
          commentsCount: 0,
          timeAgo: new Date(p.created_at).toLocaleDateString("pt-BR"),
          wateredByUser: wateredIds.has(p.id),
          cultivatedByUser: cultivatedIds.has(p.id),
          isAcceptedSolution: p.is_accepted_solution,
          isCommunityArticle: p.is_community_article,
          articleContributors: p.article_contributors || [],
          subject_garden_id: p.subject_garden_id,
          thematic_garden_ids: p.thematic_garden_ids || [],
        }));

        setPosts(mapped);
      }
    } catch (err) {
      console.error("[community-ecosystem] Error loading posts:", err);
    }
  };

  useEffect(() => {
    loadEcosystemData();
  }, [teacherId]);

  // Load saved draft when modal opens
  useEffect(() => {
    if (isNewIdeaOpen && teacherId) {
      fetchCommunityDraft(teacherId, "post").then((draft) => {
        if (draft && (draft.title || draft.content)) {
          setNewIdeaForm({
            title: draft.title || "",
            content: draft.content || "",
            category: "Tip",
          });
          toast.info("Rascunho restaurado!");
        }
      });
    }
  }, [isNewIdeaOpen, teacherId]);

  // Debounced Draft Autosave
  useEffect(() => {
    if (!isNewIdeaOpen || !teacherId) return;

    if (!newIdeaForm.title && !newIdeaForm.content) return;

    setDraftStatus("saving");
    const timer = setTimeout(async () => {
      await saveCommunityDraft(teacherId, "post", newIdeaForm.title, newIdeaForm.content);
      setDraftStatus("saved");
    }, 1000);

    return () => clearTimeout(timer);
  }, [newIdeaForm.title, newIdeaForm.content, isNewIdeaOpen, teacherId]);

  // AI Auto-Tagging Trigger
  useEffect(() => {
    if (newIdeaForm.title.length > 5 || newIdeaForm.content.length > 15) {
      const result = analyzeAndAutoTagPost(newIdeaForm.title, newIdeaForm.content);
      setAiTagResult(result);
    } else {
      setAiTagResult(null);
    }
  }, [newIdeaForm.title, newIdeaForm.content]);

  // Handle 🌱 Water Idea (Regar)
  const handleWaterPost = async (post: GardenPost) => {
    if (!teacherId) {
      toast.error("Por favor, faça login para regar esta ideia.");
      return;
    }

    if (post.wateredByUser) {
      toast.info("Você já regou esta ideia!");
      return;
    }

    if (wateringStatus.remainingToday <= 0) {
      toast.warning("Você usou suas 5 regadas de hoje!", {
        description: "Volte amanhã para cultivar mais ideias no ecossistema.",
      });
      return;
    }

    const res = await waterIdea(teacherId, post.id);

    if (res.success) {
      const newCount = res.waterCount ?? post.waterCount + 1;
      const newStage = res.growthStage ?? getStageMeta(newCount).id;

      toast.success("🌱 Ideia regada com sucesso!", {
        description: `Esta ideia agora possui ${newCount} regadas. Suas regadas hoje: ${res.usedToday}/5.`,
      });

      setWateringStatus((prev) => ({
        ...prev,
        usedToday: res.usedToday ?? prev.usedToday + 1,
        remainingToday: res.remainingToday ?? Math.max(0, prev.remainingToday - 1),
      }));

      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id ? { ...p, waterCount: newCount, growthStage: newStage, wateredByUser: true } : p
        )
      );
    } else if (res.limitReached) {
      toast.warning("Limite diário de regadas atingido!", { description: res.error });
    } else {
      toast.error(res.error || "Erro ao regar ideia.");
    }
  };

  // Handle Cultivar (Save into Meu Jardim)
  const handleCultivatePost = async (post: GardenPost) => {
    if (!teacherId) return;
    const nextState = !post.cultivatedByUser;
    const res = await toggleCultivateItem(teacherId, post.id, post.cultivatedByUser || false);

    if (res.success) {
      toast.success(nextState ? "🌻 Guardado em 'Meu Jardim'!" : "Removido de 'Meu Jardim'.");
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, cultivatedByUser: nextState } : p)));
    } else {
      toast.error("Erro ao atualizar Meu Jardim.");
    }
  };

  // Handle Create Idea with Draft Clearing
  const handleCreateIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId || !newIdeaForm.title.trim() || !newIdeaForm.content.trim()) return;

    setSubmitting(true);
    try {
      const finalTags = aiTagResult?.suggestedTags || ["Geral"];

      const { data: newPost, error } = await supabase
        .from("community_posts")
        .insert({
          author_id: teacherId,
          title: newIdeaForm.title.trim(),
          content: newIdeaForm.content.trim(),
          tags: finalTags,
          subject_garden_id: aiTagResult?.detectedSubjectGardenId || null,
          thematic_garden_ids: aiTagResult?.detectedThematicGardenIds || [],
          water_count: 0,
          growth_stage: "seedling",
        })
        .select("*")
        .single();

      if (error) {
        toast.error("Erro ao publicar: " + error.message);
      } else {
        toast.success("🌱 Ideia plantada com sucesso!");
        await clearCommunityDraft(teacherId, "post");
        setIsNewIdeaOpen(false);
        setNewIdeaForm({ title: "", content: "", category: "Tip" });
        setAiTagResult(null);
        loadEcosystemData();
      }
    } catch (err: any) {
      toast.error("Falha ao publicar ideia.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Post Transactionally with Versioning
  const handleSavePostEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !teacherId) return;

    setSubmitting(true);
    try {
      const res = await editPostWithVersion({
        postId: editingPost.id,
        teacherId,
        newTitle: editForm.title.trim(),
        newContent: editForm.content.trim(),
        editReason: editForm.reason.trim() || undefined,
      });

      if (res.success) {
        toast.success(`Publicação atualizada! Criada a Versão #${res.newVersionNumber}.`);
        setEditingPost(null);
        loadEcosystemData();
      } else if (res.concurrencyConflict) {
        toast.error(res.error || "Conflito de edição simultânea.");
      } else {
        toast.error(`Erro ao editar: ${res.error}`);
      }
    } catch (err: any) {
      toast.error("Falha na edição.");
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Soft Delete
  const handleSoftDelete = async (post: GardenPost) => {
    if (!teacherId) return;
    if (!window.confirm("Deseja realmente remover esta publicação? Ela poderá ser recuperada no histórico.")) return;

    const res = await softDeletePost(post.id, teacherId, "Removido pelo autor");
    if (res.success) {
      toast.success("Publicação removida com sucesso. Histórico preservado.");
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } else {
      toast.error(`Erro ao remover: ${res.error}`);
    }
  };

  // Filter posts
  const displayPosts = posts.filter((post) => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.tags?.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (selectedSubjectId && post.subject_garden_id && post.subject_garden_id !== selectedSubjectId) {
      return false;
    }

    if (activeView === "blooming") return post.waterCount >= 15 || post.growthStage === "blooming" || post.growthStage === "favorite";
    if (activeView === "library") return post.isCommunityArticle;
    if (activeView === "cultivated") return post.cultivatedByUser;

    return true;
  });

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow="Ecossistema de Conhecimento"
        title="Jardim do Conhecimento Bloom"
        description="Onde educadores de diferentes idiomas cultivam saberes, regam ideias práticas e registram snapshots imutáveis de cada edição."
        actions={
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              <Sprout className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{wateringStatus.remainingToday}/{wateringStatus.dailyLimit} regadas hoje</span>
            </div>

            <Button onClick={() => setIsNewIdeaOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="w-4 h-4" /> Plantar Ideia (com IA)
            </Button>
          </div>
        }
      />

      {/* VIEW TABS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por ideia ou metodologia..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <Button
            variant={activeView === "my_garden" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveView("my_garden")}
            className="h-8 text-xs gap-1.5"
          >
            🏡 Meu Jardim
          </Button>
          <Button
            variant={activeView === "blooming" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveView("blooming")}
            className="h-8 text-xs gap-1.5"
          >
            🌼 Ideias Florescendo
          </Button>
          <Button
            variant={activeView === "cultivated" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveView("cultivated")}
            className="h-8 text-xs gap-1.5 text-amber-600 dark:text-amber-400"
          >
            🌻 Cultivados por Mim
          </Button>
        </div>
      </div>

      {/* POSTS STREAM */}
      <div className="space-y-4">
        {displayPosts.map((post) => {
          const stageMeta = getStageMeta(post.waterCount, post.growthStage);
          const isAuthor = teacherId && post.authorId === teacherId;

          return (
            <div key={post.id} className={`rounded-xl border bg-card p-5 transition-all space-y-4 ${stageMeta.containerClass}`}>
              {/* Post Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-500/10 text-emerald-700 font-bold flex items-center justify-center text-sm border border-emerald-500/20">
                    {post.authorName ? post.authorName.substring(0, 2).toUpperCase() : "ED"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-card-foreground">
                        {post.authorId ? post.authorName : "Perfil indisponível"}
                      </span>
                      <span className="text-xs text-muted-foreground">• {post.timeAgo}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className={`text-[10px] px-2 py-0.5 gap-1 font-medium ${stageMeta.badgeClass}`}>
                        <span>{stageMeta.emoji}</span>
                        <span>{stageMeta.label}</span>
                      </Badge>

                      {/* History & Edit badges */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-primary gap-1"
                        onClick={() => {
                          setHistoryPostId(post.id);
                          setIsHistoryOpen(true);
                        }}
                      >
                        <History className="w-3 h-3" /> Ver histórico de versões
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Author Actions (Edit & Soft Delete) */}
                {isAuthor && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-card-foreground"
                      onClick={() => {
                        setEditingPost(post);
                        setEditForm({ title: post.title, content: post.content, reason: "" });
                      }}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => handleSoftDelete(post)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Title & Content */}
              <div className="space-y-2">
                <h3 className="font-bold text-base text-card-foreground">{post.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                  {post.content}
                </p>
              </div>

              {/* Action Bar — 🌱 Regar */}
              <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs">
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant={post.wateredByUser ? "secondary" : "outline"}
                    className={`h-8 text-xs gap-1.5 transition-all ${
                      post.wateredByUser ? "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" : "hover:text-emerald-600"
                    }`}
                    onClick={() => handleWaterPost(post)}
                  >
                    <Sprout className={`w-4 h-4 ${post.wateredByUser ? "text-emerald-600 fill-emerald-500/20" : ""}`} />
                    <span className="font-semibold">Regar</span>
                    <span className="ml-1 opacity-80">({post.waterCount})</span>
                  </Button>

                  <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-muted-foreground">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>{post.commentsCount || 0} contribuições</span>
                  </Button>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  className={`h-8 text-xs gap-1.5 ${post.cultivatedByUser ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}
                  onClick={() => handleCultivatePost(post)}
                >
                  <Flower2 className="w-3.5 h-3.5" />
                  <span>{post.cultivatedByUser ? "Cultivado em Meu Jardim" : "Cultivar"}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: New Idea with Autosave Indicator */}
      <Dialog open={isNewIdeaOpen} onOpenChange={setIsNewIdeaOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <Sprout className="w-5 h-5" /> Plantar Ideia com Auto-Tagging & Rascunho
              </DialogTitle>

              {draftStatus !== "idle" && (
                <Badge variant="outline" className="text-[10px] gap-1 font-normal">
                  {draftStatus === "saving" ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin text-amber-500" /> Salvando rascunho...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Rascunho salvo
                    </>
                  )}
                </Badge>
              )}
            </div>
          </DialogHeader>

          <form onSubmit={handleCreateIdea} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="post_title">Título da Ideia *</Label>
              <Input
                id="post_title"
                required
                placeholder="Ex: Como ensinar Phrasal Verbs de forma contextualizada?"
                value={newIdeaForm.title}
                onChange={(e) => setNewIdeaForm({ ...newIdeaForm, title: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="post_content">Detalhamento da Ideia *</Label>
              <Textarea
                id="post_content"
                required
                rows={4}
                placeholder="Explique o contexto, a metodologia e o impacto prático em sala..."
                value={newIdeaForm.content}
                onChange={(e) => setNewIdeaForm({ ...newIdeaForm, content: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsNewIdeaOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "Plantando..." : "Confirmar e Plantar Ideia"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Edit Post Transactionally */}
      {editingPost && (
        <Dialog open={!!editingPost} onOpenChange={() => setEditingPost(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-primary" /> Editar Publicação (Versão #{editingPost.waterCount ? editingPost.waterCount + 1 : 2})
              </DialogTitle>
              <DialogDescription>
                A versão anterior será preservada no histórico imutável antes da gravação.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSavePostEdit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Título *</Label>
                <Input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Conteúdo *</Label>
                <Textarea
                  required
                  rows={4}
                  value={editForm.content}
                  onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Motivo da Edição (Opcional)</Label>
                <Input
                  placeholder="Ex: Correção de texto e inclusão de exemplos..."
                  value={editForm.reason}
                  onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingPost(null)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Salvando Snapshot..." : "Salvar Edição"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal: Version History Snapshot Viewer */}
      <PostVersionHistoryModal
        postId={historyPostId}
        teacherId={teacherId}
        isAuthor={true}
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        onVersionRestored={() => loadEcosystemData()}
      />
    </div>
  );
}

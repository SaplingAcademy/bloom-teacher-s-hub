import { toast } from "sonner";
import { reportUserError } from "@/lib/user-error";
import { resolveTeacherName } from "@/lib/teacher-name";
import { useState, useEffect, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import {
  Globe,
  User,
  Award,
  BookOpen,
  MessageSquare,
  ThumbsUp,
  Heart,
  Calendar,
  Edit2,
  Trash2,
  ExternalLink,
  Github,
  Linkedin,
  Twitter,
  Link,
  ChevronRight,
  Eye,
  Pencil,
  Plus,
  Compass,
  Briefcase,
  Star,
  MapPin,
  Lock,
  MessageCircle,
  HelpCircle,
  Lightbulb,
  FileText,
  Clock,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/bloom/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({
    meta: [
      { title: "Profile · Bloom" },
      {
        name: "description",
        content: "Your professional presence on Bloom — reputation, contributions and credentials.",
      },
    ],
  }),
  component: ProfilePage,
});

const translations = {
  en: {
    langToggle: "PT",
    title: "Professional Profile",
    description:
      "Build your professional reputation, showcase your teaching credentials, and track your community standing.",
    editProfile: "Edit Profile",
    statisticsTitle: "Community Activity",
    rankingTitle: "Rank & Reputation",
    myPostsTitle: "My Discussions",
    myPostsSubtitle: "Manage your published community topics and answers.",
    postsCreated: "Posts Created",
    commentsCount: "Comments Written",
    helpfulAnswers: "Helpful Answers",
    likesReceived: "Likes Received",
    resourcesPublished: "Resources Published",
    rankingPosition: "Current Rank Pos.",
    communityScore: "Community Score",
    rank: "Community Rank",
    nextRank: "Next Rank",
    progress: "Progress to next rank",
    noPosts: "You haven't created any posts yet.",
    editPost: "Edit Discussion",
    deletePost: "Delete Discussion",
    viewPost: "View Discussion",
    editProfileTitle: "Edit Professional Credentials",
    fullName: "Full Name",
    headline: "Professional Headline",
    bio: "Short Biography",
    country: "Country",
    expertiseAreas: "Areas of Expertise",
    noExpertise: "No areas of expertise added yet.",
    addArea: "Add area",
    add: "Add",
    removeArea: "Remove",
    yearsExperience: "Years of Experience",
    yrs: "yrs",
    experience: "Years of Experience",
    socialLinks: "Social Links",
    saveChanges: "Save Changes",
    cancel: "Cancel",
    xp: "points",
    languagesTaught: "Languages taught",
    noLanguages: "No languages taught added yet.",
    noBio: "No bio added yet.",
    notRanked: "Not ranked yet",
    comingSoon: "Coming soon",
    postsCreated2: "Discussions published",
    watersReceived: "Waters received",
    commentsWritten: "Comments written",
    saveError: "Could not save your profile. Please try again.",
    postSaveError: "Could not save this discussion. Please try again.",
    loadError: "Could not load your community data.",
  },
  pt: {
    langToggle: "EN",
    title: "Perfil Profissional",
    description:
      "Construa sua reputação profissional, exiba suas credenciais de ensino e acompanhe sua reputação na comunidade.",
    editProfile: "Editar Perfil",
    statisticsTitle: "Atividade na Comunidade",
    rankingTitle: "Ranque & Reputação",
    myPostsTitle: "Minhas Discussões",
    myPostsSubtitle: "Gerencie seus tópicos e respostas publicados na comunidade.",
    postsCreated: "Posts Criados",
    commentsCount: "Comentários Escritos",
    helpfulAnswers: "Respostas Úteis",
    likesReceived: "Curtidas Recebidas",
    resourcesPublished: "Recursos Publicados",
    rankingPosition: "Posição no Ranque",
    communityScore: "Pontos de Reputação",
    rank: "Ranque na Comunidade",
    nextRank: "Próximo Ranque",
    progress: "Progresso para o próximo ranque",
    noPosts: "Você ainda não criou nenhuma discussão.",
    editPost: "Editar Discussão",
    deletePost: "Excluir Discussão",
    viewPost: "Ver Discussão",
    editProfileTitle: "Editar Credenciais Profissionais",
    fullName: "Nome Completo",
    headline: "Título Profissional",
    bio: "Breve Biografia",
    country: "País",
    expertiseAreas: "Áreas de Atuação",
    noExpertise: "Nenhuma área de atuação informada ainda.",
    addArea: "Adicionar área",
    add: "Adicionar",
    removeArea: "Remover",
    yearsExperience: "Anos de Experiência",
    yrs: "anos",
    experience: "Anos de Experiência",
    socialLinks: "Links Sociais",
    saveChanges: "Salvar Alterações",
    cancel: "Cancelar",
    xp: "pontos",
    languagesTaught: "Idiomas que leciona",
    noLanguages: "Nenhum idioma de ensino informado ainda.",
    noBio: "Nenhuma biografia adicionada ainda.",
    notRanked: "Ainda sem posição no ranque",
    comingSoon: "Em breve",
    postsCreated2: "Discussões publicadas",
    watersReceived: "Regadas recebidas",
    commentsWritten: "Comentários escritos",
    saveError: "Não foi possível salvar o perfil. Tente novamente.",
    postSaveError: "Não foi possível salvar a discussão. Tente novamente.",
    loadError: "Não foi possível carregar seus dados da comunidade.",
  },
};

function ProfilePage() {
  const { lang, setLang, t: tr } = useLanguage();
  const { user, profile: authProfile, retryProfileSync } = useAuth();
  const t = translations[lang];

  const profile = {
    name: resolveTeacherName(authProfile, user) || "",
    photo: (authProfile?.avatar_url as string) || "",
    bio: (authProfile?.bio as string) || "",
    languagesTaught: (Array.isArray(authProfile?.languages_taught)
      ? authProfile.languages_taught
      : []) as string[],
    preferred_language: (authProfile?.locale as string) || (authProfile?.preferred_language as string) || "",
    timezone: (authProfile?.timezone as string) || "",
    headline: (authProfile?.professional_headline as string) || "",
    country: (authProfile?.country as string) || "",
    yearsExperience:
      authProfile?.years_experience === null || authProfile?.years_experience === undefined
        ? null
        : Number(authProfile.years_experience),
    expertiseAreas: (Array.isArray(authProfile?.expertise_areas)
      ? authProfile.expertise_areas
      : []) as string[],
  };

  const [posts, setPosts] = useState<any[]>([]);
  const [points, setPoints] = useState(0);
  const [rankPosition, setRankPosition] = useState<number | null>(null);
  const [commentsWritten, setCommentsWritten] = useState(0);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editBio, setEditBio] = useState(profile.bio);
  const [editPhoto, setEditPhoto] = useState(profile.photo);
  const [editLanguage, setEditLanguage] = useState(profile.preferred_language || "pt-BR");
  const [editTimezone, setEditTimezone] = useState(profile.timezone || "America/Sao_Paulo");
  const [editHeadline, setEditHeadline] = useState(profile.headline);
  const [editCountry, setEditCountry] = useState(profile.country);
  const [editYears, setEditYears] = useState(
    profile.yearsExperience === null ? "" : String(profile.yearsExperience),
  );
  const [editExpertise, setEditExpertise] = useState<string[]>(profile.expertiseAreas);
  const [newExpertise, setNewExpertise] = useState("");

  const resetForm = useCallback(() => {
    setEditName(resolveTeacherName(authProfile, user) || "");
    setEditPhoto((authProfile?.avatar_url as string) || "");
    setEditBio((authProfile?.bio as string) || "");
    setEditLanguage((authProfile?.locale as string) || "pt-BR");
    setEditTimezone((authProfile?.timezone as string) || "America/Sao_Paulo");
    setEditHeadline((authProfile?.professional_headline as string) || "");
    setEditCountry((authProfile?.country as string) || "");
    const yrs = authProfile?.years_experience;
    setEditYears(yrs === null || yrs === undefined ? "" : String(yrs));
    setEditExpertise(Array.isArray(authProfile?.expertise_areas) ? authProfile.expertise_areas : []);
    setNewExpertise("");
  }, [authProfile, user]);

  useEffect(() => {
    if (authProfile) resetForm();
  }, [authProfile, resetForm]);

  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostContent, setEditPostContent] = useState("");
  const [viewingPost, setViewingPost] = useState<any | null>(null);

  const userId = user?.id;

  const loadCommunity = useCallback(async () => {
    if (!userId) return;
    const [postsRes, rankRes, rankRpcRes, commentsRes] = await Promise.all([
      supabase
        .from("community_posts")
        .select("id, title, content, tags, created_at, updated_at")
        .eq("author_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("ranking").select("points").eq("teacher_id", userId).maybeSingle(),
      supabase.rpc("get_community_leaderboard", { period_type: "all", result_limit: 1000 }),
      supabase.from("comments").select("id", { count: "exact", head: true }).eq("author_id", userId),
    ]);
    if (postsRes.error || rankRes.error) {
      reportUserError(postsRes.error || rankRes.error, t.loadError);
    }
    const rows = (postsRes.data || []) as any[];
    const ids = rows.map((r) => r.id);
    const waters: Record<string, number> = {};
    const commentCounts: Record<string, number> = {};
    if (ids.length > 0) {
      const [rx, cm] = await Promise.all([
        supabase.from("reactions").select("post_id").eq("type", "water").in("post_id", ids),
        supabase.from("comments").select("post_id").in("post_id", ids),
      ]);
      (rx.data || []).forEach((r: any) => (waters[r.post_id] = (waters[r.post_id] || 0) + 1));
      (cm.data || []).forEach((c: any) => (commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1));
    }
    setPosts(
      rows.map((r) => ({
        ...r,
        waterCount: waters[r.id] || 0,
        commentsCount: commentCounts[r.id] || 0,
      })),
    );
    const pts = Number(rankRes.data?.points ?? 0);
    setPoints(pts);
    const leaderboard = (rankRpcRes.data || []) as Array<{ teacher_id: string; ranking_position: number }>;
    const mine = leaderboard.find((row) => row.teacher_id === userId);
    const pos = mine ? Number(mine.ranking_position) : null;
    setRankPosition(pts > 0 && pos !== null && Number.isFinite(pos) && pos > 0 ? pos : null);
    setCommentsWritten(commentsRes.count ?? 0);
  }, [userId, t.loadError]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  const handleAddExpertise = () => {
    const value = newExpertise.trim();
    if (!value) return;
    if (!editExpertise.some((a) => a.toLowerCase() === value.toLowerCase())) {
      setEditExpertise([...editExpertise, value]);
    }
    setNewExpertise("");
  };

  const handleRemoveExpertise = (area: string) => {
    setEditExpertise(editExpertise.filter((a) => a !== area));
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const targetLang = editLanguage.startsWith("pt") ? "pt" : "en";
    const yearsValue = editYears.trim() === "" ? null : Number.parseInt(editYears.trim(), 10);
    const years = yearsValue === null || Number.isNaN(yearsValue) ? null : Math.min(Math.max(yearsValue, 0), 80);
    const payload = {
      full_name: editName.trim() || null,
      avatar_url: editPhoto || null,
      bio: editBio.trim() || null,
      locale: editLanguage,
      timezone: editTimezone,
      professional_headline: editHeadline.trim() || null,
      country: editCountry.trim() || null,
      years_experience: years,
      expertise_areas: editExpertise.length > 0 ? editExpertise : null,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
    if (error) {
      toast.error(reportUserError(error, t.saveError));
      return;
    }
    setLang(targetLang);
    setIsEditOpen(false);
    retryProfileSync();
  };

  const handleCancelProfileEdit = () => {
    resetForm();
    setIsEditOpen(false);
  };

  const handleStartEditPost = (post: any) => {
    setEditingPost(post);
    setEditPostTitle(post.title);
    setEditPostContent(post.content || "");
  };

  const handleSaveEditPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost || !userId) return;
    const { error } = await supabase
      .from("community_posts")
      .update({ title: editPostTitle, content: editPostContent })
      .eq("id", editingPost.id)
      .eq("author_id", userId);
    if (error) {
      toast.error(reportUserError(error, t.postSaveError));
      return;
    }
    setEditingPost(null);
    loadCommunity();
  };

  const myDiscussions = posts;
  const watersReceived = posts.reduce((sum, p) => sum + (p.waterCount || 0), 0);
  const formatDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US") : "";

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <PageHeader title={t.title} description={t.description} />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: Profile Header & Specialties */}
        <div className="lg:col-span-2 space-y-6">
          {/* PROFILE HEADER CARD */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] flex flex-col md:flex-row gap-6 relative items-start">
            <div className="relative shrink-0 self-center md:self-start">
              {profile.photo ? (
                <img
                  src={profile.photo}
                  alt={profile.name}
                  className="h-28 w-28 rounded-2xl object-cover border border-border/80 shadow-inner"
                />
              ) : (
                <div className="h-28 w-28 rounded-2xl bg-gradient-lilac flex items-center justify-center font-display text-3xl font-extrabold text-lilac-foreground border border-border/80">
                  {(profile.name || "?")
                    .split(" ")
                    .map((n: string) => n[0])
                    .join("")
                    .toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-3 flex-1">
              <div>
                <h2 className="font-display text-2xl font-extrabold text-foreground">
                  {profile.name}
                </h2>
                {profile.headline && (
                  <p className="text-sm font-medium text-muted-foreground mt-0.5">
                    {profile.headline}
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted-foreground mt-2 font-medium">
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {profile.preferred_language.startsWith("pt")
                      ? tr("auditUi.portuguese")
                      : tr("auditUi.english")}
                  </span>
                  {profile.country && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {profile.country}
                    </span>
                  )}
                  {profile.yearsExperience !== null && (
                    <span className="flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      {profile.yearsExperience} {t.yrs}
                    </span>
                  )}
                  {profile.timezone && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {profile.timezone}
                    </span>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {profile.bio || <span className="italic">{t.noBio}</span>}
              </p>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                  {t.languagesTaught}
                </span>
                {profile.languagesTaught.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.languagesTaught.map((l, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] py-0 px-2 font-bold bg-secondary/80">
                        {l}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t.noLanguages}</p>
                )}
              </div>

              <div className="space-y-2 pt-2 border-t border-border/50">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                  {t.expertiseAreas}
                </span>
                {profile.expertiseAreas.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.expertiseAreas.map((area, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px] py-0 px-2 font-bold bg-secondary/80">
                        {area}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t.noExpertise}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsEditOpen(true)}
              className="absolute top-4 right-4 inline-flex h-8 items-center gap-1 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer shadow-sm"
            >
              <Edit2 className="h-3 w-3" />
              <span>{t.editProfile}</span>
            </button>
          </div>

          {/* FUTURE-READY visual roadmap sections */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex border-b border-border/60 pb-1 overflow-x-auto gap-4">
              <span className="text-xs font-semibold text-muted-foreground/60 pb-2 shrink-0 cursor-not-allowed flex items-center gap-1">
                {tr("auditUi.achievementsBadges")}
                <Lock className="h-2.5 w-2.5" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground/60 pb-2 shrink-0 cursor-not-allowed flex items-center gap-1">
                {tr("auditUi.portfolioLessons")}
                <Lock className="h-2.5 w-2.5" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground/60 pb-2 shrink-0 cursor-not-allowed flex items-center gap-1">
                {tr("auditUi.studentReviews")}
                <Lock className="h-2.5 w-2.5" />
              </span>
            </div>

            <div className="mt-5 text-center py-6 border border-dashed border-border rounded-xl">
              <Lock className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground font-medium">{t.comingSoon}</p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Statistics & Ranking */}
        <div className="space-y-6">
          {/* RANK & REPUTATION CARD */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] flex flex-col justify-between">
            <div className="flex items-center gap-2 pb-4 border-b border-border/60">
              <Award className="h-5 w-5 text-primary" />
              <h3 className="font-display text-lg font-bold text-foreground">{t.rankingTitle}</h3>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t.rank}
                </p>
                {rankPosition ? (
                  <p className="text-3xl font-extrabold text-primary mt-1">#{rankPosition}</p>
                ) : (
                  <p className="text-sm font-semibold text-muted-foreground mt-1">{t.notRanked}</p>
                )}
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t.communityScore}
                </p>
                <p className="text-2xl font-extrabold text-foreground mt-1">
                  {points.toLocaleString(lang === "pt" ? "pt-BR" : "en-US")}{" "}
                  <span className="text-xs font-medium text-muted-foreground">{t.xp}</span>
                </p>
              </div>
            </div>
          </div>

          {/* COMMUNITY IMPACT STATISTICS CARD */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 pb-4 border-b border-border/60">
              <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-display text-lg font-bold text-foreground">
                {tr("auditUi.communityImpact")}
              </h3>
            </div>

            <ul className="mt-4 divide-y divide-border/40 text-xs font-semibold">
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground">{t.postsCreated2}</span>
                <span className="text-foreground font-bold text-sm">{posts.length}</span>
              </li>
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span>🌱</span> {t.watersReceived}
                </span>
                <span className="text-primary font-extrabold text-sm">{watersReceived}</span>
              </li>
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground">{t.commentsWritten}</span>
                <span className="text-foreground font-bold text-sm">{commentsWritten}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* MY POSTS & PUBLICATION HISTORY */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">
              {tr("auditUi.teacherPublicationHistory")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr("auditUi.allYourQuestionsTipsResourcesAndCommunity")}
            </p>
          </div>
        </div>

        {myDiscussions.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-border rounded-xl">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground font-medium">{t.noPosts}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs font-semibold">
              <thead>
                <tr className="border-b border-border/80 text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                  <th className="pb-3 pl-2">{tr("auditUi.publicationTitle")}</th>
                  <th className="pb-3 text-center">{tr("auditUi.waterings")}</th>
                  <th className="pb-3 text-right pr-2">{tr("auditUi.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {myDiscussions.map((post) => (
                  <tr key={post.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="py-3.5 pl-2 max-w-sm">
                      <div className="flex items-center gap-1.5">
                        <p
                          className="font-bold text-sm text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                          onClick={() => setViewingPost(post)}
                        >
                          {post.title}
                        </p>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">
                        {formatDate(post.created_at)}
                      </p>
                    </td>
                    <td className="py-3.5 text-center font-bold text-primary">
                      🌱 {post.waterCount || 0}
                    </td>
                    <td className="py-3.5 text-right pr-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setViewingPost(post)}
                          className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors cursor-pointer"
                          title={t.viewPost}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleStartEditPost(post)}
                          className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-secondary transition-colors cursor-pointer"
                          title={t.editPost}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT PROFILE MODAL */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg rounded-2xl p-6 overflow-y-auto max-h-[85vh]">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {t.editProfileTitle}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveProfile} className="space-y-4 pt-3">
            <div className="grid gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-name" className="text-xs font-semibold text-foreground">
                  {t.fullName}
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>

            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-bio" className="text-xs font-semibold text-foreground">
                {t.bio}
              </Label>
              <Input
                id="edit-bio"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-headline" className="text-xs font-semibold text-foreground">
                {t.headline}
              </Label>
              <Input
                id="edit-headline"
                value={editHeadline}
                onChange={(e) => setEditHeadline(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-country" className="text-xs font-semibold text-foreground">
                  {t.country}
                </Label>
                <Input
                  id="edit-country"
                  value={editCountry}
                  onChange={(e) => setEditCountry(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="edit-years" className="text-xs font-semibold text-foreground">
                  {t.yearsExperience}
                </Label>
                <Input
                  id="edit-years"
                  type="number"
                  min={0}
                  max={80}
                  value={editYears}
                  onChange={(e) => setEditYears(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-expertise" className="text-xs font-semibold text-foreground">
                {t.expertiseAreas}
              </Label>
              {editExpertise.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {editExpertise.map((area) => (
                    <Badge
                      key={area}
                      variant="secondary"
                      className="text-[10px] py-0.5 px-2 font-bold bg-secondary/80 gap-1"
                    >
                      {area}
                      <button
                        type="button"
                        onClick={() => handleRemoveExpertise(area)}
                        aria-label={t.removeArea}
                        className="ml-0.5 rounded-full hover:bg-background/60 cursor-pointer"
                      >
                        ×
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  id="edit-expertise"
                  value={newExpertise}
                  onChange={(e) => setNewExpertise(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddExpertise();
                    }
                  }}
                  placeholder={t.addArea}
                  className="h-10 rounded-xl flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddExpertise}
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t.add}
                </button>
              </div>
            </div>

            <div className="space-y-2 border-t border-border/50 pt-3">
              <h4 className="text-xs font-bold text-foreground">
                {tr("auditUi.systemPreferences")}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-language" className="text-xs font-semibold text-foreground">
                    {tr("auditUi.preferredLanguage")}
                  </Label>
                  <select
                    id="edit-language"
                    value={editLanguage}
                    onChange={(e) => setEditLanguage(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="pt-BR">Português (pt-BR)</option>
                    <option value="en-US">English (en-US)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="edit-timezone" className="text-xs font-semibold text-foreground">
                    {tr("auditUi.timezone")}
                  </Label>
                  <select
                    id="edit-timezone"
                    value={editTimezone}
                    onChange={(e) => setEditTimezone(e.target.value)}
                    className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                    <option value="America/New_York">New York (EST/EDT)</option>
                    <option value="Europe/London">London (GMT/BST)</option>
                    <option value="Europe/Paris">Paris (CET/CEST)</option>
                    <option value="Asia/Tokyo">Tokyo (JST)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4 mt-2">
              <button
                type="button"
                onClick={handleCancelProfileEdit}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:bg-primary/95 cursor-pointer shadow-sm px-4"
              >
                {t.saveChanges}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* EDIT DISCUSSION MODAL */}
      <Dialog open={editingPost !== null} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-lg rounded-2xl p-6">
          <DialogHeader className="border-b border-border/60 pb-3">
            <DialogTitle className="font-display text-lg font-bold text-foreground">
              {t.editPost}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSaveEditPost} className="space-y-4 pt-3">
            <div className="space-y-1">
              <Label htmlFor="edit-post-title" className="text-xs font-semibold text-foreground">
                {tr("auditUi.title")}
              </Label>
              <Input
                id="edit-post-title"
                value={editPostTitle}
                onChange={(e) => setEditPostTitle(e.target.value)}
                required
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-post-content" className="text-xs font-semibold text-foreground">
                {tr("auditUi.content")}
              </Label>
              <textarea
                id="edit-post-content"
                value={editPostContent}
                onChange={(e) => setEditPostContent(e.target.value)}
                rows={5}
                required
                className="w-full rounded-xl border border-input bg-background p-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-4 mt-2">
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
              >
                {t.cancel}
              </button>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-sm transition-all hover:bg-primary/95 cursor-pointer shadow-sm px-4"
              >
                {t.saveChanges}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* VIEW DISCUSSION MODAL */}
      <Dialog open={viewingPost !== null} onOpenChange={(open) => !open && setViewingPost(null)}>
        <DialogContent className="max-w-xl rounded-2xl p-6 overflow-y-auto max-h-[85vh]">
          {viewingPost && (
            <div className="space-y-4">
              <DialogHeader className="border-b border-border/60 pb-3 flex flex-row items-center justify-between gap-4">
                <DialogTitle className="font-display text-lg font-bold text-foreground">
                  {viewingPost.title}
                </DialogTitle>
                <Badge
                  variant="secondary"
                  className="text-[10px] shrink-0 font-bold bg-secondary/80"
                >
                  {(viewingPost.tags || []).join(", ")}
                </Badge>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-lilac flex items-center justify-center font-display text-[9px] font-extrabold text-lilac-foreground">
                    {(profile.name || "?").substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-foreground">{profile.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    • {formatDate(viewingPost.created_at)}
                  </span>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/20 p-4 rounded-xl border border-border/50">
                  {viewingPost.content}
                </p>

                <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground pt-1">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5 text-primary" />
                    🌱 {viewingPost.waterCount || 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {viewingPost.commentsCount || 0} {tr("auditUi.comments")}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-border/50 pt-4 mt-4">
                <DialogClose asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-secondary px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary/80 cursor-pointer"
                  >
                    {tr("auditUi.close")}
                  </button>
                </DialogClose>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState, useEffect } from "react";
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

interface ProfileData {
  photo: string;
  name: string;
  headline: string;
  bio: string;
  country: string;
  teachingAreas: string[];
  subjectsTaught: string[];
  experience: number;
  linkedin: string;
  twitter: string;
  github: string;
  website: string;
}

const defaultProfile: ProfileData = {
  photo: "",
  name: "Mariana Ramos",
  headline: "Senior ESL & English Language Coach",
  bio: "Passionate educator with over 8 years of experience. Specializing in curriculum development, communicative methodologies, and student-centered coaching. Helping learners achieve professional fluency.",
  country: "Brazil",
  teachingAreas: ["Adult Education", "Business English", "Exam Preparation"],
  subjectsTaught: ["General English", "Professional Writing", "IELTS / TOEFL Prep"],
  experience: 8,
  linkedin: "https://linkedin.com/in/marianaramos",
  twitter: "https://twitter.com/marianaramos",
  github: "",
  website: "https://marianaramos.bloom.im",
};

const defaultPosts = [
  {
    id: "p1",
    authorName: "Maria Silva",
    category: "Question",
    title: "How do you teach Present Perfect to beginners?",
    content:
      "I have a class of adult Spanish speakers who are struggling with the transition between past simple and present perfect. Any specific timeline diagrams or games that have worked well for you?",
    tags: ["Grammar", "Adults", "Spanish Speakers"],
    likes: 12,
    commentsCount: 3,
    timeAgo: "2 hours ago",
  },
  {
    id: "p2",
    authorName: "Lucas Meyer",
    category: "Tip",
    title: "A speaking activity my students absolutely love",
    content:
      "I started doing '1-Minute Elevator Pitches' where students receive a random crazy invention (e.g. solar-powered umbrella) and have to sell it to the class in exactly 60 seconds. It forces them to bypass translation and speak dynamically!",
    tags: ["Speaking", "Fluency", "Icebreaker"],
    likes: 24,
    commentsCount: 1,
    timeAgo: "4 hours ago",
  },
];

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
    teachingAreas: "Teaching Areas (comma separated)",
    subjectsTaught: "Subjects Taught (comma separated)",
    experience: "Years of Experience (years)",
    socialLinks: "Social Links",
    saveChanges: "Save Changes",
    cancel: "Cancel",
    xp: "XP",
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
    teachingAreas: "Áreas de Atuação (separadas por vírgula)",
    subjectsTaught: "Disciplinas Lecionadas (separadas por vírgula)",
    experience: "Anos de Experiência (anos)",
    socialLinks: "Links Sociais",
    saveChanges: "Salvar Alterações",
    cancel: "Cancelar",
    xp: "XP",
  },
};

function ProfilePage() {
  const { lang, setLang } = useLanguage();
  const { user, profile: authProfile, retryProfileSync } = useAuth();
  const [localProfile, setLocalProfile] = useState<ProfileData>(() => {
    const saved = localStorage.getItem("bloom.profile.data");
    return saved ? JSON.parse(saved) : defaultProfile;
  });

  const profile = {
    ...localProfile,
    name: (authProfile?.full_name as string) || localProfile.name,
    photo: (authProfile?.avatar_url as string) || localProfile.photo,
    preferred_language: (authProfile?.preferred_language as string) || "pt-BR",
    timezone: (authProfile?.timezone as string) || "America/Sao_Paulo",
  };

  const [posts, setPosts] = useState<any[]>([]);

  // Edit Profile States
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState(profile.name);
  const [editHeadline, setEditHeadline] = useState(profile.headline);
  const [editBio, setEditBio] = useState(profile.bio);
  const [editCountry, setEditCountry] = useState(profile.country);
  const [editAreas, setEditAreas] = useState(profile.teachingAreas.join(", "));
  const [editSubjects, setEditSubjects] = useState(profile.subjectsTaught.join(", "));
  const [editExperience, setEditExperience] = useState(profile.experience);
  const [editLinkedin, setEditLinkedin] = useState(profile.linkedin);
  const [editTwitter, setEditTwitter] = useState(profile.twitter);
  const [editGithub, setEditGithub] = useState(profile.github);
  const [editWebsite, setEditWebsite] = useState(profile.website);
  const [editPhoto, setEditPhoto] = useState(profile.photo);
  const [editLanguage, setEditLanguage] = useState(profile.preferred_language || "pt-BR");
  const [editTimezone, setEditTimezone] = useState(profile.timezone || "America/Sao_Paulo");

  // Sync form states with database profile
  useEffect(() => {
    if (authProfile) {
      setEditName(authProfile.full_name || "");
      setEditPhoto(authProfile.avatar_url || "");
      setEditLanguage(authProfile.preferred_language || "pt-BR");
      setEditTimezone(authProfile.timezone || "America/Sao_Paulo");
    }
  }, [authProfile]);

  // Edit Discussion States
  const [editingPost, setEditingPost] = useState<any | null>(null);
  const [editPostTitle, setEditPostTitle] = useState("");
  const [editPostContent, setEditPostContent] = useState("");

  // View Discussion Modal
  const [viewingPost, setViewingPost] = useState<any | null>(null);

  const t = translations[lang];

  // Seeding post and loading list from shared community posts database
  useEffect(() => {
    const stored = localStorage.getItem("bloom.community.posts");
    let currentPosts = [];
    if (stored) {
      currentPosts = JSON.parse(stored);
    } else {
      currentPosts = [...defaultPosts];
    }

    const userHasPosts = currentPosts.some(
      (p: any) =>
        p.authorName === "You (Teacher)" ||
        p.authorName === "Você (Professor)" ||
        p.authorName === profile.name,
    );

    if (!userHasPosts) {
      const seedPost = {
        id: "p-my-seed",
        authorName: "You (Teacher)",
        category: "Tip" as const,
        title: "Designing Interactive Lesson Slides that Boost Engagement",
        content:
          "I started using collaborative slide templates where students match items and drag-and-drop elements during live online sessions. It significantly improved camera-on time and talking time!",
        tags: ["Engagement", "Online Teaching", "Methodology"],
        likes: 18,
        commentsCount: 2,
        timeAgo: "2 days ago",
        commentsList: [
          {
            id: "cm-1",
            authorName: "Lucas Meyer",
            content: "This works incredibly well. Drag-and-drop keeps their attention focused.",
            timeAgo: "1 day ago",
          },
        ],
      };
      currentPosts = [seedPost, ...currentPosts];
      localStorage.setItem("bloom.community.posts", JSON.stringify(currentPosts));
    }
    setPosts(currentPosts);
  }, [profile.name]);

  // Save profile changes
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: ProfileData = {
      photo: editPhoto,
      name: editName,
      headline: editHeadline,
      bio: editBio,
      country: editCountry,
      teachingAreas: editAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      subjectsTaught: editSubjects
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      experience: Number(editExperience) || 0,
      linkedin: editLinkedin,
      twitter: editTwitter,
      github: editGithub,
      website: editWebsite,
    };
    setLocalProfile(updated);
    localStorage.setItem("bloom.profile.data", JSON.stringify(updated));
    setIsEditOpen(false);

    // Call setLang so language context updates immediately across the whole app
    const targetLang = editLanguage.startsWith("pt") ? "pt" : "en";
    setLang(targetLang);

    // Sync to database if user is logged in
    if (user?.id) {
      console.log("[Profile] Syncing updated profile to Supabase database...");
      const payload = {
        full_name: editName,
        avatar_url: editPhoto,
        preferred_language: editLanguage,
        locale: editLanguage,
        timezone: editTimezone,
      };

      Promise.all([
        supabase.from("profiles").update(payload).eq("id", user.id),
        supabase.from("teacher_profiles").update(payload).eq("id", user.id),
      ]).then(([res1, res2]) => {
        if (res1.error && res2.error) {
          console.error("[Profile] Database update error:", res1.error || res2.error);
        } else {
          console.log("[Profile] Database update successful.");
          retryProfileSync();
        }
      });
    }
  };

  // Sync state variables back if modal was cancelled
  const handleCancelProfileEdit = () => {
    setEditPhoto(profile.photo);
    setEditName(profile.name);
    setEditLanguage(profile.preferred_language || "pt-BR");
    setEditTimezone(profile.timezone || "America/Sao_Paulo");
    setEditHeadline(profile.headline);
    setEditBio(profile.bio);
    setEditCountry(profile.country);
    setEditAreas(profile.teachingAreas.join(", "));
    setEditSubjects(profile.subjectsTaught.join(", "));
    setEditExperience(profile.experience);
    setEditLinkedin(profile.linkedin);
    setEditTwitter(profile.twitter);
    setEditGithub(profile.github);
    setEditWebsite(profile.website);
    setIsEditOpen(false);
  };

  // CRUD on Posts
  const handleDeletePost = (postId: string) => {
    if (
      confirm(
        lang === "pt"
          ? "Tem certeza que deseja excluir esta discussão?"
          : "Are you sure you want to delete this discussion?",
      )
    ) {
      const updated = posts.filter((p: any) => p.id !== postId);
      setPosts(updated);
      localStorage.setItem("bloom.community.posts", JSON.stringify(updated));
    }
  };

  const handleStartEditPost = (post: any) => {
    setEditingPost(post);
    setEditPostTitle(post.title);
    setEditPostContent(post.content || "");
  };

  const handleSaveEditPost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPost) return;
    const updated = posts.map((p: any) => {
      if (p.id === editingPost.id) {
        return {
          ...p,
          title: editPostTitle,
          content: editPostContent,
        };
      }
      return p;
    });
    setPosts(updated);
    localStorage.setItem("bloom.community.posts", JSON.stringify(updated));
    setEditingPost(null);
  };

  // Filters posts to only display user created discussions
  const myDiscussions = posts.filter(
    (p: any) =>
      p.authorName === "You (Teacher)" ||
      p.authorName === "Você (Professor)" ||
      p.authorName === profile.name,
  );

  // Dynamic user statistics calculation
  const myPostsCount = myDiscussions.length;
  const myCommentsCount = 12; // Static base + simulated
  const helpfulAnswers = 8;
  const likesReceived = myDiscussions.reduce((sum, p) => sum + (p.likes || 0), 0) + 42; // Dynamic + base
  const resourcesPublished = 3;

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
                  {profile.name
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
                <p className="text-sm font-semibold text-primary mt-0.5">{profile.headline}</p>
                <div className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted-foreground mt-2 font-medium">
                  <span className="flex items-center gap-1">
                    <Globe className="h-3.5 w-3.5" />
                    {profile.country}
                  </span>
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    {profile.experience} {lang === "pt" ? "anos de exp." : "years exp."}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {profile.preferred_language === "pt-BR"
                      ? lang === "pt"
                        ? "Português"
                        : "Portuguese"
                      : lang === "pt"
                        ? "Inglês"
                        : "English"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {profile.timezone}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{profile.bio}</p>

              {/* Badges areas */}
              <div className="space-y-2 pt-2 border-t border-border/50">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                    {lang === "pt" ? "Áreas de Atuação" : "Teaching Areas"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.teachingAreas.map((area, idx) => (
                      <Badge
                        key={idx}
                        variant="secondary"
                        className="text-[10px] py-0 px-2 font-bold bg-secondary/80"
                      >
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">
                    {lang === "pt" ? "Disciplinas Lecionadas" : "Subjects Taught"}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.subjectsTaught.map((sub, idx) => (
                      <Badge
                        key={idx}
                        variant="outline"
                        className="text-[10px] py-0 px-2 font-semibold"
                      >
                        {sub}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Social Links */}
              <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-border/50">
                {profile.linkedin && (
                  <a
                    href={profile.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                    LinkedIn
                  </a>
                )}
                {profile.twitter && (
                  <a
                    href={profile.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Twitter className="h-3.5 w-3.5" />
                    Twitter
                  </a>
                )}
                {profile.github && (
                  <a
                    href={profile.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Github className="h-3.5 w-3.5" />
                    GitHub
                  </a>
                )}
                {profile.website && (
                  <a
                    href={profile.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Link className="h-3.5 w-3.5" />
                    Website
                  </a>
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
              <span className="text-xs font-bold text-primary border-b-2 border-primary pb-2 shrink-0 cursor-pointer">
                {lang === "pt" ? "Conquistas & Selos" : "Achievements & Badges"}
              </span>
              <span className="text-xs font-semibold text-muted-foreground/60 pb-2 shrink-0 cursor-not-allowed flex items-center gap-1">
                {lang === "pt" ? "Portfólio & Aulas" : "Portfolio & Lessons"}
                <Lock className="h-2.5 w-2.5" />
              </span>
              <span className="text-xs font-semibold text-muted-foreground/60 pb-2 shrink-0 cursor-not-allowed flex items-center gap-1">
                {lang === "pt" ? "Avaliações de Alunos" : "Student Reviews"}
                <Lock className="h-2.5 w-2.5" />
              </span>
            </div>

            {/* Achievements Content */}
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-border/70 p-3 bg-secondary/5 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[18px]">🎖️</span>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] font-bold py-0">
                    Unlocked
                  </Badge>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {lang === "pt" ? "Fundador" : "Founder"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    {lang === "pt" ? "Membro pioneiro do Bloom" : "Early pioneer member of Bloom"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 p-3 bg-secondary/5 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[18px]">✍️</span>
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[8px] font-bold py-0">
                    Unlocked
                  </Badge>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {lang === "pt" ? "Mentor de Discussões" : "Discussion Mentor"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    {lang === "pt"
                      ? "Publicou discussões na comunidade"
                      : "Published topics in the community"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-border/80 p-3 opacity-60 space-y-1.5 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[18px]">⭐️</span>
                  <Badge variant="outline" className="text-[8px] font-bold py-0">
                    Locked
                  </Badge>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-foreground">
                    {lang === "pt" ? "Autor Estrela" : "Star Creator"}
                  </h4>
                  <p className="text-[10px] text-muted-foreground">
                    {lang === "pt"
                      ? "Venda 10+ recursos no marketplace"
                      : "Sell 10+ resources on marketplace"}
                  </p>
                </div>
              </div>
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
                <p className="text-3xl font-extrabold text-primary mt-1">#18</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t.communityScore}
                </p>
                <p className="text-2xl font-extrabold text-foreground mt-1">
                  2,480 <span className="text-xs font-medium text-muted-foreground">{t.xp}</span>
                </p>
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1.5">
                  <span>{t.progress}</span>
                  <span className="font-bold text-foreground">{t.nextRank}: Top 10</span>
                </div>
                <div className="font-mono text-lg text-primary tracking-tight select-none">
                  ████████░░{" "}
                  <span className="text-xs font-sans font-bold text-muted-foreground ml-1.5">
                    80%
                  </span>
                </div>
                <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden mt-2">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-300"
                    style={{ width: "80%" }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* COMMUNITY IMPACT STATISTICS CARD */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 pb-4 border-b border-border/60">
              <Award className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-display text-lg font-bold text-foreground">
                {lang === "pt" ? "Impacto na Comunidade" : "Community Impact"}
              </h3>
            </div>

            <ul className="mt-4 divide-y divide-border/40 text-xs font-semibold">
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span>🌱</span> {lang === "pt" ? "Ideias Regadas pela Comunidade" : "Ideas Watered by Community"}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">{likesReceived || 42}</span>
              </li>
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span>🤝</span> {lang === "pt" ? "Professores Ajudados" : "Teachers Helped"}
                </span>
                <span className="text-foreground font-bold text-sm">{helpfulAnswers || 18}</span>
              </li>
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span>✅</span> {lang === "pt" ? "Soluções Aceitas" : "Accepted Solutions"}
                </span>
                <span className="text-foreground font-bold text-sm">{helpfulAnswers > 0 ? Math.floor(helpfulAnswers / 2) : 5}</span>
              </li>
              <li className="flex justify-between items-center py-3">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <span>📚</span> {lang === "pt" ? "Recursos Compartilhados" : "Resources Shared"}
                </span>
                <span className="text-foreground font-bold text-sm">{resourcesPublished || 12}</span>
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
              {lang === "pt" ? "Histórico de Publicações do Educador" : "Teacher Publication History"}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lang === "pt"
                ? "Todas as suas perguntas, atividades, recursos e artigos com snapshots de versão imutáveis."
                : "All your questions, tips, resources, and community articles with immutable version history."}
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
                  <th className="pb-3 pl-2">{lang === "pt" ? "Publicação & Título" : "Publication & Title"}</th>
                  <th className="pb-3">{lang === "pt" ? "Categoria" : "Category"}</th>
                  <th className="pb-3 text-center">{lang === "pt" ? "Versão" : "Version"}</th>
                  <th className="pb-3 text-center">{lang === "pt" ? "Regadas" : "Waterings"}</th>
                  <th className="pb-3 text-right pr-2">{lang === "pt" ? "Ações" : "Actions"}</th>
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
                        {post.isAcceptedSolution && (
                          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            ✅ Solução Aceita
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-medium flex items-center gap-2">
                        <span>Criado: {post.timeAgo || "Recente"}</span>
                        {post.last_edited_at && (
                          <span className="text-amber-600 dark:text-amber-400">
                            • Editado em: {new Date(post.last_edited_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="py-3.5">
                      <Badge
                        variant="secondary"
                        className="text-[9px] py-0 font-bold bg-secondary/80"
                      >
                        {post.category === "Question" && (lang === "pt" ? "Pergunta" : "Question")}
                        {post.category === "Tip" && (lang === "pt" ? "Dica" : "Tip")}
                        {post.category === "Need Help" && (lang === "pt" ? "Ajuda" : "Help")}
                        {post.category === "Resource" && (lang === "pt" ? "Recurso" : "Resource")}
                      </Badge>
                    </td>
                    <td className="py-3.5 text-center font-bold text-muted-foreground">
                      v{post.version_number || 1}
                    </td>
                    <td className="py-3.5 text-center font-bold text-emerald-600 dark:text-emerald-400">
                      🌱 {post.likes || post.waterCount || 0}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-name" className="text-xs font-semibold text-foreground">
                  {t.fullName}
                </Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
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
                  required
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
                required
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
                  required
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-experience" className="text-xs font-semibold text-foreground">
                  {t.experience}
                </Label>
                <Input
                  id="edit-experience"
                  type="number"
                  value={editExperience}
                  onChange={(e) => setEditExperience(Number(e.target.value) || 0)}
                  required
                  className="h-10 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-areas" className="text-xs font-semibold text-foreground">
                {t.teachingAreas}
              </Label>
              <Input
                id="edit-areas"
                value={editAreas}
                onChange={(e) => setEditAreas(e.target.value)}
                placeholder="e.g. Adult Education, Business English"
                required
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="edit-subjects" className="text-xs font-semibold text-foreground">
                {t.subjectsTaught}
              </Label>
              <Input
                id="edit-subjects"
                value={editSubjects}
                onChange={(e) => setEditSubjects(e.target.value)}
                placeholder="e.g. General English, Professional Writing"
                required
                className="h-10 rounded-xl"
              />
            </div>

            <div className="space-y-2 border-t border-border/50 pt-3">
              <h4 className="text-xs font-bold text-foreground">{t.socialLinks}</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label
                    htmlFor="edit-linkedin"
                    className="text-[10px] font-semibold text-muted-foreground"
                  >
                    LinkedIn
                  </Label>
                  <Input
                    id="edit-linkedin"
                    value={editLinkedin}
                    onChange={(e) => setEditLinkedin(e.target.value)}
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="edit-twitter"
                    className="text-[10px] font-semibold text-muted-foreground"
                  >
                    Twitter / X
                  </Label>
                  <Input
                    id="edit-twitter"
                    value={editTwitter}
                    onChange={(e) => setEditTwitter(e.target.value)}
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="edit-github"
                    className="text-[10px] font-semibold text-muted-foreground"
                  >
                    GitHub
                  </Label>
                  <Input
                    id="edit-github"
                    value={editGithub}
                    onChange={(e) => setEditGithub(e.target.value)}
                    className="h-9 rounded-lg"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor="edit-website"
                    className="text-[10px] font-semibold text-muted-foreground"
                  >
                    Website
                  </Label>
                  <Input
                    id="edit-website"
                    value={editWebsite}
                    onChange={(e) => setEditWebsite(e.target.value)}
                    className="h-9 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-border/50 pt-3">
              <h4 className="text-xs font-bold text-foreground">
                {lang === "pt" ? "Preferências do Sistema" : "System Preferences"}
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="edit-language" className="text-xs font-semibold text-foreground">
                    {lang === "pt" ? "Idioma de Preferência" : "Preferred Language"}
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
                    {lang === "pt" ? "Fuso Horário" : "Timezone"}
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
                {lang === "pt" ? "Título" : "Title"}
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
                {lang === "pt" ? "Conteúdo" : "Content"}
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
                  {viewingPost.category}
                </Badge>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-gradient-lilac flex items-center justify-center font-display text-[9px] font-extrabold text-lilac-foreground">
                    {profile.name.substring(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-foreground">{profile.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    • {viewingPost.timeAgo || "Recently"}
                  </span>
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed bg-secondary/20 p-4 rounded-xl border border-border/50">
                  {viewingPost.content}
                </p>

                <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground pt-1">
                  <span className="flex items-center gap-1">
                    <ThumbsUp className="h-3.5 w-3.5 text-primary" />
                    {viewingPost.likes || 0} {lang === "pt" ? "Curtidas" : "Likes"}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" />
                    {viewingPost.commentsCount || 0} {lang === "pt" ? "Comentários" : "Comments"}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end border-t border-border/50 pt-4 mt-4">
                <DialogClose asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-secondary px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary/80 cursor-pointer"
                  >
                    {lang === "pt" ? "Fechar" : "Close"}
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

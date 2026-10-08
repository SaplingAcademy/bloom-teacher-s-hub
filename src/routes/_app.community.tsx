import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Droplets, MessageSquare, Plus, Search, Send, Sprout, Trash2, Trophy } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { reportUserError } from "@/lib/user-error";
import { PageHeader } from "@/components/bloom/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_app/community")({
  head: () => ({
    meta: [
      { title: "Comunidade · Bloom" },
      { name: "description", content: "Professores compartilhando ideias, dúvidas e dicas na Bloom." },
      { property: "og:title", content: "Comunidade · Bloom" },
      { property: "og:description", content: "Professores compartilhando ideias, dúvidas e dicas na Bloom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CommunityPage,
});

type Author = { full_name: string | null; avatar_url: string | null } | null;

interface Post {
  id: string;
  author_id: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  author: Author;
  waterCount: number;
  wateredByMe: boolean;
  commentCount: number;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author: Author;
}

type Period = "week" | "month" | "year" | "all";

interface LeaderRow {
  teacherId: string;
  name: string | null;
  avatar: string | null;
  points: number;
  position: number;
}

function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function Avatar({ name, url, size = 9 }: { name: string | null | undefined; url?: string | null; size?: number }) {
  const cls = size === 9 ? "h-9 w-9 text-xs" : "h-7 w-7 text-[10px]";
  if (url) return <img src={url} alt={name ?? ""} className={`${cls} rounded-full object-cover shrink-0`} />;
  return (
    <div className={`${cls} rounded-full bg-lilac-soft text-foreground font-semibold flex items-center justify-center shrink-0`}>
      {initials(name)}
    </div>
  );
}

function CommunityPage() {
  const { user } = useAuth();
  const { t, lang } = useLanguage();
  const userId = user?.id;
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [busyWater, setBusyWater] = useState<Set<string>>(new Set());

  const [openComments, setOpenComments] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [sendingComment, setSendingComment] = useState(false);

  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ title: "", content: "", tags: "" });
  const [publishing, setPublishing] = useState(false);

  const [period, setPeriod] = useState<Period>("week");
  const [leaders, setLeaders] = useState<LeaderRow[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(true);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase
      .from("community_posts")
      .select("id, author_id, title, content, tags, likes_count, created_at, updated_at, profiles:author_id(full_name, avatar_url)")
      .order("created_at", { ascending: false });
    if (error) {
      reportUserError(error, t("communityV1.loadError"));
      setLoadError(true);
      setLoading(false);
      return;
    }
    const ids = (data ?? []).map((p: any) => p.id);
    let reactions: { post_id: string; user_id: string }[] = [];
    let commentRows: { post_id: string }[] = [];
    if (ids.length) {
      const [r, c] = await Promise.all([
        supabase.from("reactions").select("post_id, user_id").eq("type", "water").in("post_id", ids),
        supabase.from("comments").select("post_id").in("post_id", ids),
      ]);
      if (r.error || c.error) {
        reportUserError(r.error ?? c.error, t("communityV1.loadError"));
        setLoadError(true);
        setLoading(false);
        return;
      }
      reactions = (r.data ?? []) as any;
      commentRows = (c.data ?? []) as any;
    }
    setPosts(
      (data ?? []).map((p: any) => {
        const rs = reactions.filter((x) => x.post_id === p.id);
        return {
          id: p.id,
          author_id: p.author_id,
          title: p.title,
          content: p.content,
          tags: p.tags ?? [],
          created_at: p.created_at,
          author: p.profiles ?? null,
          waterCount: rs.length,
          wateredByMe: !!userId && rs.some((x) => x.user_id === userId),
          commentCount: commentRows.filter((x) => x.post_id === p.id).length,
        };
      }),
    );
    setLoading(false);
  }, [userId, t]);

  const loadLeaders = useCallback(async (p: Period) => {
    setLeadersLoading(true);
    const { data, error } = await supabase.rpc("get_community_leaderboard", { period_type: p, result_limit: 10 });
    if (error) {
      reportUserError(error, t("communityV1.loadError"));
      setLeaders([]);
    } else {
      const rows = (Array.isArray(data) ? data : []) as any[];
      setLeaders(
        rows
          .map((r, i) => ({
            teacherId: r.teacher_id ?? r.user_id ?? r.id ?? String(i),
            name: r.full_name ?? r.name ?? null,
            avatar: r.avatar_url ?? null,
            points: Number(r.points ?? r.total_points ?? r.reputation_points ?? r.score ?? 0),
            position: Number(r.position ?? r.rank ?? r.ranking_position ?? i + 1),
          }))
          .filter((r) => r.points > 0)
          .slice(0, 10),
      );
    }
    setLeadersLoading(false);
  }, [t]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    loadLeaders(period);
  }, [period, loadLeaders]);

  const toggleWater = async (post: Post) => {
    if (!userId) return toast.error(t("communityV1.loginRequired"));
    if (busyWater.has(post.id)) return;
    setBusyWater((s) => new Set(s).add(post.id));
    const { error } = post.wateredByMe
      ? await supabase.from("reactions").delete().eq("user_id", userId).eq("post_id", post.id).eq("type", "water")
      : await supabase.from("reactions").insert({ user_id: userId, post_id: post.id, type: "water" });
    if (error) {
      toast.error(reportUserError(error, t("communityV1.actionError")));
    } else {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, wateredByMe: !post.wateredByMe, waterCount: p.waterCount + (post.wateredByMe ? -1 : 1) }
            : p,
        ),
      );
      loadLeaders(period);
    }
    setBusyWater((s) => {
      const n = new Set(s);
      n.delete(post.id);
      return n;
    });
  };

  const loadComments = async (postId: string) => {
    setCommentsLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, author_id, content, created_at, profiles:author_id(full_name, avatar_url)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error(reportUserError(error, t("communityV1.loadError")));
      setComments([]);
    } else {
      setComments((data ?? []).map((c: any) => ({ ...c, author: c.profiles ?? null })));
    }
    setCommentsLoading(false);
  };

  const toggleComments = (postId: string) => {
    if (openComments === postId) {
      setOpenComments(null);
      return;
    }
    setOpenComments(postId);
    setCommentDraft("");
    setComments([]);
    loadComments(postId);
  };

  const syncCommentCount = (postId: string, delta: number) =>
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, commentCount: Math.max(0, p.commentCount + delta) } : p)));

  const sendComment = async (postId: string) => {
    if (!userId) return toast.error(t("communityV1.loginRequired"));
    const content = commentDraft.trim();
    if (!content) return;
    setSendingComment(true);
    const { error } = await supabase.from("comments").insert({ post_id: postId, author_id: userId, content });
    setSendingComment(false);
    if (error) return toast.error(reportUserError(error, t("communityV1.actionError")));
    setCommentDraft("");
    syncCommentCount(postId, 1);
    loadComments(postId);
    loadLeaders(period);
  };

  const deleteComment = async (c: Comment) => {
    if (!userId || c.author_id !== userId) return;
    if (!window.confirm(t("communityV1.confirmDeleteComment"))) return;
    const { error } = await supabase.from("comments").delete().eq("id", c.id).eq("author_id", userId);
    if (error) return toast.error(reportUserError(error, t("communityV1.actionError")));
    setComments((prev) => prev.filter((x) => x.id !== c.id));
    syncCommentCount(c.post_id, -1);
    loadLeaders(period);
  };

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return toast.error(t("communityV1.loginRequired"));
    const title = form.title.trim();
    const content = form.content.trim();
    if (!title || !content) return;
    const tags = form.tags.split(",").map((s) => s.trim()).filter(Boolean);
    setPublishing(true);
    const { error } = await supabase.from("community_posts").insert({ author_id: userId, title, content, tags });
    setPublishing(false);
    if (error) return toast.error(reportUserError(error, t("communityV1.actionError")));
    toast.success(t("communityV1.published"));
    setForm({ title: "", content: "", tags: "" });
    setNewOpen(false);
    loadPosts();
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.tags.some((x) => x.toLowerCase().includes(q)),
    );
  }, [posts, search]);

  const periods: Period[] = ["week", "month", "year", "all"];
  const medal = (pos: number) =>
    pos === 1
      ? "bg-accent text-accent-foreground"
      : pos === 2
        ? "bg-primary text-primary-foreground"
        : pos === 3
          ? "bg-lilac text-lilac-foreground"
          : "bg-muted text-muted-foreground";

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow={t("communityV1.eyebrow")}
        title={t("communityV1.title")}
        description={t("communityV1.description")}
        actions={
          <Button onClick={() => setNewOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> {t("communityV1.newPost")}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr] items-start">
        {/* Leaderboard */}
        <aside className="rounded-2xl border border-border bg-card p-4 space-y-3 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-accent" />
            <h2 className="font-display font-semibold text-sm">{t("communityV1.highlights")}</h2>
          </div>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted p-1">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`rounded-lg py-1 text-xs font-medium transition-colors ${
                  period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(`communityV1.${p}`)}
              </button>
            ))}
          </div>
          {leadersLoading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{t("communityV1.loading")}</p>
          ) : leaders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{t("communityV1.leaderboardEmpty")}</p>
          ) : (
            <ol className="space-y-1.5">
              {leaders.map((l) => {
                const me = l.teacherId === userId;
                return (
                  <li
                    key={l.teacherId}
                    className={`flex items-center gap-2.5 rounded-xl px-2 py-1.5 ${me ? "bg-primary/10 ring-1 ring-primary/30" : ""}`}
                  >
                    <span className={`h-6 w-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${medal(l.position)}`}>
                      {l.position}
                    </span>
                    <Avatar name={l.name} url={l.avatar} size={7} />
                    <span className="flex-1 truncate text-sm">
                      {l.name || t("communityV1.unnamed")}
                      {me && <span className="ml-1 text-xs text-primary font-medium">({t("communityV1.you")})</span>}
                    </span>
                    <span className="text-xs font-semibold tabular-nums">
                      {l.points} {t("communityV1.points")}
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </aside>

        {/* Feed */}
        <section className="space-y-4 min-w-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={t("communityV1.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-card"
            />
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("communityV1.loading")}</p>
          ) : loadError ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
              <p className="text-sm text-muted-foreground">{t("communityV1.loadError")}</p>
              <Button variant="outline" size="sm" onClick={loadPosts}>{t("communityV1.retry")}</Button>
            </div>
          ) : posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-3">
              <Sprout className="w-8 h-8 mx-auto text-primary" />
              <h3 className="font-display font-semibold">{t("communityV1.emptyTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("communityV1.emptyBody")}</p>
              <Button onClick={() => setNewOpen(true)} className="gap-1.5">
                <Plus className="w-4 h-4" /> {t("communityV1.newPost")}
              </Button>
            </div>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("communityV1.noResults")}</p>
          ) : (
            visible.map((post) => (
              <article key={post.id} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <header className="flex items-center gap-3">
                  <Avatar name={post.author?.full_name} url={post.author?.avatar_url} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{post.author?.full_name || t("communityV1.unnamed")}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(post.created_at)}</p>
                  </div>
                </header>
                <h3 className="font-display font-semibold text-lg leading-snug">{post.title}</h3>
                <p className="text-sm text-foreground/90 whitespace-pre-line">{post.content}</p>
                {post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {post.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="font-normal">#{tag}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1">
                  <Button
                    variant={post.wateredByMe ? "default" : "outline"}
                    size="sm"
                    className="gap-1.5"
                    disabled={busyWater.has(post.id)}
                    onClick={() => toggleWater(post)}
                    aria-pressed={post.wateredByMe}
                  >
                    <Droplets className="w-4 h-4" />
                    {post.wateredByMe ? t("communityV1.watered") : t("communityV1.water")}
                    <span className="tabular-nums">· {post.waterCount}</span>
                  </Button>
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => toggleComments(post.id)}>
                    <MessageSquare className="w-4 h-4" />
                    {openComments === post.id ? t("communityV1.hideComments") : t("communityV1.comments")}
                    <span className="tabular-nums">· {post.commentCount}</span>
                  </Button>
                </div>

                {openComments === post.id && (
                  <div className="border-t border-border pt-3 space-y-3">
                    {commentsLoading ? (
                      <p className="text-xs text-muted-foreground">{t("communityV1.loading")}</p>
                    ) : comments.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{t("communityV1.noComments")}</p>
                    ) : (
                      <ul className="space-y-3">
                        {comments.map((c) => (
                          <li key={c.id} className="flex gap-2.5">
                            <Avatar name={c.author?.full_name} url={c.author?.avatar_url} size={7} />
                            <div className="flex-1 min-w-0 rounded-xl bg-muted/60 px-3 py-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium truncate">
                                  {c.author?.full_name || t("communityV1.unnamed")}
                                  <span className="ml-2 font-normal text-muted-foreground">{fmtDate(c.created_at)}</span>
                                </p>
                                {c.author_id === userId && (
                                  <button
                                    type="button"
                                    onClick={() => deleteComment(c)}
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label={t("communityV1.delete")}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <p className="text-sm whitespace-pre-line mt-0.5">{c.content}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendComment(post.id);
                      }}
                    >
                      <Input
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder={t("communityV1.commentPlaceholder")}
                      />
                      <Button type="submit" size="sm" disabled={sendingComment || !commentDraft.trim()} className="gap-1.5">
                        <Send className="w-4 h-4" /> {t("communityV1.send")}
                      </Button>
                    </form>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("communityV1.newPost")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={publish} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cp-title">{t("communityV1.postTitle")}</Label>
              <Input id="cp-title" value={form.title} placeholder={t("communityV1.titlePlaceholder")}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-content">{t("communityV1.postContent")}</Label>
              <Textarea id="cp-content" rows={6} value={form.content} placeholder={t("communityV1.contentPlaceholder")}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp-tags">{t("communityV1.postTags")}</Label>
              <Input id="cp-tags" value={form.tags} placeholder={t("communityV1.tagsPlaceholder")}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>{t("communityV1.cancel")}</Button>
              <Button type="submit" disabled={publishing || !form.title.trim() || !form.content.trim()}>
                {publishing ? t("communityV1.publishing") : t("communityV1.publish")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

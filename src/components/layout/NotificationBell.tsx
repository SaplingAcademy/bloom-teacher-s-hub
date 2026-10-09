import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { reportUserError } from "@/lib/user-error";

interface Notification {
  id: string;
  user_id: string;
  title: string | null;
  message: string | null;
  type: string | null;
  read: boolean;
  created_at: string;
  post_id: string | null;
}

const COLUMNS = "id, user_id, title, message, type, read, created_at, post_id";

export function NotificationBell() {
  const { user } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!userId) return setItems([]);
    setLoading(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    setLoading(false);
    if (error) return toast.error(reportUserError(error, t("notificationsUi.loadError")));
    setItems((data ?? []) as Notification[]);
  }, [userId, t]);

  useEffect(() => {
    setItems([]);
    if (!userId) return;
    load();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          if (payload.eventType === "INSERT") {
            const n = payload.new as Notification;
            setItems((prev) => (prev.some((x) => x.id === n.id) ? prev : [n, ...prev]));
          } else if (payload.eventType === "UPDATE") {
            const n = payload.new as Notification;
            setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, ...n } : x)));
          } else if (payload.eventType === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            setItems((prev) => prev.filter((x) => x.id !== id));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const unread = items.filter((n) => !n.read).length;

  const markRead = async (n: Notification) => {
    if (!userId || n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    const { error } = await supabase.from("notifications").update({ read: true }).eq("id", n.id).eq("user_id", userId);
    if (error) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
      toast.error(reportUserError(error, t("communityV1.actionError")));
    }
  };

  const markAll = async () => {
    if (!userId) return;
    const prev = items;
    setItems((p) => p.map((x) => ({ ...x, read: true })));
    const { error } = await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    if (error) {
      setItems(prev);
      toast.error(reportUserError(error, t("communityV1.actionError")));
    }
  };

  const onItem = async (n: Notification) => {
    await markRead(n);
    if (n.type === "community_comment" && n.post_id) {
      setOpen(false);
      navigate({ to: "/community", search: { post: n.post_id } });
    }
  };

  const fmt = (iso: string) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    const rtf = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "pt-BR", { numeric: "auto" });
    if (diff < 60) return rtf.format(0, "second");
    if (diff < 3600) return rtf.format(-Math.floor(diff / 60), "minute");
    if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), "hour");
    if (diff < 604800) return rtf.format(-Math.floor(diff / 86400), "day");
    return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR");
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary"
        aria-label={unread > 0 ? `${t("globalUi.notifications")} (${unread} ${t("notificationsUi.unread")})` : t("globalUi.notifications")}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-foreground ring-2 ring-header-bg">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card shadow-[var(--shadow-lg)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">{t("notificationsUi.title")}</p>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs font-semibold text-primary hover:underline">
                {t("notificationsUi.markAllRead")}
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-1.5">
            {loading && items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("notificationsUi.loading")}</p>
            ) : items.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{t("notificationsUi.empty")}</p>
            ) : (
              <ul className="space-y-0.5">
                {items.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => onItem(n)}
                      className={`flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-secondary ${n.read ? "" : "bg-primary/5"}`}
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-accent"}`} />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs truncate ${n.read ? "font-medium text-muted-foreground" : "font-bold text-foreground"}`}>
                          {n.title}
                        </span>
                        {n.message && (
                          <span className="mt-0.5 block text-xs text-muted-foreground line-clamp-2">{n.message}</span>
                        )}
                        <span className="mt-1 block text-[10px] text-muted-foreground">{fmt(n.created_at)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

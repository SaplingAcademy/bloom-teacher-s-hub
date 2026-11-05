import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BookText, FolderKanban, StickyNote, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/workspace/mural", key: "workspace.tabs.mural", icon: StickyNote },
  { to: "/workspace/projects", key: "workspace.tabs.projects", icon: FolderKanban },
  { to: "/workspace/notebooks", key: "workspace.tabs.notebooks", icon: BookText },
] as const;

export function WorkspaceTabs() {
  const { t } = useLanguage();
  return (
    <nav aria-label={t("workspace.tabsLabel")} className="-mx-1 overflow-x-auto px-1">
      <div className="inline-flex min-w-full gap-1 rounded-xl border border-border bg-muted/50 p-1 sm:min-w-0">
        {TABS.map(({ to, key, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:flex-none sm:px-4"
            activeProps={{ className: "bg-card text-foreground shadow-sm" }}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {t(key)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function WorkspaceEmptyState({ icon: Icon, title, body, className }: { icon: LucideIcon; title: string; body: string; className?: string }) {
  const { t } = useLanguage();
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center", className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      <span className="mt-4 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent-foreground">{t("workspace.soon")}</span>
    </div>
  );
}

export function WorkspaceGridSkeleton({ variant = "cards" }: { variant?: "notes" | "cards" }) {
  const { t } = useLanguage();
  return (
    <div role="status" aria-label={t("workspace.loading")} className={cn("grid gap-4", variant === "notes" ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
      {Array.from({ length: variant === "notes" ? 8 : 6 }).map((_, i) => (
        <Skeleton key={i} className={variant === "notes" ? "aspect-square rounded-xl" : "h-36 rounded-2xl"} />
      ))}
    </div>
  );
}

export function WorkspaceDetailSkeleton() {
  const { t } = useLanguage();
  return (
    <div role="status" aria-label={t("workspace.loading")} className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

export function WorkspaceBackLink({ to, children }: { to: "/workspace/projects" | "/workspace/notebooks"; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
      ← {children}
    </Link>
  );
}

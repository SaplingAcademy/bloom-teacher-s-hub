import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { WorkspaceBackLink, WorkspaceDetailSkeleton, WorkspaceEmptyState } from "@/components/bloom/workspace/WorkspaceShell";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/workspace/notebooks_/$notebookId")({
  head: () => ({
    meta: [
      { title: "Notebook · Workspace · Bloom" },
      { name: "description", content: "Notebook pages in your Bloom Workspace." },
      { property: "og:title", content: "Notebook · Workspace · Bloom" },
      { property: "og:description", content: "Notebook pages in your Bloom Workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  pendingComponent: WorkspaceDetailSkeleton,
  component: NotebookPage,
});

function NotebookPage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <WorkspaceBackLink to="/workspace/notebooks">{t("workspace.notebook.back")}</WorkspaceBackLink>
      <h2 className="font-display text-xl font-semibold text-foreground">{t("workspace.notebook.title")}</h2>
      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        <aside aria-label={t("workspace.notebook.pages")} className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("workspace.notebook.pages")}</p>
          <p className="mt-3 text-sm text-muted-foreground">{t("workspace.notebook.noPages")}</p>
        </aside>
        <WorkspaceEmptyState icon={FileText} title={t("workspace.notebook.title")} body={t("workspace.notebook.emptyBody")} />
      </div>
    </div>
  );
}

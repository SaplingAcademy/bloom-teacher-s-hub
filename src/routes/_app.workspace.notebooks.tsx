import { createFileRoute } from "@tanstack/react-router";
import { BookText } from "lucide-react";
import { WorkspaceEmptyState, WorkspaceGridSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/workspace/notebooks")({
  head: () => ({
    meta: [
      { title: "Notebooks · Workspace · Bloom" },
      { name: "description", content: "Notebooks with pages for your teaching notes." },
      { property: "og:title", content: "Notebooks · Workspace · Bloom" },
      { property: "og:description", content: "Notebooks with pages for your teaching notes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: () => <WorkspaceGridSkeleton />,
  component: NotebooksPage,
});

function NotebooksPage() {
  const { t } = useLanguage();
  return <WorkspaceEmptyState icon={BookText} title={t("workspace.notebooks.emptyTitle")} body={t("workspace.notebooks.emptyBody")} />;
}

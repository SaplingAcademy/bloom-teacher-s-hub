import { createFileRoute } from "@tanstack/react-router";
import { FolderKanban } from "lucide-react";
import { WorkspaceEmptyState, WorkspaceGridSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/workspace/projects")({
  head: () => ({
    meta: [
      { title: "Projects · Workspace · Bloom" },
      { name: "description", content: "Organize your projects into phases and tasks." },
      { property: "og:title", content: "Projects · Workspace · Bloom" },
      { property: "og:description", content: "Organize your projects into phases and tasks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: () => <WorkspaceGridSkeleton />,
  component: ProjectsPage,
});

function ProjectsPage() {
  const { t } = useLanguage();
  return <WorkspaceEmptyState icon={FolderKanban} title={t("workspace.projects.emptyTitle")} body={t("workspace.projects.emptyBody")} />;
}

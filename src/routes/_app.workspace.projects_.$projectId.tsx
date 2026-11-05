import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { WorkspaceBackLink, WorkspaceDetailSkeleton, WorkspaceEmptyState } from "@/components/bloom/workspace/WorkspaceShell";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/workspace/projects_/$projectId")({
  head: () => ({
    meta: [
      { title: "Project · Workspace · Bloom" },
      { name: "description", content: "Project phases and tasks in your Bloom Workspace." },
      { property: "og:title", content: "Project · Workspace · Bloom" },
      { property: "og:description", content: "Project phases and tasks in your Bloom Workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  pendingComponent: WorkspaceDetailSkeleton,
  component: ProjectPage,
});

function ProjectPage() {
  const { t } = useLanguage();
  return (
    <div className="space-y-4">
      <WorkspaceBackLink to="/workspace/projects">{t("workspace.project.back")}</WorkspaceBackLink>
      <h2 className="font-display text-xl font-semibold text-foreground">{t("workspace.project.title")}</h2>
      <section aria-label={t("workspace.project.phases")}>
        <WorkspaceEmptyState icon={Layers} title={t("workspace.project.phases")} body={t("workspace.project.emptyBody")} />
      </section>
    </div>
  );
}

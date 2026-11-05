import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/bloom/PageHeader";
import { WorkspaceTabs } from "@/components/bloom/workspace/WorkspaceShell";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace · Bloom" },
      { name: "description", content: "Organize ideas, projects and notebooks in your Bloom Workspace." },
      { property: "og:title", content: "Workspace · Bloom" },
      { property: "og:description", content: "Organize ideas, projects and notebooks in your Bloom Workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WorkspaceLayout,
});

function WorkspaceLayout() {
  const { t } = useLanguage();
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t("workspace.eyebrow")} title={t("workspace.title")} description={t("workspace.subtitle")} />
      <WorkspaceTabs />
      <Outlet />
    </div>
  );
}

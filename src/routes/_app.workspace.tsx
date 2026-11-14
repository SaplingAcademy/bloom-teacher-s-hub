import { createFileRoute, Outlet } from "@tanstack/react-router";
import { PageHeader } from "@/components/bloom/PageHeader";
import { InfoTooltip } from "@/components/bloom/InfoTooltip";
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
      <PageHeader
        // Phones: one column, so the tabs sit below the title; from sm they share the title's row.
        className="grid-cols-1"
        title={t("workspace.title")}
        titleAddon={<InfoTooltip label={t("workspace.infoLabel")} text={t("workspace.subtitle")} className="text-muted-foreground" />}
        actions={<WorkspaceTabs />}
      />
      <Outlet />
    </div>
  );
}

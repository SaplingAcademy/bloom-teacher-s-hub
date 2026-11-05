import { createFileRoute } from "@tanstack/react-router";
import { StickyNote } from "lucide-react";
import { WorkspaceEmptyState, WorkspaceGridSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/workspace/mural")({
  head: () => ({
    meta: [
      { title: "My Board · Workspace · Bloom" },
      { name: "description", content: "Quick notes and reminders on your Bloom board." },
      { property: "og:title", content: "My Board · Workspace · Bloom" },
      { property: "og:description", content: "Quick notes and reminders on your Bloom board." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  pendingComponent: () => <WorkspaceGridSkeleton variant="notes" />,
  component: MuralPage,
});

function MuralPage() {
  const { t } = useLanguage();
  return <WorkspaceEmptyState icon={StickyNote} title={t("workspace.mural.emptyTitle")} body={t("workspace.mural.emptyBody")} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceGridSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { NotebooksList } from "@/components/bloom/workspace/NotebooksList";

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
  component: NotebooksList,
});

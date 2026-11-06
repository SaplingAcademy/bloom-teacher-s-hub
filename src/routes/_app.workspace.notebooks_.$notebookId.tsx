import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceDetailSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { NotebookDetailView } from "@/components/bloom/workspace/NotebookDetailView";

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
  const { notebookId } = Route.useParams();
  return <NotebookDetailView notebookId={notebookId} />;
}

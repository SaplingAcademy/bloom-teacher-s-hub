import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceGridSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { NotesBoard } from "@/components/bloom/workspace/NotesBoard";

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
  component: NotesBoard,
});

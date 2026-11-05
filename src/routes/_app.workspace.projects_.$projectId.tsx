import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceDetailSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { ProjectDetailView } from "@/components/bloom/workspace/ProjectDetailView";

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
  const { projectId } = Route.useParams();
  return <ProjectDetailView key={projectId} projectId={projectId} />;
}

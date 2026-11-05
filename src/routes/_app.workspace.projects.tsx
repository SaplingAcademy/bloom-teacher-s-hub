import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkspaceGridSkeleton } from "@/components/bloom/workspace/WorkspaceShell";
import { ProjectsList } from "@/components/bloom/workspace/ProjectsList";
import type { StatusFilter } from "@/lib/workspace-projects";

export const Route = createFileRoute("/_app/workspace/projects")({
  validateSearch: (search: Record<string, unknown>): { status?: StatusFilter } =>
    search.status === "archived" || search.status === "all" ? { status: search.status } : {},
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
  const { status = "active" } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <ProjectsList filter={status} onFilter={(f) => void navigate({ search: f === "active" ? {} : { status: f }, replace: true })} />;
}

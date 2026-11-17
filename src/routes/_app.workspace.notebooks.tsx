import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Old address of Workspace Notebooks (feature removed). Links and bookmarks are redirected to
 * My Board so no route is broken. Notebook data in the database is kept untouched.
 */
export const Route = createFileRoute("/_app/workspace/notebooks")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/mural", replace: true });
  },
});

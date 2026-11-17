import { createFileRoute, redirect } from "@tanstack/react-router";

/** Old address of a single notebook (feature removed): redirected to My Board. */
export const Route = createFileRoute("/_app/workspace/notebooks_/$notebookId")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/mural", replace: true });
  },
});

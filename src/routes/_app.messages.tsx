import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy URL: Messages was replaced by Workspace; keep old links working.
export const Route = createFileRoute("/_app/messages")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/mural", replace: true });
  },
});

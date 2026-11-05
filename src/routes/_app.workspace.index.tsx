import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/workspace/")({
  beforeLoad: () => {
    throw redirect({ to: "/workspace/mural", replace: true });
  },
});

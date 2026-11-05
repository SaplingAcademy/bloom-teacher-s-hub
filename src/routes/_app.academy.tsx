import { createFileRoute } from "@tanstack/react-router";
import { AcademyHome } from "@/components/bloom/AcademyHome";
import { AcademyGate, AcademyRouteError, loadAcademyAccess } from "@/components/bloom/academy/AcademyGate";

export const Route = createFileRoute("/_app/academy")({
  ssr: false,
  // SSR-disabled loaders run after hydration; the existing app shell owns
  // sign-in UI and the server function independently verifies every request.
  loader: ({ context }) => loadAcademyAccess(context.queryClient),
  head: () => ({
    meta: [
      { title: "Bloom Academy · Desenvolvimento profissional" },
      { name: "description", content: "A Bloom Academy está em desenvolvimento. Um novo espaço de desenvolvimento profissional para professores." },
      { property: "og:title", content: "Bloom Academy · Desenvolvimento profissional" },
      { property: "og:description", content: "A Bloom Academy está em desenvolvimento. Um novo espaço de desenvolvimento profissional para professores." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AcademyPage,
  errorComponent: AcademyRouteError,
});

function AcademyPage() {
  const { userId } = Route.useLoaderData();
  return (
    <AcademyGate userId={userId}>
      <AcademyHome />
    </AcademyGate>
  );
}

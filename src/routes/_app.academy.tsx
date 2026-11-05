import { createFileRoute, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { GraduationCap, RotateCcw } from "lucide-react";
import { getAcademyAccess } from "@/lib/academy-access.functions";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { AcademyHome } from "@/components/bloom/AcademyHome";

const academyQuery = (userId: string) => queryOptions({
  queryKey: ["academy-access", userId],
  queryFn: () => getAcademyAccess(),
  staleTime: 0,
  gcTime: 0,
  retry: false,
});

export const Route = createFileRoute("/_app/academy")({
  ssr: false,
  // SSR-disabled loaders run after hydration; the existing app shell owns
  // sign-in UI and the server function independently verifies every request.
  loader: async ({ context }) => {
    const { data, error } = await supabase.auth.getSession();
    // Let the existing shell show sign-in; do not fetch anything without a session.
    if (error || !data.session) return { userId: null };
    const userId = data.session.user.id;
    await context.queryClient.ensureQueryData(academyQuery(userId));
    return { userId };
  },
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
  errorComponent: AcademyLoadError,
});

function AcademyPage() {
  const { userId } = Route.useLoaderData();
  if (!userId) return null;
  return <AuthorizedAcademy userId={userId} />;
}

function AuthorizedAcademy({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const { data } = useSuspenseQuery(academyQuery(userId));

  if (data.state !== "construction") {
    return (
      <section className="mx-auto flex min-h-[min(60vh,32rem)] max-w-xl flex-col items-center justify-center gap-5 px-2 py-12 text-center sm:px-6">
        <GraduationCap className="h-12 w-12 text-primary" strokeWidth={1.5} aria-hidden="true" />
        <h1 className="font-display text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{t("academy.soonTitle")}</h1>
        <p className="max-w-md text-base leading-relaxed text-muted-foreground">{t("academy.soonDescription")}</p>
      </section>
    );
  }

  return <AcademyHome />;
}

function AcademyLoadError({ reset }: { reset: () => void }) {
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <section className="mx-auto max-w-md space-y-5 py-20 text-center">
      <GraduationCap className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
      <h1 className="font-display text-2xl font-semibold">{t("academy.nav")}</h1>
      <p className="text-sm text-muted-foreground">{t("academy.loadError")}</p>
      <Button variant="outline" onClick={() => { void router.invalidate(); reset(); }}>
        <RotateCcw className="h-4 w-4" />{t("academy.retry")}
      </Button>
    </section>
  );
}
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { GraduationCap, Construction, RotateCcw } from "lucide-react";
import { getAcademyAccess } from "@/lib/academy-access.functions";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const academyQuery = (userId: string) => queryOptions({
  queryKey: ["academy-access", userId],
  queryFn: () => getAcademyAccess(),
  staleTime: 0,
  gcTime: 0,
  retry: false,
});

export const Route = createFileRoute("/_app/academy")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw redirect({ to: "/auth" });
    return { academyUserId: data.session.user.id };
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(academyQuery(context.academyUserId));
    return { userId: context.academyUserId };
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
  const { t } = useLanguage();
  const { userId } = Route.useLoaderData();
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

  return (
    <section className="space-y-10 py-2">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-foreground">{t("academy.adminTitle")}</h1>
        <Badge variant="secondary">{t("academy.adminBadge")}</Badge>
      </header>
      <div className="flex max-w-xl flex-col gap-4 py-8">
        <Construction className="h-10 w-10 text-accent" strokeWidth={1.5} aria-hidden="true" />
        <h2 className="font-display text-xl font-semibold text-foreground">{t("academy.adminHeading")}</h2>
        <p className="text-base leading-relaxed text-muted-foreground">{t("academy.adminDescription")}</p>
      </div>
    </section>
  );
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
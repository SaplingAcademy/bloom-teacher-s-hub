import type { ReactNode } from "react";
import { queryOptions, useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { GraduationCap, RotateCcw } from "lucide-react";
import { getAcademyAccess } from "@/lib/academy-access.functions";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";

/** Uncached, user-scoped server authorization shared by every Academy page. */
export const academyAccessQuery = (userId: string) =>
  queryOptions({
    queryKey: ["academy-access", userId],
    queryFn: () => getAcademyAccess(),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

export async function loadAcademyAccess(queryClient: QueryClient): Promise<{ userId: string | null }> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { userId: null };
  const userId = data.session.user.id;
  await queryClient.ensureQueryData(academyAccessQuery(userId));
  return { userId };
}

export function AcademyComingSoon() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto flex min-h-[min(60vh,32rem)] max-w-xl flex-col items-center justify-center gap-5 px-2 py-12 text-center sm:px-6">
      <GraduationCap className="h-12 w-12 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <h1 className="font-display text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{t("academy.soonTitle")}</h1>
      <p className="max-w-md text-base leading-relaxed text-muted-foreground">{t("academy.soonDescription")}</p>
    </section>
  );
}

/** Renders children only for the server-authorized construction state. */
export function AcademyGate({ userId, children }: { userId: string | null; children: ReactNode }) {
  if (!userId) return null;
  return <AuthorizedGate userId={userId}>{children}</AuthorizedGate>;
}

function AuthorizedGate({ userId, children }: { userId: string; children: ReactNode }) {
  const { data } = useSuspenseQuery(academyAccessQuery(userId));
  if (data.state !== "construction") return <AcademyComingSoon />;
  return <>{children}</>;
}

export function AcademyRouteError({ reset }: { reset: () => void }) {
  const { t } = useLanguage();
  const router = useRouter();
  return (
    <section className="mx-auto max-w-md space-y-5 py-20 text-center">
      <GraduationCap className="mx-auto h-10 w-10 text-primary" strokeWidth={1.5} aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{t("academy.loadError")}</p>
      <Button variant="outline" onClick={() => { void router.invalidate(); reset(); }}>
        <RotateCcw className="h-4 w-4" />{t("academy.retry")}
      </Button>
    </section>
  );
}

export const academyPrivateHead = (title: string) => ({
  meta: [
    { title },
    { name: "description", content: "Bloom Academy — desenvolvimento profissional para professores." },
    { property: "og:title", content: title },
    { property: "og:description", content: "Bloom Academy — desenvolvimento profissional para professores." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ],
});

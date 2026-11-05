import { createFileRoute } from "@tanstack/react-router";
import { AcademyGate, AcademyRouteError, academyPrivateHead, loadAcademyAccess } from "@/components/bloom/academy/AcademyGate";
import { AcademyLessonPlayer } from "@/components/bloom/academy/AcademyLessonPlayer";

export const Route = createFileRoute("/_app/academy_/lesson/$lessonId")({
  ssr: false,
  loader: ({ context }) => loadAcademyAccess(context.queryClient),
  head: () => academyPrivateHead("Aula · Bloom Academy"),
  component: LessonRoute,
  errorComponent: AcademyRouteError,
});

function LessonRoute() {
  const { userId } = Route.useLoaderData();
  const { lessonId } = Route.useParams();
  return (
    <AcademyGate userId={userId}>
      <AcademyLessonPlayer lessonId={lessonId} />
    </AcademyGate>
  );
}

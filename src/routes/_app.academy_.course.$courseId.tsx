import { createFileRoute } from "@tanstack/react-router";
import { AcademyGate, AcademyRouteError, academyPrivateHead, loadAcademyAccess } from "@/components/bloom/academy/AcademyGate";
import { AcademyCoursePage } from "@/components/bloom/academy/AcademyCoursePage";

export const Route = createFileRoute("/_app/academy_/course/$courseId")({
  ssr: false,
  loader: ({ context }) => loadAcademyAccess(context.queryClient),
  head: () => academyPrivateHead("Curso · Bloom Academy"),
  component: CourseRoute,
  errorComponent: AcademyRouteError,
});

function CourseRoute() {
  const { userId } = Route.useLoaderData();
  const { courseId } = Route.useParams();
  return (
    <AcademyGate userId={userId}>
      <AcademyCoursePage courseId={courseId} />
    </AcademyGate>
  );
}

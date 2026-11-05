import { createFileRoute } from "@tanstack/react-router";
import { AcademyGate, AcademyRouteError, academyPrivateHead, loadAcademyAccess } from "@/components/bloom/academy/AcademyGate";
import { AcademyVideoPlayer } from "@/components/bloom/academy/AcademyVideoPlayer";

export const Route = createFileRoute("/_app/academy_/video/$videoId")({
  ssr: false,
  loader: ({ context }) => loadAcademyAccess(context.queryClient),
  head: () => academyPrivateHead("Videoaula · Bloom Academy"),
  component: VideoRoute,
  errorComponent: AcademyRouteError,
});

function VideoRoute() {
  const { userId } = Route.useLoaderData();
  const { videoId } = Route.useParams();
  return (
    <AcademyGate userId={userId}>
      <AcademyVideoPlayer videoId={videoId} />
    </AcademyGate>
  );
}

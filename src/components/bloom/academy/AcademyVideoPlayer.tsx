import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchVideoLearning, setVideoCompleted } from "@/lib/academy-learning-data";
import { BackToAcademy } from "./AcademyCoursePage";
import { LearningError, LearningLoading, LearningNotFound, YoutubePlayer } from "./AcademyShared";

export function AcademyVideoPlayer({ videoId }: { videoId: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const key = ["academy-video-learning", videoId];
  const query = useQuery({ queryKey: key, queryFn: () => fetchVideoLearning(videoId), retry: false, staleTime: 0 });
  const toggle = useMutation({
    mutationFn: (completed: boolean) => setVideoCompleted(videoId, completed),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: key }),
    onError: () => toast.error(t("academy.learn.saveError")),
  });

  if (query.isPending) return <LearningLoading />;
  if (query.isError) return <LearningError onRetry={() => void query.refetch()} />;
  if (!query.data) return <LearningNotFound action={<BackToAcademy />} />;

  const { video, completed } = query.data;
  return (
    <div className="mx-auto max-w-4xl space-y-5 py-2">
      <BackToAcademy />
      <YoutubePlayer youtubeId={video.youtube_id} title={video.title} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Badge variant="secondary">{t(`academy.categories.${video.category}`)}</Badge>
          <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{video.title}</h1>
          {video.duration_minutes ? <p className="text-xs text-muted-foreground">{video.duration_minutes} min</p> : null}
        </div>
        <Button variant={completed ? "secondary" : "default"} onClick={() => toggle.mutate(!completed)} disabled={toggle.isPending} aria-pressed={completed}>
          {completed ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
          {completed ? t("academy.learn.markedComplete") : t("academy.learn.markComplete")}
        </Button>
      </div>
      {video.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{video.description}</p>
      ) : null}
    </div>
  );
}

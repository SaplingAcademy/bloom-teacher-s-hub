import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2, Circle, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchCourseLearning, fetchLessonCourseId, recordLastLesson, setLessonCompleted } from "@/lib/academy-learning-data";
import { buildCourseOutline, computeCourseProgress, flattenOutline, lessonNeighbors } from "@/lib/academy-learning";
import { BackToAcademy, courseLearningKey } from "./AcademyCoursePage";
import { LearningError, LearningLoading, LearningNotFound, ProgressBar, YoutubePlayer } from "./AcademyShared";

export function AcademyLessonPlayer({ lessonId }: { lessonId: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();

  const courseIdQuery = useQuery({
    queryKey: ["academy-lesson-course", lessonId],
    queryFn: () => fetchLessonCourseId(lessonId),
    retry: false,
  });
  const courseId = courseIdQuery.data ?? null;

  const courseQuery = useQuery({
    queryKey: courseLearningKey(courseId ?? ""),
    queryFn: () => fetchCourseLearning(courseId as string),
    enabled: Boolean(courseId),
    retry: false,
  });

  const derived = useMemo(() => {
    if (!courseQuery.data) return null;
    const outline = buildCourseOutline(courseQuery.data.modules, courseQuery.data.lessons);
    const flat = flattenOutline(outline);
    const completed = new Set(courseQuery.data.completedLessonIds);
    return {
      outline,
      completed,
      lesson: flat.find((l) => l.id === lessonId) ?? null,
      neighbors: lessonNeighbors(flat, lessonId),
      progress: computeCourseProgress(flat.map((l) => l.id), completed),
    };
  }, [courseQuery.data, lessonId]);

  const lessonFound = Boolean(derived?.lesson);
  // Record the last accessed lesson once per lesson view (upsert, no duplicates).
  useEffect(() => {
    if (!courseId || !lessonFound) return;
    recordLastLesson(courseId, lessonId).catch(() => {
      /* Non-blocking: resume falls back to first incomplete lesson. */
    });
  }, [courseId, lessonId, lessonFound]);

  const toggle = useMutation({
    mutationFn: (completed: boolean) => setLessonCompleted(lessonId, completed),
    onSuccess: () => {
      if (courseId) void queryClient.invalidateQueries({ queryKey: courseLearningKey(courseId) });
      void queryClient.invalidateQueries({ queryKey: ["academy-my-progress"] });
    },
    onError: () => toast.error(t("academy.learn.saveError")),
  });

  if (courseIdQuery.isPending || (courseId && courseQuery.isPending)) return <LearningLoading />;
  if (courseIdQuery.isError || courseQuery.isError) {
    return <LearningError onRetry={() => { void courseIdQuery.refetch(); void courseQuery.refetch(); }} />;
  }
  if (!courseId || !courseQuery.data || !derived?.lesson) return <LearningNotFound action={<BackToAcademy />} />;

  const { lesson, outline, completed, neighbors, progress } = derived;
  const done = completed.has(lesson.id);
  const finished = progress.total > 0 && progress.completed === progress.total;

  return (
    <div className="space-y-6 py-2">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/academy/course/$courseId" params={{ courseId }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("academy.learn.backToCourse")}
        </Link>
      </Button>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <YoutubePlayer youtubeId={lesson.youtube_id} title={lesson.title} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">{courseQuery.data.course.title}</p>
              <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">{lesson.title}</h1>
              {lesson.duration_minutes ? <p className="text-xs text-muted-foreground">{lesson.duration_minutes} min</p> : null}
            </div>
            <Button
              variant={done ? "secondary" : "default"}
              onClick={() => toggle.mutate(!done)}
              disabled={toggle.isPending}
              aria-pressed={done}
            >
              {done ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}
              {done ? t("academy.learn.markedComplete") : t("academy.learn.markComplete")}
            </Button>
          </div>
          {lesson.description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{lesson.description}</p>
          ) : null}
          {finished ? (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-foreground">
              <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t("academy.learn.courseCompleted")}</span>
            </div>
          ) : null}
          {/* Navigation never marks lessons as complete. */}
          <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4">
            {neighbors.previous ? (
              <Button variant="outline" asChild>
                <Link to="/academy/lesson/$lessonId" params={{ lessonId: neighbors.previous.id }}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />{t("academy.learn.previous")}
                </Link>
              </Button>
            ) : <span />}
            {neighbors.next ? (
              <Button variant="outline" asChild>
                <Link to="/academy/lesson/$lessonId" params={{ lessonId: neighbors.next.id }}>
                  {t("academy.learn.next")}<ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <aside className="space-y-4 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
          <ProgressBar percent={progress.percent} label={t("academy.learn.progress")} />
          <nav aria-label={t("academy.learn.content")} className="max-h-[60vh] space-y-4 overflow-y-auto">
            {outline.map((entry) => (
              <div key={entry.module.id} className="space-y-1">
                <p className="text-xs font-semibold text-foreground">{entry.module.title}</p>
                <ul className="space-y-0.5">
                  {entry.lessons.map((item) => {
                    const current = item.id === lesson.id;
                    return (
                      <li key={item.id}>
                        <Link
                          to="/academy/lesson/$lessonId"
                          params={{ lessonId: item.id }}
                          aria-current={current ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/60",
                            current ? "bg-primary-soft font-medium text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {completed.has(item.id) ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-label={t("academy.learn.completed")} />
                          ) : (
                            <Circle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          )}
                          <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
      </div>
    </div>
  );
}

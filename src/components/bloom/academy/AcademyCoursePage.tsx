import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, CheckCircle2, Circle, PartyPopper, PlayCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchCourseLearning } from "@/lib/academy-learning-data";
import { buildCourseOutline, computeCourseProgress, flattenOutline, resumeLesson } from "@/lib/academy-learning";
import { LearningError, LearningLoading, LearningNotFound, ProgressBar } from "./AcademyShared";

export const courseLearningKey = (courseId: string) => ["academy-course-learning", courseId] as const;

export function BackToAcademy() {
  const { t } = useLanguage();
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to="/academy"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{t("academy.manage.backToHome")}</Link>
    </Button>
  );
}

export function AcademyCoursePage({ courseId }: { courseId: string }) {
  const { t } = useLanguage();
  const query = useQuery({
    queryKey: courseLearningKey(courseId),
    queryFn: () => fetchCourseLearning(courseId),
    retry: false,
    staleTime: 0,
  });

  const derived = useMemo(() => {
    if (!query.data) return null;
    const outline = buildCourseOutline(query.data.modules, query.data.lessons);
    const flat = flattenOutline(outline);
    const completed = new Set(query.data.completedLessonIds);
    const progress = computeCourseProgress(flat.map((l) => l.id), completed);
    const started = Boolean(query.data.lastLessonId) || progress.completed > 0;
    return { outline, flat, completed, progress, started, resume: resumeLesson(flat, query.data.lastLessonId, completed) };
  }, [query.data]);

  if (query.isPending) return <LearningLoading />;
  if (query.isError) return <LearningError onRetry={() => void query.refetch()} />;
  if (!query.data || !derived) return <LearningNotFound action={<BackToAcademy />} />;

  const { course } = query.data;
  const { outline, completed, progress, started, resume } = derived;
  const finished = progress.total > 0 && progress.completed === progress.total;

  return (
    <div className="space-y-8 py-2">
      <BackToAcademy />
      <header className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start">
        {course.cover_url ? (
          <img src={course.cover_url} alt="" className="aspect-video w-full rounded-xl border border-border object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-muted">
            <BookOpen className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          </div>
        )}
        <div className="space-y-4">
          <Badge variant="secondary">{t(`academy.categories.${course.category}`)}</Badge>
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">{course.title}</h1>
          <p className="whitespace-pre-line text-base leading-relaxed text-muted-foreground">
            {course.full_description || course.short_description}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("academy.learn.moduleCount").replace("{count}", String(outline.length))}
            {" · "}
            {t("academy.home.lessonCount").replace("{count}", String(progress.total))}
          </p>
          <ProgressBar percent={progress.percent} label={t("academy.learn.progress")} />
          {finished ? (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary-soft px-4 py-3 text-sm text-foreground">
              <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{t("academy.learn.courseCompleted")}</span>
            </div>
          ) : null}
          {resume ? (
            <Button asChild>
              <Link to="/academy/lesson/$lessonId" params={{ lessonId: resume.id }}>
                <PlayCircle className="h-4 w-4" aria-hidden="true" />
                {finished ? t("academy.learn.review") : started ? t("academy.learn.continue") : t("academy.learn.start")}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <section className="space-y-4" aria-labelledby="course-content">
        <h2 id="course-content" className="font-display text-lg font-semibold text-foreground">{t("academy.learn.content")}</h2>
        {outline.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("academy.learn.noLessons")}</p>
        ) : (
          <ol className="space-y-4">
            {outline.map((entry, moduleIndex) => (
              <li key={entry.module.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div className="border-b border-border px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t("academy.learn.moduleLabel").replace("{n}", String(moduleIndex + 1))}
                  </p>
                  <h3 className="font-display text-base font-semibold text-foreground">{entry.module.title}</h3>
                </div>
                <ul className="divide-y divide-border">
                  {entry.lessons.map((lesson) => {
                    const done = completed.has(lesson.id);
                    return (
                      <li key={lesson.id}>
                        <Link
                          to="/academy/lesson/$lessonId"
                          params={{ lessonId: lesson.id }}
                          className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/60"
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-label={t("academy.learn.completed")} />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label={t("academy.learn.notCompleted")} />
                          )}
                          <span className="min-w-0 flex-1 text-foreground">{lesson.title}</span>
                          {lesson.duration_minutes ? (
                            <span className="shrink-0 text-xs text-muted-foreground">{lesson.duration_minutes} min</span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

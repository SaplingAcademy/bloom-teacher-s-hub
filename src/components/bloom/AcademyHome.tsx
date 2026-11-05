import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Users,
  Briefcase,
  Sprout,
  GraduationCap,
  Search,
  PlayCircle,
  Settings2,
  Star,
  type LucideIcon,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  ACADEMY_CATEGORIES,
  EMPTY_ACADEMY_FILTER,
  filterAcademyCourses,
  filterAcademyVideos,
  type AcademyCategoryId,
  type AcademyCourse,
  type AcademyVideo,
} from "@/lib/academy-catalog";
import {
  fetchPublishedCourses,
  fetchPublishedLessonCounts,
  fetchPublishedVideos,
} from "@/lib/academy-admin";
import { AcademyManage } from "@/components/bloom/AcademyManage";

const CATEGORY_ICONS: Record<AcademyCategoryId, LucideIcon> = {
  teaching_methodology: BookOpen,
  student_management: Users,
  business_management: Briefcase,
  professional_development: Sprout,
  mastering_bloom: GraduationCap,
};

/**
 * Internal Academy home, visible only to super_admin while unpublished.
 * Published content comes from the database under RLS; drafts never appear
 * here, only in the management area. No fake courses, videos or progress.
 */
export function AcademyHome() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AcademyCategoryId | null>(null);
  const [managing, setManaging] = useState(false);

  const contentQuery = useQuery({
    queryKey: ["academy-published-content"],
    staleTime: 30_000,
    retry: false,
    queryFn: async () => {
      const [courseRows, videoRows] = await Promise.all([
        fetchPublishedCourses(),
        fetchPublishedVideos(),
      ]);
      const lessonCounts = await fetchPublishedLessonCounts(courseRows.map((c) => c.id));
      return { courseRows, videoRows, lessonCounts };
    },
  });

  const courses = useMemo<readonly AcademyCourse[]>(
    () =>
      (contentQuery.data?.courseRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        description: row.short_description,
        coverUrl: row.cover_url,
        lessonCount: contentQuery.data?.lessonCounts[row.id] ?? 0,
        progressPercent: null,
        featured: row.is_featured,
      })),
    [contentQuery.data],
  );
  const videos = useMemo<readonly AcademyVideo[]>(
    () =>
      (contentQuery.data?.videoRows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        category: row.category,
        thumbnailUrl: row.thumbnail_url,
        durationMinutes: row.duration_minutes ?? 0,
        featured: row.is_featured,
      })),
    [contentQuery.data],
  );

  const filter = useMemo(() => ({ ...EMPTY_ACADEMY_FILTER, search, category }), [search, category]);
  const visibleCourses = useMemo(() => filterAcademyCourses(courses, filter), [courses, filter]);
  const visibleVideos = useMemo(() => filterAcademyVideos(videos, filter), [videos, filter]);
  const hasAnyContent = courses.length > 0 || videos.length > 0;
  const featuredCourses = useMemo(() => visibleCourses.filter((c) => c.featured), [visibleCourses]);
  const featuredVideos = useMemo(() => visibleVideos.filter((v) => v.featured), [visibleVideos]);
  const hasFeatured = featuredCourses.length > 0 || featuredVideos.length > 0;

  if (managing) {
    return (
      <div className="space-y-4 py-2">
        <Button variant="ghost" size="sm" onClick={() => setManaging(false)}>
          {t("academy.manage.backToHome")}
        </Button>
        <AcademyManage />
      </div>
    );
  }

  return (
    <div className="space-y-10 py-2">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            {t("academy.home.title")}
          </h1>
          <Badge variant="secondary">{t("academy.adminBadge")}</Badge>
        </div>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t("academy.home.subtitle")}
        </p>
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("academy.home.searchPlaceholder")}
            aria-label={t("academy.home.searchPlaceholder")}
            className="pl-9"
          />
        </div>
      </header>

      {/* Featured */}
      <section aria-labelledby="academy-featured" className="space-y-3">
        <h2 id="academy-featured" className="font-display text-lg font-semibold text-foreground">
          {t("academy.home.featuredTitle")}
        </h2>
        {hasFeatured ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredCourses.map((course) => (
              <CourseCard key={course.id} course={course} featured />
            ))}
            {featuredVideos.map((video) => (
              <VideoCard key={video.id} video={video} featured />
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/40 px-6 py-10 text-center">
            <GraduationCap className="h-8 w-8 text-primary" strokeWidth={1.5} aria-hidden="true" />
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              {t("academy.home.featuredEmpty")}
            </p>
          </div>
        )}
      </section>

      {/* Continue learning */}
      <section aria-labelledby="academy-continue" className="space-y-3">
        <h2 id="academy-continue" className="font-display text-lg font-semibold text-foreground">
          {t("academy.home.continueTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("academy.home.continueEmpty")}</p>
      </section>

      {/* Categories */}
      <section aria-labelledby="academy-categories" className="space-y-3">
        <h2 id="academy-categories" className="font-display text-lg font-semibold text-foreground">
          {t("academy.home.categoriesTitle")}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={category === null ? "default" : "outline"}
            size="sm"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
          >
            {t("academy.home.allCategories")}
          </Button>
          {ACADEMY_CATEGORIES.map((item) => {
            const Icon = CATEGORY_ICONS[item.id];
            const active = category === item.id;
            return (
              <Button
                key={item.id}
                variant={active ? "default" : "outline"}
                size="sm"
                onClick={() => setCategory(active ? null : item.id)}
                aria-pressed={active}
                className={cn(
                  !active && item.highlighted && "border-primary/40 bg-primary-soft text-foreground",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(`academy.categories.${item.id}`)}
              </Button>
            );
          })}
        </div>
      </section>

      {/* Courses */}
      <section aria-labelledby="academy-courses" className="space-y-3">
        <h2 id="academy-courses" className="font-display text-lg font-semibold text-foreground">
          {t("academy.home.coursesTitle")}
        </h2>
        {visibleCourses.length === 0 ? (
          <EmptyState
            message={
              hasAnyContent ? t("academy.home.noResults") : t("academy.home.coursesEmpty")
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleCourses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </section>

      {/* Independent video lessons */}
      <section aria-labelledby="academy-videos" className="space-y-3">
        <h2 id="academy-videos" className="font-display text-lg font-semibold text-foreground">
          {t("academy.home.videosTitle")}
        </h2>
        {visibleVideos.length === 0 ? (
          <EmptyState
            message={hasAnyContent ? t("academy.home.noResults") : t("academy.home.videosEmpty")}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        )}
      </section>

      {/* Content management */}
      <section aria-labelledby="academy-admin" className="space-y-3 border-t border-border pt-8">
        <h2 id="academy-admin" className="font-display text-lg font-semibold text-foreground">
          {t("academy.home.manageTitle")}
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">{t("academy.home.manageDescription")}</p>
        <Button variant="outline" onClick={() => setManaging(true)}>
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {t("academy.home.manageButton")}
        </Button>
      </section>
    </div>
  );
}

function CourseCard({ course, featured = false }: { course: AcademyCourse & { featured?: boolean }; featured?: boolean }) {
  const { t } = useLanguage();
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      {course.coverUrl ? (
        <img src={course.coverUrl} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-muted">
          <BookOpen className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`academy.categories.${course.category}`)}</Badge>
          {featured ? (
            <Badge variant="outline">
              <Star className="h-3 w-3" aria-hidden="true" />
              {t("academy.manage.featuredBadge")}
            </Badge>
          ) : null}
        </div>
        <h3 className="font-display text-base font-semibold text-foreground">{course.title}</h3>
        <p className="text-sm text-muted-foreground">{course.description}</p>
        <p className="text-xs text-muted-foreground">
          {t("academy.home.lessonCount").replace("{count}", String(course.lessonCount))}
        </p>
      </div>
    </article>
  );
}

function VideoCard({ video, featured = false }: { video: AcademyVideo & { featured?: boolean }; featured?: boolean }) {
  const { t } = useLanguage();
  return (
    <article className="overflow-hidden rounded-xl border border-border bg-card">
      {video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt="" className="aspect-video w-full object-cover" />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-muted">
          <PlayCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <div className="space-y-2 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(`academy.categories.${video.category}`)}</Badge>
          {featured ? (
            <Badge variant="outline">
              <Star className="h-3 w-3" aria-hidden="true" />
              {t("academy.manage.featuredBadge")}
            </Badge>
          ) : null}
        </div>
        <h3 className="font-display text-base font-semibold text-foreground">{video.title}</h3>
        {video.durationMinutes > 0 ? (
          <p className="text-xs text-muted-foreground">{video.durationMinutes} min</p>
        ) : null}
      </div>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-6 py-8 text-center">
      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{message}</p>
    </div>
  );
}

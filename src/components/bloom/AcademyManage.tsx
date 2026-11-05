import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ACADEMY_CATEGORIES, type AcademyCategoryId } from "@/lib/academy-catalog";
import {
  blankToNull,
  extractYoutubeId,
  filterManageableCourses,
  filterManageableVideos,
  parseOptionalDuration,
  EMPTY_MANAGE_FILTER,
  type AcademyContentStatus,
  type AcademyCourseRow,
  type AcademyLessonRow,
  type AcademyManageFilter,
  type AcademyModuleRow,
  type AcademyVideoRow,
} from "@/lib/academy-content";
import * as admin from "@/lib/academy-admin";

type StatusFilter = AcademyContentStatus | "all";

/**
 * Academy content management, rendered only inside the server-authorized
 * super_admin area. The database RLS is the real boundary; every failure
 * surfaces as a toast/error state instead of a silent fallback.
 */
export function AcademyManage() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"courses" | "videos">("courses");
  const [courses, setCourses] = useState<AcademyCourseRow[] | null>(null);
  const [videos, setVideos] = useState<AcademyVideoRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<AcademyCategoryId | "all">("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [courseRows, videoRows] = await Promise.all([admin.fetchAllCourses(), admin.fetchAllVideos()]);
      setCourses(courseRows);
      setVideos(videoRows);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filter: AcademyManageFilter = useMemo(
    () => ({
      ...EMPTY_MANAGE_FILTER,
      search,
      category: category === "all" ? null : category,
      status: status === "all" ? null : status,
    }),
    [search, category, status],
  );

  const visibleCourses = useMemo(
    () => (courses ? filterManageableCourses(courses, filter) : []),
    [courses, filter],
  );
  const visibleVideos = useMemo(
    () => (videos ? filterManageableVideos(videos, filter) : []),
    [videos, filter],
  );

  if (loadError) {
    return (
      <div className="space-y-4 py-6">
        <p className="text-sm text-muted-foreground">{t("academy.manage.loadError")}</p>
        <Button variant="outline" onClick={() => void load()}>
          {t("academy.retry")}
        </Button>
      </div>
    );
  }

  if (!courses || !videos) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("academy.manage.loading")}
      </div>
    );
  }

  const openCourse = courses.find((course) => course.id === openCourseId) ?? null;

  if (openCourse) {
    return (
      <CourseStructure
        course={openCourse}
        onBack={() => setOpenCourseId(null)}
        onCourseChanged={(updated) =>
          setCourses((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev)
        }
      />
    );
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-semibold text-foreground">
          {t("academy.manage.title")}
        </h2>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("academy.manage.searchPlaceholder")}
            aria-label={t("academy.manage.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={(value) => setCategory(value as AcademyCategoryId | "all")}>
          <SelectTrigger className="sm:w-56" aria-label={t("academy.home.categoriesTitle")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("academy.home.allCategories")}</SelectItem>
            {ACADEMY_CATEGORIES.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {t(`academy.categories.${item.id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
          <SelectTrigger className="sm:w-44" aria-label={t("academy.manage.statusLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("academy.manage.statusAll")}</SelectItem>
            <SelectItem value="draft">{t("academy.manage.statusDraft")}</SelectItem>
            <SelectItem value="published">{t("academy.manage.statusPublished")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "courses" | "videos")}>
        <TabsList>
          <TabsTrigger value="courses">{t("academy.manage.coursesTab")}</TabsTrigger>
          <TabsTrigger value="videos">{t("academy.manage.videosTab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="courses" className="pt-4">
          <CoursesTab
            courses={visibleCourses}
            hasAny={courses.length > 0}
            onChanged={setCourses}
            onOpenStructure={(id) => setOpenCourseId(id)}
          />
        </TabsContent>
        <TabsContent value="videos" className="pt-4">
          <VideosTab videos={visibleVideos} hasAny={videos.length > 0} onChanged={setVideos} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AcademyContentStatus }) {
  const { t } = useLanguage();
  return (
    <Badge variant={status === "published" ? "default" : "secondary"}>
      {status === "published" ? t("academy.manage.statusPublished") : t("academy.manage.statusDraft")}
    </Badge>
  );
}

function EmptyBlock({ message }: { message: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-xl border border-dashed border-border bg-muted/40 px-6 py-8 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  onCancel,
  onConfirm,
  busy,
}: {
  open: boolean;
  title: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("academy.manage.cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("academy.manage.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoverPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await admin.uploadAcademyCover(file));
      toast.success(t("academy.manage.coverUploaded"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      toast.error(
        code === "ACADEMY_COVER_TYPE"
          ? t("academy.manage.coverTypeError")
          : code === "ACADEMY_COVER_SIZE"
            ? t("academy.manage.coverSizeError")
            : t("academy.manage.coverUploadError"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Label>{t("academy.manage.coverLabel")}</Label>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="h-16 w-28 rounded-md object-cover" />
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
            {t("academy.manage.coverRemove")}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={busy}
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Courses tab
// ---------------------------------------------------------------------------

function CoursesTab({
  courses,
  hasAny,
  onChanged,
  onOpenStructure,
}: {
  courses: AcademyCourseRow[];
  hasAny: boolean;
  onChanged: (next: AcademyCourseRow[] | ((prev: AcademyCourseRow[] | null) => AcademyCourseRow[] | null)) => void;
  onOpenStructure: (id: string) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<AcademyCourseRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<AcademyCourseRow | null>(null);
  const [publishing, setPublishing] = useState<AcademyCourseRow | null>(null);
  const [busy, setBusy] = useState(false);

  function replaceCourse(updated: AcademyCourseRow) {
    onChanged((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
  }

  async function handleDuplicate(course: AcademyCourseRow) {
    setBusy(true);
    try {
      const copy = await admin.duplicateCourse(course.id, `${course.title} (${t("academy.manage.copySuffix")})`);
      onChanged((prev) => (prev ? [copy, ...prev] : prev));
      toast.success(t("academy.manage.duplicated"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePublish() {
    if (!publishing) return;
    setBusy(true);
    const next = publishing.status === "published" ? "draft" : "published";
    try {
      await admin.setCourseStatus(publishing.id, next);
      replaceCourse({ ...publishing, status: next });
      toast.success(t("academy.manage.statusSaved"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
      setPublishing(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await admin.deleteCourse(deleting.id);
      onChanged((prev) => prev?.filter((c) => c.id !== deleting.id) ?? prev);
      toast.success(t("academy.manage.deleted"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("academy.manage.newCourse")}
        </Button>
      </div>

      {courses.length === 0 ? (
        <EmptyBlock message={hasAny ? t("academy.home.noResults") : t("academy.manage.coursesEmpty")} />
      ) : (
        <ul className="space-y-3">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-foreground">{course.title}</h3>
                  <StatusBadge status={course.status} />
                  {course.is_featured ? (
                    <Badge variant="outline">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      {t("academy.manage.featuredBadge")}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">{course.short_description}</p>
                <p className="text-xs text-muted-foreground">{t(`academy.categories.${course.category}`)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onOpenStructure(course.id)}>
                  {t("academy.manage.modulesButton")}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditing(course)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.edit")}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleDuplicate(course)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.duplicate")}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setPublishing(course)}>
                  {course.status === "published"
                    ? t("academy.manage.unpublish")
                    : t("academy.manage.publish")}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(course)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <CourseFormDialog
          course={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            onChanged((prev) => {
              if (!prev) return prev;
              return isNew ? [saved, ...prev] : prev.map((c) => (c.id === saved.id ? saved : c));
            });
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={publishing !== null}
        title={
          publishing?.status === "published"
            ? t("academy.manage.unpublishTitle")
            : t("academy.manage.publishTitle")
        }
        description={
          publishing?.status === "published"
            ? t("academy.manage.unpublishDescription")
            : t("academy.manage.publishDescription")
        }
        busy={busy}
        onCancel={() => setPublishing(null)}
        onConfirm={() => void handleTogglePublish()}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t("academy.manage.deleteCourseTitle")}
        description={t("academy.manage.deleteCourseDescription")}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function CourseFormDialog({
  course,
  onClose,
  onSaved,
}: {
  course: AcademyCourseRow | null;
  onClose: () => void;
  onSaved: (saved: AcademyCourseRow, isNew: boolean) => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(course?.title ?? "");
  const [shortDescription, setShortDescription] = useState(course?.short_description ?? "");
  const [fullDescription, setFullDescription] = useState(course?.full_description ?? "");
  const [category, setCategory] = useState<AcademyCategoryId | "">(course?.category ?? "");
  const [coverUrl, setCoverUrl] = useState<string | null>(course?.cover_url ?? null);
  const [status, setStatus] = useState<AcademyContentStatus>(course?.status ?? "draft");
  const [featured, setFeatured] = useState(course?.is_featured ?? false);
  const [busy, setBusy] = useState(false);

  const valid = title.trim().length > 0 && category !== "";

  async function handleSave() {
    if (!valid) return;
    setBusy(true);
    const input: admin.CourseInput = {
      title: title.trim(),
      short_description: shortDescription.trim(),
      full_description: blankToNull(fullDescription),
      category,
      cover_url: coverUrl,
      status,
      is_featured: featured,
    };
    try {
      const saved = course ? await admin.updateCourse(course.id, input) : await admin.createCourse(input);
      toast.success(t("academy.manage.saved"));
      onSaved(saved, !course);
    } catch {
      toast.error(t("academy.manage.saveError"));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {course ? t("academy.manage.editCourse") : t("academy.manage.newCourse")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="course-title">{t("academy.manage.fieldTitle")}</Label>
            <Input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-short">{t("academy.manage.fieldShortDescription")}</Label>
            <Textarea id="course-short" value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="course-full">{t("academy.manage.fieldFullDescription")}</Label>
            <Textarea id="course-full" value={fullDescription} onChange={(e) => setFullDescription(e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>{t("academy.home.categoriesTitle")}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as AcademyCategoryId)}>
              <SelectTrigger>
                <SelectValue placeholder={t("academy.manage.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {ACADEMY_CATEGORIES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {t(`academy.categories.${item.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CoverPicker value={coverUrl} onChange={setCoverUrl} />
          <div className="space-y-2">
            <Label>{t("academy.manage.statusLabel")}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as AcademyContentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("academy.manage.statusDraft")}</SelectItem>
                <SelectItem value="published">{t("academy.manage.statusPublished")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={featured} onCheckedChange={(checked) => setFeatured(checked === true)} />
            {t("academy.manage.fieldFeatured")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("academy.manage.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("academy.manage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Course structure (modules + lessons)
// ---------------------------------------------------------------------------

function CourseStructure({
  course,
  onBack,
  onCourseChanged,
}: {
  course: AcademyCourseRow;
  onBack: () => void;
  onCourseChanged: (updated: AcademyCourseRow) => void;
}) {
  const { t } = useLanguage();
  const [modules, setModules] = useState<AcademyModuleRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editingModule, setEditingModule] = useState<AcademyModuleRow | "new" | null>(null);
  const [deletingModule, setDeletingModule] = useState<AcademyModuleRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setModules(await admin.fetchCourseModules(course.id));
    } catch {
      setLoadError(true);
    }
  }, [course.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(index: number, direction: -1 | 1) {
    if (!modules) return;
    const target = index + direction;
    if (target < 0 || target >= modules.length) return;
    const next = [...modules];
    [next[index], next[target]] = [next[target], next[index]];
    setModules(next);
    try {
      await admin.reorderModules(next.map((m) => m.id));
    } catch {
      toast.error(t("academy.manage.saveError"));
      void load();
    }
  }

  async function handleDeleteModule() {
    if (!deletingModule) return;
    setBusy(true);
    try {
      await admin.deleteModule(deletingModule.id);
      setModules((prev) => prev?.filter((m) => m.id !== deletingModule.id) ?? prev);
      toast.success(t("academy.manage.deleted"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
      setDeletingModule(null);
    }
  }

  return (
    <div className="space-y-6 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t("academy.manage.backToCourses")}
        </Button>
        <h2 className="font-display text-xl font-semibold text-foreground">{course.title}</h2>
        <StatusBadge status={course.status} />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setEditingModule("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("academy.manage.newModule")}
        </Button>
      </div>

      {loadError ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("academy.manage.loadError")}</p>
          <Button variant="outline" onClick={() => void load()}>
            {t("academy.retry")}
          </Button>
        </div>
      ) : !modules ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t("academy.manage.loading")}
        </div>
      ) : modules.length === 0 ? (
        <EmptyBlock message={t("academy.manage.modulesEmpty")} />
      ) : (
        <ul className="space-y-4">
          {modules.map((module, index) => (
            <li key={module.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">{index + 1}.</span>
                <h3 className="min-w-0 flex-1 font-display text-base font-semibold text-foreground">
                  {module.title}
                </h3>
                <Button variant="ghost" size="icon" aria-label={t("academy.manage.moveUp")} disabled={index === 0} onClick={() => void move(index, -1)}>
                  <ChevronUp className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("academy.manage.moveDown")} disabled={index === modules.length - 1} onClick={() => void move(index, 1)}>
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEditingModule(module)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.edit")}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeletingModule(module)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.delete")}
                </Button>
              </div>
              {module.description ? (
                <p className="text-sm text-muted-foreground">{module.description}</p>
              ) : null}
              <ModuleLessons moduleId={module.id} />
            </li>
          ))}
        </ul>
      )}

      {editingModule ? (
        <ModuleFormDialog
          module={editingModule === "new" ? null : editingModule}
          nextPosition={modules?.length ?? 0}
          courseId={course.id}
          onClose={() => setEditingModule(null)}
          onSaved={() => {
            setEditingModule(null);
            void load();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deletingModule !== null}
        title={t("academy.manage.deleteModuleTitle")}
        description={t("academy.manage.deleteModuleDescription")}
        busy={busy}
        onCancel={() => setDeletingModule(null)}
        onConfirm={() => void handleDeleteModule()}
      />
    </div>
  );
}

function ModuleFormDialog({
  module,
  courseId,
  nextPosition,
  onClose,
  onSaved,
}: {
  module: AcademyModuleRow | null;
  courseId: string;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(module?.title ?? "");
  const [description, setDescription] = useState(module?.description ?? "");
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setBusy(true);
    const input = { title: title.trim(), description: blankToNull(description), position: module?.position ?? nextPosition };
    try {
      if (module) await admin.updateModule(module.id, input);
      else await admin.createModule(courseId, input);
      toast.success(t("academy.manage.saved"));
      onSaved();
    } catch {
      toast.error(t("academy.manage.saveError"));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{module ? t("academy.manage.editModule") : t("academy.manage.newModule")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="module-title">{t("academy.manage.fieldTitle")}</Label>
            <Input id="module-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="module-description">{t("academy.manage.fieldDescription")}</Label>
            <Textarea id="module-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("academy.manage.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={!title.trim() || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("academy.manage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ModuleLessons({ moduleId }: { moduleId: string }) {
  const { t } = useLanguage();
  const [lessons, setLessons] = useState<AcademyLessonRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<AcademyLessonRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<AcademyLessonRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      setLessons(await admin.fetchModuleLessons(moduleId));
    } catch {
      setLoadError(true);
    }
  }, [moduleId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(index: number, direction: -1 | 1) {
    if (!lessons) return;
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const next = [...lessons];
    [next[index], next[target]] = [next[target], next[index]];
    setLessons(next);
    try {
      await admin.reorderLessons(next.map((l) => l.id));
    } catch {
      toast.error(t("academy.manage.saveError"));
      void load();
    }
  }

  async function handleDuplicate(lesson: AcademyLessonRow) {
    setBusy(true);
    try {
      await admin.createLesson(moduleId, {
        title: `${lesson.title} (${t("academy.manage.copySuffix")})`,
        description: lesson.description,
        youtube_id: lesson.youtube_id,
        duration_minutes: lesson.duration_minutes,
        position: (lessons?.length ?? 0),
        status: "draft",
      });
      toast.success(t("academy.manage.duplicated"));
      void load();
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await admin.deleteLesson(deleting.id);
      setLessons((prev) => prev?.filter((l) => l.id !== deleting.id) ?? prev);
      toast.success(t("academy.manage.deleted"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">{t("academy.manage.lessonsTitle")}</h4>
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("academy.manage.newLesson")}
        </Button>
      </div>
      {loadError ? (
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">{t("academy.manage.loadError")}</p>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            {t("academy.retry")}
          </Button>
        </div>
      ) : !lessons ? (
        <p className="text-xs text-muted-foreground">{t("academy.manage.loading")}</p>
      ) : lessons.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("academy.manage.lessonsEmpty")}</p>
      ) : (
        <ul className="space-y-2">
          {lessons.map((lesson, index) => (
            <li key={lesson.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
              <span className="text-xs text-muted-foreground">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">{lesson.title}</span>
              <StatusBadge status={lesson.status} />
              {lesson.duration_minutes ? (
                <span className="text-xs text-muted-foreground">{lesson.duration_minutes} min</span>
              ) : null}
              <Button variant="ghost" size="icon" aria-label={t("academy.manage.moveUp")} disabled={index === 0} onClick={() => void move(index, -1)}>
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t("academy.manage.moveDown")} disabled={index === lessons.length - 1} onClick={() => void move(index, 1)}>
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(lesson)}>
                <Pencil className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleDuplicate(lesson)}>
                <Copy className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(lesson)}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <LessonFormDialog
          lesson={editing === "new" ? null : editing}
          moduleId={moduleId}
          nextPosition={lessons?.length ?? 0}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        title={t("academy.manage.deleteLessonTitle")}
        description={t("academy.manage.deleteLessonDescription")}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function LessonFormDialog({
  lesson,
  moduleId,
  nextPosition,
  onClose,
  onSaved,
}: {
  lesson: AcademyLessonRow | null;
  moduleId: string;
  nextPosition: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [youtube, setYoutube] = useState(lesson?.youtube_id ?? "");
  const [duration, setDuration] = useState(lesson?.duration_minutes?.toString() ?? "");
  const [status, setStatus] = useState<AcademyContentStatus>(lesson?.status ?? "draft");
  const [busy, setBusy] = useState(false);

  const youtubeId = extractYoutubeId(youtube);
  const valid = title.trim().length > 0 && youtubeId !== null;

  async function handleSave() {
    if (!valid || !youtubeId) return;
    setBusy(true);
    const input: admin.LessonInput = {
      title: title.trim(),
      description: blankToNull(description),
      youtube_id: youtubeId,
      duration_minutes: parseOptionalDuration(duration),
      position: lesson?.position ?? nextPosition,
      status,
    };
    try {
      if (lesson) await admin.updateLesson(lesson.id, input);
      else await admin.createLesson(moduleId, input);
      toast.success(t("academy.manage.saved"));
      onSaved();
    } catch {
      toast.error(t("academy.manage.saveError"));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lesson ? t("academy.manage.editLesson") : t("academy.manage.newLesson")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lesson-title">{t("academy.manage.fieldTitle")}</Label>
            <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lesson-description">{t("academy.manage.fieldDescription")}</Label>
            <Textarea id="lesson-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lesson-youtube">{t("academy.manage.fieldYoutube")}</Label>
            <Input
              id="lesson-youtube"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            {youtube.trim() && !youtubeId ? (
              <p className="text-xs text-destructive">{t("academy.manage.youtubeInvalid")}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="lesson-duration">{t("academy.manage.fieldDuration")}</Label>
            <Input id="lesson-duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("academy.manage.statusLabel")}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as AcademyContentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("academy.manage.statusDraft")}</SelectItem>
                <SelectItem value="published">{t("academy.manage.statusPublished")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("academy.manage.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("academy.manage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Independent videos tab
// ---------------------------------------------------------------------------

function VideosTab({
  videos,
  hasAny,
  onChanged,
}: {
  videos: AcademyVideoRow[];
  hasAny: boolean;
  onChanged: (next: AcademyVideoRow[] | ((prev: AcademyVideoRow[] | null) => AcademyVideoRow[] | null)) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState<AcademyVideoRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<AcademyVideoRow | null>(null);
  const [publishing, setPublishing] = useState<AcademyVideoRow | null>(null);
  const [busy, setBusy] = useState(false);

  function replaceVideo(updated: AcademyVideoRow) {
    onChanged((prev) => prev?.map((v) => (v.id === updated.id ? updated : v)) ?? prev);
  }

  async function handleDuplicate(video: AcademyVideoRow) {
    setBusy(true);
    try {
      const copy = await admin.duplicateVideo(video.id, `${video.title} (${t("academy.manage.copySuffix")})`);
      onChanged((prev) => (prev ? [copy, ...prev] : prev));
      toast.success(t("academy.manage.duplicated"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePublish() {
    if (!publishing) return;
    setBusy(true);
    const next = publishing.status === "published" ? "draft" : "published";
    try {
      await admin.setVideoStatus(publishing.id, next);
      replaceVideo({ ...publishing, status: next });
      toast.success(t("academy.manage.statusSaved"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
      setPublishing(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      await admin.deleteVideo(deleting.id);
      onChanged((prev) => prev?.filter((v) => v.id !== deleting.id) ?? prev);
      toast.success(t("academy.manage.deleted"));
    } catch {
      toast.error(t("academy.manage.saveError"));
    } finally {
      setBusy(false);
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("academy.manage.newVideo")}
        </Button>
      </div>

      {videos.length === 0 ? (
        <EmptyBlock message={hasAny ? t("academy.home.noResults") : t("academy.manage.videosEmpty")} />
      ) : (
        <ul className="space-y-3">
          {videos.map((video) => (
            <li key={video.id} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-foreground">{video.title}</h3>
                  <StatusBadge status={video.status} />
                  {video.is_featured ? (
                    <Badge variant="outline">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      {t("academy.manage.featuredBadge")}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(`academy.categories.${video.category}`)}
                  {video.duration_minutes ? ` · ${video.duration_minutes} min` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(video)}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.edit")}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void handleDuplicate(video)}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.duplicate")}
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setPublishing(video)}>
                  {video.status === "published" ? t("academy.manage.unpublish") : t("academy.manage.publish")}
                </Button>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDeleting(video)}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  {t("academy.manage.delete")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <VideoFormDialog
          video={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            onChanged((prev) => {
              if (!prev) return prev;
              return isNew ? [saved, ...prev] : prev.map((v) => (v.id === saved.id ? saved : v));
            });
            setEditing(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={publishing !== null}
        title={publishing?.status === "published" ? t("academy.manage.unpublishTitle") : t("academy.manage.publishTitle")}
        description={publishing?.status === "published" ? t("academy.manage.unpublishDescription") : t("academy.manage.publishDescription")}
        busy={busy}
        onCancel={() => setPublishing(null)}
        onConfirm={() => void handleTogglePublish()}
      />
      <ConfirmDialog
        open={deleting !== null}
        title={t("academy.manage.deleteVideoTitle")}
        description={t("academy.manage.deleteVideoDescription")}
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function VideoFormDialog({
  video,
  onClose,
  onSaved,
}: {
  video: AcademyVideoRow | null;
  onClose: () => void;
  onSaved: (saved: AcademyVideoRow, isNew: boolean) => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(video?.title ?? "");
  const [description, setDescription] = useState(video?.description ?? "");
  const [category, setCategory] = useState<AcademyCategoryId | "">(video?.category ?? "");
  const [youtube, setYoutube] = useState(video?.youtube_id ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(video?.thumbnail_url ?? null);
  const [duration, setDuration] = useState(video?.duration_minutes?.toString() ?? "");
  const [status, setStatus] = useState<AcademyContentStatus>(video?.status ?? "draft");
  const [featured, setFeatured] = useState(video?.is_featured ?? false);
  const [busy, setBusy] = useState(false);

  const youtubeId = extractYoutubeId(youtube);
  const valid = title.trim().length > 0 && category !== "" && youtubeId !== null;

  async function handleSave() {
    if (!valid || !youtubeId) return;
    setBusy(true);
    const input: admin.VideoInput = {
      title: title.trim(),
      description: blankToNull(description),
      category,
      youtube_id: youtubeId,
      thumbnail_url: thumbnailUrl,
      duration_minutes: parseOptionalDuration(duration),
      status,
      is_featured: featured,
    };
    try {
      if (video) {
        await admin.updateVideo(video.id, input);
        onSaved({ ...video, ...input, category }, false);
      } else {
        const saved = await admin.createVideo(input);
        onSaved(saved, true);
      }
      toast.success(t("academy.manage.saved"));
    } catch {
      toast.error(t("academy.manage.saveError"));
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{video ? t("academy.manage.editVideo") : t("academy.manage.newVideo")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="video-title">{t("academy.manage.fieldTitle")}</Label>
            <Input id="video-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-description">{t("academy.manage.fieldDescription")}</Label>
            <Textarea id="video-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>{t("academy.home.categoriesTitle")}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as AcademyCategoryId)}>
              <SelectTrigger>
                <SelectValue placeholder={t("academy.manage.selectCategory")} />
              </SelectTrigger>
              <SelectContent>
                {ACADEMY_CATEGORIES.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {t(`academy.categories.${item.id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="video-youtube">{t("academy.manage.fieldYoutube")}</Label>
            <Input
              id="video-youtube"
              value={youtube}
              onChange={(e) => setYoutube(e.target.value)}
              placeholder="https://youtu.be/…"
            />
            {youtube.trim() && !youtubeId ? (
              <p className="text-xs text-destructive">{t("academy.manage.youtubeInvalid")}</p>
            ) : null}
          </div>
          <CoverPicker value={thumbnailUrl} onChange={setThumbnailUrl} />
          <div className="space-y-2">
            <Label htmlFor="video-duration">{t("academy.manage.fieldDuration")}</Label>
            <Input id="video-duration" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("academy.manage.statusLabel")}</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as AcademyContentStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">{t("academy.manage.statusDraft")}</SelectItem>
                <SelectItem value="published">{t("academy.manage.statusPublished")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox checked={featured} onCheckedChange={(checked) => setFeatured(checked === true)} />
            {t("academy.manage.fieldFeatured")}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t("academy.manage.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={!valid || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t("academy.manage.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

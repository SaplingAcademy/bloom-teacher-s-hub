import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import type { DailyPriorityItem } from "@/lib/daily-priorities";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/lesson-plans";
import {
  loadAttendanceRoster,
  loadLessonHomework,
  markHomeworkSent,
  saveRosterAttendance,
  type AttendanceRoster,
  type LessonHomework,
} from "@/lib/priority-resolution";

interface PriorityResolutionPanelProps {
  teacherId: string;
  item: DailyPriorityItem;
  /** Re-read priorities after a successful save; resolved items disappear on their own. */
  onSaved: () => Promise<unknown> | void;
}

/** Inline quick actions for attendance and homework priorities (Today). */
export function PriorityResolutionPanel({ teacherId, item, onSaved }: PriorityResolutionPanelProps) {
  if (item.reason === "attendance_missing") return <AttendanceResolution teacherId={teacherId} item={item} onSaved={onSaved} />;
  if (item.reason === "homework_not_posted") return <HomeworkResolution teacherId={teacherId} item={item} onSaved={onSaved} />;
  return null;
}

/** Priorities that can be resolved inline in this stage. */
export function isInlineResolvable(item: DailyPriorityItem): boolean {
  return (item.reason === "attendance_missing" || item.reason === "homework_not_posted") && Boolean(item.ref.eventId);
}

const STATUS_ORDER: AttendanceStatus[] = ["present", "late", "absent", "excused"].filter((s) =>
  ATTENDANCE_STATUSES.includes(s as AttendanceStatus),
) as AttendanceStatus[];

function AttendanceResolution({ teacherId, item, onSaved }: PriorityResolutionPanelProps) {
  const { t } = useLanguage();
  const [roster, setRoster] = useState<AttendanceRoster | null>(null);
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus | null>>({});
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed by the priority id: a background re-read of the list must not reset selections.
  useEffect(() => {
    let active = true;
    loadAttendanceRoster(teacherId, item)
      .then((r) => {
        if (!active) return;
        setRoster(r);
        setStatuses(Object.fromEntries(r.entries.map((e) => [e.studentId, e.status])));
      })
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, item.id]);

  if (loadError) return <p role="alert" className="text-xs text-destructive">{t("today.resolve.loadError")}</p>;
  if (!roster) return <p className="text-xs text-stone-500">{t("today.resolve.loading")}</p>;
  if (roster.entries.length === 0) return <p className="text-xs text-stone-500">{t("today.resolve.noStudents")}</p>;

  const save = async () => {
    if (!Object.values(statuses).some(Boolean)) {
      setError(t("today.resolve.selectOne"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveRosterAttendance(teacherId, roster, statuses);
      const complete = roster.entries.every((e) => statuses[e.studentId]);
      toast.success(t(complete ? "today.resolve.attendanceSaved" : "today.resolve.attendancePartial"));
      await onSaved();
    } catch (err) {
      console.error("[PriorityResolution] attendance save failed:", err);
      setError(t("today.resolve.attendanceError")); // selections stay as filled
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-bold text-stone-800">{t("today.resolve.attendanceTitle")}</p>
        <p className="text-[11px] text-stone-500">{t("today.resolve.attendanceHint")}</p>
      </div>
      <ul className="space-y-2">
        {roster.entries.map((entry) => (
          <li key={entry.studentId} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 truncate text-xs font-semibold text-stone-800">{entry.name}</span>
            <div role="radiogroup" aria-label={entry.name} className="flex flex-wrap gap-1">
              {STATUS_ORDER.map((status) => {
                const selected = statuses[entry.studentId] === status;
                return (
                  <button
                    key={status}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => setStatuses((prev) => ({ ...prev, [entry.studentId]: status }))}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      selected
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                    }`}
                  >
                    {t(`today.resolve.status_${status}`)}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={saving} onClick={() => void save()} className="h-8 text-xs font-bold">
        {saving ? t("today.resolve.saving") : t("today.resolve.saveAttendance")}
      </Button>
    </div>
  );
}

function HomeworkResolution({ teacherId, item, onSaved }: PriorityResolutionPanelProps) {
  const { t } = useLanguage();
  const [homework, setHomework] = useState<LessonHomework | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventId = item.ref.eventId!;

  useEffect(() => {
    let active = true;
    loadLessonHomework(teacherId, eventId)
      .then((h) => active && setHomework(h))
      .catch(() => active && setLoadError(true));
    return () => { active = false; };
  }, [teacherId, eventId]);

  if (loadError) return <p role="alert" className="text-xs text-destructive">{t("today.resolve.loadError")}</p>;
  if (!homework) return <p className="text-xs text-stone-500">{t("today.resolve.loading")}</p>;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await markHomeworkSent(teacherId, eventId);
      toast.success(t("today.resolve.homeworkSaved"));
      await onSaved();
    } catch (err) {
      console.error("[PriorityResolution] homework status save failed:", err);
      setError(t("today.resolve.homeworkError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-stone-800">{t("today.resolve.homeworkTitle")}</p>
        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-900">
          {t(`today.resolve.homeworkStatus_${homework.status}`)}
        </span>
      </div>
      <p className="whitespace-pre-wrap break-words rounded-lg bg-stone-50 p-2.5 text-xs text-stone-700">
        {homework.homework.trim() || t("today.resolve.homeworkEmpty")}
      </p>
      <p className="text-[11px] text-stone-500">{t("today.resolve.homeworkNote")}</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={saving || homework.status === "posted"} onClick={() => void save()} className="h-8 text-xs font-bold">
        {saving ? t("today.resolve.saving") : t("today.resolve.markSent")}
      </Button>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { SaveErrorMessage } from "@/components/bloom/SaveFeedback";
import { rescheduleOccurrence } from "@/lib/reschedule-occurrence";

const toMin = (t: string) => {
  const [h, m] = String(t || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fromMin = (n: number) => {
  const v = ((n % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};

export interface RescheduleLessonTarget {
  id: string;
  studentName: string;
  date: string;
  startTime: string;
  endTime: string;
  duration?: number;
}

export function RescheduleLessonDialog({
  lesson,
  open,
  onOpenChange,
  onRescheduled,
}: {
  lesson: RescheduleLessonTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRescheduled: () => void | Promise<void>;
}) {
  const { t } = useLanguage();
  const [newDate, setNewDate] = useState("");
  const [newStart, setNewStart] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && lesson) {
      setNewDate(lesson.date);
      setNewStart(lesson.startTime.slice(0, 5));
      setError(null);
    }
  }, [open, lesson?.id]);

  if (!lesson) return null;
  const span = toMin(lesson.endTime) - toMin(lesson.startTime);
  const duration = span > 0 ? span : Number(lesson.duration) || 0;
  const newEnd = newStart && duration ? fromMin(toMin(newStart) + duration) : "";

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    const res = await rescheduleOccurrence(lesson.id, newDate, newStart);
    setSaving(false);
    if (res.ok) {
      onOpenChange(false);
      await onRescheduled();
      return;
    }
    const known = ["conflict", "outside_working_hours", "non_working_day", "locked"];
    const key = known.includes(res.reason) ? res.reason : "save_failed";
    setError(t(`calendarUi.rescheduleErr_${key}`));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-bold">{t("calendarUi.rescheduleTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-border/60 bg-secondary/40 p-3">
            <p className="font-semibold text-foreground truncate">{lesson.studentName}</p>
            <p className="text-xs text-muted-foreground">
              {t("calendarUi.rescheduleCurrent")}: {lesson.date} · {lesson.startTime.slice(0, 5)}–{lesson.endTime.slice(0, 5)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-date">{t("calendarUi.rescheduleNewDate")}</Label>
              <Input id="reschedule-date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reschedule-start">{t("calendarUi.rescheduleNewStart")}</Label>
              <Input id="reschedule-start" type="time" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
            </div>
          </div>
          {newEnd && (
            <p className="text-xs text-muted-foreground">
              {t("calendarUi.rescheduleNewEnd")}: {newEnd}
            </p>
          )}
          <SaveErrorMessage message={error} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("calendarUi.rescheduleCancel")}
            </Button>
            <Button onClick={handleConfirm} disabled={saving || !newDate || !newStart}>
              {saving ? t("calendarUi.rescheduling") : t("calendarUi.rescheduleConfirm")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

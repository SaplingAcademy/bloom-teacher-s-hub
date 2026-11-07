import { currentLanguage, reportUserError, toUserMessage } from "@/lib/user-error";
import { t as i18nT } from "@/lib/i18n";
import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  BookOpen,
  Loader2,
} from "lucide-react";
import {
  LessonScheduleInput,
  generateLessonPlanOccurrences,
  StudentLesson,
  generateStudentLessonPlan,
  fetchStudentScheduleInputs,
} from "@/lib/lesson-plan-sync";
import { fetchTeacherTimeOff, TeacherTimeOff } from "@/lib/time-off-engine";
import { CEFRLevel, CourseFocus } from "@/lib/calendar-sync";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { LessonCountPresetPicker, type LessonCountSelection } from "@/components/bloom/LessonCountPresetPicker";
import { initialLessonPlanPeriod } from "@/lib/lesson-plan-period";

import { InsufficientLessonPeriodError, validateLessonPeriod, type LessonPlanQuantity } from "@/lib/lesson-plan-quantity";
import { LessonPlanQuantityDialog } from "./LessonPlanQuantityDialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  teacherId: string;
  studentName: string;
  level?: CEFRLevel;
  focus?: CourseFocus;
  initialSchedules?: LessonScheduleInput[];
  initialStartDate?: string;
  initialEndDate?: string;
  packageLessonCount?: number;
  existingLessonsCount?: number;
  onSuccess: (generatedLessons: StudentLesson[]) => void;
}

export function GenerateLessonPlanModal({
  isOpen,
  onClose,
  studentId,
  teacherId,
  studentName,
  level = "B2",
  focus = "General English",
  initialSchedules = [],
  initialStartDate = "",
  initialEndDate = "",
  packageLessonCount,
  existingLessonsCount = 0,
  onSuccess,
}: Props) {
  const { t } = useLanguage();
  const [shortage, setShortage] = useState<LessonPlanQuantity | null>(null);
  const [resetVersion, setResetVersion] = useState(0);
  const periodRef = React.useRef<HTMLInputElement>(null);
  const countRef = React.useRef<HTMLDivElement>(null);
  const submitting = React.useRef(false);
  const focusPeriod = () => requestAnimationFrame(() => periodRef.current?.focus());
  const edit = () => { setShortage(null); focusPeriod(); };
  const restart = () => {
    setResetVersion((version) => version + 1);
    setShortage(null); setQuantityType("custom"); setCustomQuantity(0); setCustomCountInvalid(true);
    setStartDate(""); setEndDate(""); setSchedules([]); setScheduleSource("empty"); setErrorMessage(null);
    requestAnimationFrame(() => { countRef.current?.scrollIntoView({ block: "nearest" }); countRef.current?.querySelector<HTMLInputElement>("input")?.focus(); });
  };
  // Form State
  const [quantityType, setQuantityType] = useState<LessonCountSelection>(20);
  const [customQuantity, setCustomQuantity] = useState<number>(packageLessonCount || 20);
  const [customCountInvalid, setCustomCountInvalid] = useState(false);
  const [startDate, setStartDate] = useState<string>(() => initialLessonPlanPeriod({ startDate: initialStartDate }).startDate);
  const [endDate, setEndDate] = useState<string>(() => initialLessonPlanPeriod({ endDate: initialEndDate }).endDate);
  const [schedules, setSchedules] = useState<LessonScheduleInput[]>([]);
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [scheduleSource, setScheduleSource] = useState<"student" | "manual" | "empty">("empty");

  // Initialize schedule rows from the student's saved recurring schedule
  // (`student_schedules` = source of truth) & load teacher non-working days.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const period = initialLessonPlanPeriod({ startDate: initialStartDate, endDate: initialEndDate });
    setStartDate(period.startDate);
    setEndDate(period.endDate);

    if (teacherId) {
      setTimeOffList([]);
      fetchTeacherTimeOff(teacherId).then((list) => {
        if (!cancelled) setTimeOffList(list);
      }).catch(() => { if (!cancelled) setErrorMessage(t("lessonPlanGeneration.loadError")); });
    }

    const normalize = (list: LessonScheduleInput[]) =>
      list.map((s) => ({
        id: s.id,
        weekday: s.weekday || "Monday",
        startTime: (s.startTime || "10:00").slice(0, 5),
        endTime: (s.endTime || "11:00").slice(0, 5),
        duration: s.duration || 60,
      }));

    setIsLoadingSchedules(true);
    fetchStudentScheduleInputs(studentId)
      .then((saved) => {
        if (cancelled) return;
        if (saved.length > 0) {
          setSchedules(normalize(saved));
          setScheduleSource("student");
        } else if (initialSchedules && initialSchedules.length > 0) {
          setSchedules(normalize(initialSchedules));
          setScheduleSource("student");
        } else {
          setSchedules([]);
          setScheduleSource("empty");
        }
      })
      .catch(() => { if (!cancelled) setErrorMessage(t("lessonPlanGeneration.loadError")); })
      .finally(() => {
        if (!cancelled) setIsLoadingSchedules(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, studentId, initialStartDate, initialEndDate, teacherId]);

  // Determine total lesson count to generate
  const getTargetLessonCount = (): number => {
    return quantityType === "custom" ? Number(customQuantity) : quantityType;
  };

  const targetCount = getTargetLessonCount();

  // Expected Final Lesson Date (Live calculation preview respecting time off)
  const expectedEndDate = React.useMemo(() => {
    if (!startDate || schedules.length === 0 || targetCount <= 0) return "";
    try {
      const eligible = generateLessonPlanOccurrences(startDate, schedules, targetCount, studentId, teacherId, timeOffList, endDate);
      return eligible.slice(0, targetCount).at(-1)?.scheduled_date || "";
    } catch { return ""; }
  }, [startDate, endDate, schedules, targetCount, timeOffList, studentId, teacherId]);

  // Schedule row actions
  const handleAddScheduleRow = () => {
    setSchedules((prev) => [
      ...prev,
      { weekday: "Friday", startTime: "10:00", endTime: "11:00", duration: 60 },
    ]);
    setScheduleSource("manual");
  };

  const handleRemoveScheduleRow = (index: number) => {
    setSchedules((prev) => prev.filter((_, i) => i !== index));
    setScheduleSource("manual");
  };

  const handleUpdateScheduleRow = (index: number, field: keyof LessonScheduleInput, value: any) => {
    setScheduleSource("manual");
    setSchedules((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      if (field === "startTime" || field === "endTime") {
        const start = String(updated[index].startTime || "");
        const end = String(updated[index].endTime || "");
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        const diff = eh * 60 + em - (sh * 60 + sm);
        if (Number.isFinite(diff) && diff > 0) updated[index].duration = diff;
      }
      return updated;
    });
  };

  // The operation revalidates with fresh persisted exclusions before any write.
  const handleConfirmGenerate = async () => {
    if (submitting.current) return;
    setErrorMessage(null);
    try { validateLessonPeriod(startDate, endDate); }
    catch { setErrorMessage(t("lessonPlanGeneration.invalidPeriod")); focusPeriod(); return; }
    if (!schedules.length) { setErrorMessage(t("lessonPlanGeneration.emptySchedule")); return; }
    if ((quantityType === "custom" && customCountInvalid) || !Number.isSafeInteger(targetCount) || targetCount <= 0) {
      setErrorMessage(t("lessonPlanGeneration.quantityRequired")); return;
    }
    submitting.current = true;
    setIsGenerating(true);
    try {
      const saved = await generateStudentLessonPlan({ studentId, teacherId, studentName, level, focus,
        startDate, endDate, schedules, requested: targetCount });
      toast.success(t("lessonPlanGeneration.success").replace("{count}", String(saved.length)).replace("{name}", studentName));
      onSuccess(saved); onClose();
    } catch (error) {
      if (error instanceof InsufficientLessonPeriodError) setShortage(error.quantity);
      else { setErrorMessage(t("lessonPlanGeneration.saveError")); toast.error(t("lessonPlanGeneration.saveError")); }
    } finally { submitting.current = false; setIsGenerating(false); }
  };

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !submitting.current && !shortage) onClose(); }}>
      <DialogContent closeLabel={t("common.close")} onInteractOutside={(e) => { if (isGenerating || shortage) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (isGenerating || shortage) e.preventDefault(); }} className="w-[calc(100%-1rem)] max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 bg-card border-border shadow-lg">
        <DialogHeader className="space-y-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                {t("students.modalGenerateTitle")}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {t("students.modalGenerateSubtitle").replace("{studentName}", studentName)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{t("students.generationErrorTitle")}</p>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        <fieldset disabled={isGenerating || isLoadingSchedules} className="space-y-6 py-2 min-w-0">
          {/* STEP 1: NUMBER OF LESSONS */}
          <div ref={countRef} className="space-y-3">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t("students.modalStepLessons")}</span>
              <span className="text-muted-foreground font-normal">{t("students.modalTargetLessons").replace("{count}", String(targetCount))}</span>
            </Label>

            <LessonCountPresetPicker
              key={resetVersion}
              selected={quantityType}
              onSelect={setQuantityType}
              customQuantity={customQuantity}
              onCustomQuantityChange={setCustomQuantity}
              onCustomValidityChange={setCustomCountInvalid}
              inputId="custom-qty"
              customLabel={t("students.modalEnterCustomQty")}
            />
          </div>

          {/* STEP 2: START DATE */}
          <div className="space-y-2">
            <Label htmlFor="start-date" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t("students.modalStepStartDate")}</span>
              <span className="text-muted-foreground font-normal text-[11px]">{t("students.modalFirstLessonDate")}</span>
            </Label>
            <Input
              ref={periodRef}
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 text-sm font-mono bg-background border-border"
            />
            <Label htmlFor="end-date" className="text-xs font-semibold text-foreground pt-2 block">
              {t("students.modalCourseEndDate")}
            </Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 text-sm font-mono bg-background border-border"
            />
          </div>

          {/* STEP 3: WEEKLY SCHEDULE ROWS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-semibold text-foreground">
                  {t("students.modalStepSchedule")}
                </Label>
                {scheduleSource === "student" && schedules.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] font-semibold gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {t("lessonPlanGeneration.scheduleSource")}
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleAddScheduleRow}
                className="h-7 text-xs text-primary hover:bg-primary/10 gap-1"
              >
                <Plus className="w-3 h-3" />
                {t("students.modalAddScheduleRow")}
              </Button>
            </div>

            <div className="space-y-2 border border-border/80 rounded-xl p-3 bg-muted/20">
              {isLoadingSchedules && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-2">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>{t("globalUi.loadingStudentSchedule")}</span>
                </div>
              )}

              {!isLoadingSchedules && schedules.length === 0 && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground px-1 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    {t("lessonPlanGeneration.emptySchedule")}
                  </span>
                </div>
              )}

              {schedules.map((row, idx) => (
                <div
                  key={`sched-row-${idx}`}
                  className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:flex items-center gap-2 bg-card p-2 rounded-lg border border-border/60 shadow-2xs"
                >
                  {/* Weekday */}
                  <Select
                    value={row.weekday}
                    onValueChange={(val) => handleUpdateScheduleRow(idx, "weekday", val)}
                  >
                    <SelectTrigger className="h-9 text-xs flex-1 col-span-3 min-w-0 bg-background border-border">
                      <SelectValue placeholder={t("students.modalWeekday")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Monday">{t("weekdays.Monday")}</SelectItem>
                      <SelectItem value="Tuesday">{t("weekdays.Tuesday")}</SelectItem>
                      <SelectItem value="Wednesday">{t("weekdays.Wednesday")}</SelectItem>
                      <SelectItem value="Thursday">{t("weekdays.Thursday")}</SelectItem>
                      <SelectItem value="Friday">{t("weekdays.Friday")}</SelectItem>
                      <SelectItem value="Saturday">{t("weekdays.Saturday")}</SelectItem>
                      <SelectItem value="Sunday">{t("weekdays.Sunday")}</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Start Time */}
                  <div className="w-full sm:w-28 min-w-0">
                    <Input
                      type="time"
                      aria-label={t("lessonPlanGeneration.slotStart").replace("{number}", String(idx + 1))}
                      value={row.startTime}
                      onChange={(e) => handleUpdateScheduleRow(idx, "startTime", e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                      placeholder={t("students.modalStartTime")}
                    />
                  </div>

                  {/* End Time */}
                  <div className="w-full sm:w-28 min-w-0">
                    <Input
                      type="time"
                      aria-label={t("lessonPlanGeneration.slotEnd").replace("{number}", String(idx + 1))}
                      value={row.endTime || "11:00"}
                      onChange={(e) => handleUpdateScheduleRow(idx, "endTime", e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                      placeholder={t("students.modalEndTime")}
                    />
                  </div>

                  {/* Remove Row Button */}
                  <Button
                    type="button" variant="ghost" size="icon"
                    aria-label={t("students.modalRemoveRow")}
                    onClick={() => handleRemoveScheduleRow(idx)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title={t("students.modalRemoveRow")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* STEP 4: REVIEW SUMMARY BOX */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <CheckCircle2 className="w-4 h-4" />
              <span>{t("students.modalReviewTitle")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-foreground/90 pt-1">
              <div>
                <span className="text-muted-foreground">{t("students.modalReviewStudent")}</span> <span className="font-semibold">{studentName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("students.modalReviewTotal")}</span> <span className="font-semibold">{t("students.lessonsCountPlural").replace("{count}", String(targetCount))}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("students.modalReviewStartDate")}</span> <span className="font-mono font-semibold">{startDate}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t("students.modalReviewEndDate")}</span>{" "}
                <span className="font-mono font-semibold text-primary">{expectedEndDate || t("students.modalCalculating")}</span>
              </div>
            </div>
          </div>
        </fieldset>

        <DialogFooter className="gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={() => { if (!submitting.current && !shortage) onClose(); }}
            disabled={isGenerating || Boolean(shortage)}
            className="h-10 text-xs"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirmGenerate}
            disabled={isGenerating || isLoadingSchedules}
            className="h-10 text-xs font-semibold gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("students.modalGenerating")}
              </>
            ) : (
              <>
                <BookOpen className="w-4 h-4" />
                {t("students.modalGenerateBtn").replace("{count}", String(targetCount))}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <LessonPlanQuantityDialog quantity={shortage} onEdit={edit} onRestart={restart} />
    </>
  );
}

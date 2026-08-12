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
  Sparkles,
  Calendar,
  Clock,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
import {
  LessonScheduleInput,
  generateLessonPlanOccurrences,
  calculateExpectedEndDate,
  StudentLesson,
  saveStudentLessons,
} from "@/lib/lesson-plan-sync";
import { fetchTeacherTimeOff, TeacherTimeOff } from "@/lib/time-off-engine";
import { CEFRLevel, CourseFocus } from "@/lib/calendar-sync";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";

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
  initialStartDate = new Date().toISOString().split("T")[0],
  packageLessonCount,
  existingLessonsCount = 0,
  onSuccess,
}: Props) {
  const { t } = useLanguage();
  // Form State
  const [quantityType, setQuantityType] = useState<"package" | "20" | "23" | "40" | "custom">(
    packageLessonCount ? "package" : "23"
  );
  const [customQuantity, setCustomQuantity] = useState<number>(packageLessonCount || 23);
  const [startDate, setStartDate] = useState<string>(initialStartDate);
  const [schedules, setSchedules] = useState<LessonScheduleInput[]>([]);
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize schedule rows & load teacher non-working days when modal opens
  useEffect(() => {
    if (isOpen) {
      setStartDate(initialStartDate || new Date().toISOString().split("T")[0]);
      if (initialSchedules && initialSchedules.length > 0) {
        setSchedules(
          initialSchedules.map((s) => ({
            id: s.id,
            weekday: s.weekday || "Monday",
            startTime: s.startTime || "10:00",
            endTime: s.endTime || "11:00",
            duration: s.duration || 60,
          }))
        );
      } else {
        setSchedules([
          { weekday: "Monday", startTime: "10:00", endTime: "11:00", duration: 60 },
          { weekday: "Wednesday", startTime: "10:00", endTime: "11:00", duration: 60 },
        ]);
      }

      if (teacherId) {
        fetchTeacherTimeOff(teacherId).then(setTimeOffList);
      }
    }
  }, [isOpen, initialSchedules, initialStartDate, teacherId]);

  // Determine total lesson count to generate
  const getTargetLessonCount = (): number => {
    switch (quantityType) {
      case "package":
        return packageLessonCount || 23;
      case "20":
        return 20;
      case "23":
        return 23;
      case "40":
        return 40;
      case "custom":
        return Number(customQuantity) || 1;
      default:
        return 23;
    }
  };

  const targetCount = getTargetLessonCount();

  // Expected Final Lesson Date (Live calculation preview respecting time off)
  const expectedEndDate = React.useMemo(() => {
    if (!startDate || schedules.length === 0 || targetCount <= 0) return "";
    return calculateExpectedEndDate(startDate, schedules, targetCount, timeOffList);
  }, [startDate, schedules, targetCount, timeOffList]);

  // Schedule row actions
  const handleAddScheduleRow = () => {
    setSchedules((prev) => [
      ...prev,
      { weekday: "Friday", startTime: "10:00", endTime: "11:00", duration: 60 },
    ]);
  };

  const handleRemoveScheduleRow = (index: number) => {
    if (schedules.length <= 1) {
      toast.error("At least one weekly schedule slot is required.");
      return;
    }
    setSchedules((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateScheduleRow = (index: number, field: keyof LessonScheduleInput, value: any) => {
    setSchedules((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  // Submit Generation
  const handleConfirmGenerate = async () => {
    setErrorMessage(null);

    // Validation
    if (!startDate || isNaN(Date.parse(startDate))) {
      const err = "Please select a valid start date.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    if (!schedules || schedules.length === 0) {
      const err = "Please specify at least one weekly schedule time slot.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    if (targetCount <= 0) {
      const err = "Please select a positive number of lessons to generate.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    try {
      setIsGenerating(true);

      const generated = generateLessonPlanOccurrences(
        startDate,
        schedules,
        targetCount,
        studentId,
        teacherId,
        timeOffList
      );

      if (generated.length === 0) {
        throw new Error("Generation produced 0 lesson occurrences. Please check your selected weekdays and start date.");
      }

      // Save generated lessons
      const saveRes = await saveStudentLessons(
        studentId,
        teacherId,
        studentName,
        level,
        focus,
        generated
      );

      if (!saveRes.success) {
        console.warn("[GenerateLessonPlanModal] Supabase save deferred (saved locally):", saveRes.error);
      }

      toast.success(`Successfully generated ${generated.length} lessons for ${studentName}!`);
      onSuccess(saveRes.data || generated);
      onClose();
    } catch (err: any) {
      console.error("[GenerateLessonPlanModal] Exception during generation:", err);
      const msg = err.message || "Failed to generate lesson plan.";
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-6 bg-card border-border shadow-lg">
        <DialogHeader className="space-y-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Sparkles className="w-5 h-5" />
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

        <div className="space-y-6 py-2">
          {/* STEP 1: NUMBER OF LESSONS */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t("students.modalStepLessons")}</span>
              <span className="text-muted-foreground font-normal">{t("students.modalTargetLessons").replace("{count}", String(targetCount))}</span>
            </Label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {packageLessonCount && (
                <button
                  type="button"
                  onClick={() => setQuantityType("package")}
                  className={`p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
                    quantityType === "package"
                      ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
                      : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("students.modalPkgCount")}</span>
                  <span className="text-sm font-bold text-foreground mt-1">{t("students.lessonsCountPlural").replace("{count}", String(packageLessonCount))}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setQuantityType("20")}
                className={`p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
                  quantityType === "20"
                    ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
                    : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("students.modalStandard")}</span>
                <span className="text-sm font-bold text-foreground mt-1">{t("students.lessonsCountPlural").replace("{count}", "20")}</span>
              </button>

              <button
                type="button"
                onClick={() => setQuantityType("23")}
                className={`p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
                  quantityType === "23"
                    ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
                    : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("students.modalRecommended")}</span>
                <span className="text-sm font-bold text-foreground mt-1">{t("students.lessonsCountPlural").replace("{count}", "23")}</span>
              </button>

              <button
                type="button"
                onClick={() => setQuantityType("40")}
                className={`p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
                  quantityType === "40"
                    ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
                    : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("students.modalExtended")}</span>
                <span className="text-sm font-bold text-foreground mt-1">{t("students.lessonsCountPlural").replace("{count}", "40")}</span>
              </button>

              <button
                type="button"
                onClick={() => setQuantityType("custom")}
                className={`p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
                  quantityType === "custom"
                    ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
                    : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("students.modalCustom")}</span>
                <span className="text-sm font-bold text-foreground mt-1">{t("students.modalSpecify")}</span>
              </button>
            </div>

            {quantityType === "custom" && (
              <div className="pt-2">
                <Label htmlFor="custom-qty" className="text-xs text-muted-foreground mb-1 block">
                  {t("students.modalEnterCustomQty")}
                </Label>
                <Input
                  id="custom-qty"
                  type="number"
                  min={1}
                  max={200}
                  value={customQuantity}
                  onChange={(e) => setCustomQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="h-10 text-sm font-semibold max-w-xs"
                />
              </div>
            )}
          </div>

          {/* STEP 2: START DATE */}
          <div className="space-y-2">
            <Label htmlFor="start-date" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{t("students.modalStepStartDate")}</span>
              <span className="text-muted-foreground font-normal text-[11px]">{t("students.modalFirstLessonDate")}</span>
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 text-sm font-mono bg-background border-border"
            />
          </div>

          {/* STEP 3: WEEKLY SCHEDULE ROWS */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                {t("students.modalStepSchedule")}
              </Label>
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
              {schedules.map((row, idx) => (
                <div
                  key={`sched-row-${idx}`}
                  className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border/60 shadow-2xs"
                >
                  {/* Weekday */}
                  <Select
                    value={row.weekday}
                    onValueChange={(val) => handleUpdateScheduleRow(idx, "weekday", val)}
                  >
                    <SelectTrigger className="h-9 text-xs flex-1 bg-background border-border">
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
                  <div className="w-28">
                    <Input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => handleUpdateScheduleRow(idx, "startTime", e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                      placeholder={t("students.modalStartTime")}
                    />
                  </div>

                  {/* End Time */}
                  <div className="w-28">
                    <Input
                      type="time"
                      value={row.endTime || "11:00"}
                      onChange={(e) => handleUpdateScheduleRow(idx, "endTime", e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                      placeholder={t("students.modalEndTime")}
                    />
                  </div>

                  {/* Remove Row Button */}
                  <button
                    type="button"
                    onClick={() => handleRemoveScheduleRow(idx)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title={t("students.modalRemoveRow")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
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
        </div>

        <DialogFooter className="gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isGenerating}
            className="h-10 text-xs"
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirmGenerate}
            disabled={isGenerating}
            className="h-10 text-xs font-semibold gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {isGenerating ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin" />
                {t("students.modalGenerating")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t("students.modalGenerateBtn").replace("{count}", String(targetCount))}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

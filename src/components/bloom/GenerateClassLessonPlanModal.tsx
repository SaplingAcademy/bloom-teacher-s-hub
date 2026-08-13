import React, { useEffect, useMemo, useState } from "react";
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
import { Sparkles, Plus, Trash2, AlertCircle, CheckCircle2, Info } from "lucide-react";
import { toast } from "sonner";
import { ClassWithDetails } from "@/lib/class-sync";
import {
  LessonPlan,
  OccurrenceSlot,
  calculateClassExpectedEndDate,
  generateClassLessonPlan,
  getScheduleAdvisoryWarnings,
} from "@/lib/lesson-plans";
import {
  TeacherAvailabilitySnapshot,
  getTeacherAvailability,
  findRecurringConflicts,
} from "@/lib/teacher-availability";
import { calculateEndTime } from "@/lib/calendar-sync";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cls: ClassWithDetails;
  teacherId: string;
  isPt: boolean;
  packageLessonCount?: number;
  onSuccess: (plans: LessonPlan[]) => void;
}

interface ScheduleRow {
  id?: string;
  weekday: string;
  startTime: string;
  endTime: string;
}

const WEEKDAYS = [
  { value: "Monday", pt: "Segunda-feira", en: "Monday" },
  { value: "Tuesday", pt: "Terça-feira", en: "Tuesday" },
  { value: "Wednesday", pt: "Quarta-feira", en: "Wednesday" },
  { value: "Thursday", pt: "Quinta-feira", en: "Thursday" },
  { value: "Friday", pt: "Sexta-feira", en: "Friday" },
  { value: "Saturday", pt: "Sábado", en: "Saturday" },
  { value: "Sunday", pt: "Domingo", en: "Sunday" },
];

function minutesBetween(start: string, end: string): number {
  const [sh, sm] = (start || "00:00").split(":").map(Number);
  const [eh, em] = (end || "00:00").split(":").map(Number);
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff : 60;
}

export function GenerateClassLessonPlanModal({
  isOpen,
  onClose,
  cls,
  teacherId,
  isPt,
  packageLessonCount,
  onSuccess,
}: Props) {
  const [quantityType, setQuantityType] = useState<"package" | "20" | "23" | "40" | "custom">(
    packageLessonCount ? "package" : "23"
  );
  const [customQuantity, setCustomQuantity] = useState<number>(packageLessonCount || 23);
  const [startDate, setStartDate] = useState<string>(
    cls.start_date || new Date().toISOString().split("T")[0]
  );
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [availability, setAvailability] = useState<TeacherAvailabilitySnapshot | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictWarnings, setConflictWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setStartDate(cls.start_date || new Date().toISOString().split("T")[0]);

    const existing = (cls.schedules || []).map((s) => ({
      id: s.id,
      weekday: s.weekday || "Monday",
      startTime: (s.start_time || "19:00").slice(0, 5),
      endTime: (s.end_time || calculateEndTime((s.start_time || "19:00").slice(0, 5), s.duration || 60)).slice(0, 5),
    }));

    setRows(
      existing.length > 0
        ? existing
        : [{ weekday: "Monday", startTime: "19:00", endTime: "20:00" }]
    );

    if (teacherId) getTeacherAvailability(teacherId, { force: true }).then(setAvailability);
  }, [isOpen, cls.id, cls.schedules, cls.start_date, teacherId]);

  const targetCount = useMemo(() => {
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
  }, [quantityType, customQuantity, packageLessonCount]);

  const slots: OccurrenceSlot[] = useMemo(
    () =>
      rows.map((r) => ({
        weekday: r.weekday,
        startTime: r.startTime,
        duration: minutesBetween(r.startTime, r.endTime),
        scheduleId: r.id || null,
        deliveryMode: "Online" as const,
      })),
    [rows]
  );

  const expectedEndDate = useMemo(() => {
    if (!startDate || slots.length === 0 || targetCount <= 0) return "";
    return calculateClassExpectedEndDate(
      startDate,
      slots,
      targetCount,
      availability?.timeOff || [],
      availability
    );
  }, [startDate, slots, targetCount, availability]);

  const advisoryWarnings = useMemo(
    () => getScheduleAdvisoryWarnings(startDate, slots, availability),
    [startDate, slots, availability]
  );

  useEffect(() => {
    if (!isOpen || !teacherId || slots.length === 0) {
      setConflictWarnings([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const found: string[] = [];
      for (const slot of slots) {
        const end = calculateEndTime(slot.startTime, slot.duration || 60);
        const list = await findRecurringConflicts(teacherId, slot.weekday, slot.startTime, end);
        for (const c of list) {
          if (c.name.includes(cls.name)) continue;
          found.push(`${slot.weekday} ${slot.startTime}–${end}: ${c.name} (${c.timeRange})`);
        }
      }
      if (!cancelled) setConflictWarnings(found);
    };
    const timer = setTimeout(run, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, teacherId, slots, cls.name]);

  const addRow = () =>
    setRows((prev) => [...prev, { weekday: "Friday", startTime: "19:00", endTime: "20:00" }]);

  const removeRow = (index: number) => {
    if (rows.length <= 1) {
      toast.error(isPt ? "É necessário ao menos um horário semanal." : "At least one weekly slot is required.");
      return;
    }
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof ScheduleRow, value: string) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));

  const handleGenerate = async () => {
    setErrorMessage(null);

    if (!startDate || isNaN(Date.parse(startDate))) {
      const err = isPt ? "Selecione uma data de início válida." : "Select a valid start date.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }
    if (slots.length === 0) {
      const err = isPt ? "Informe ao menos um horário semanal." : "Add at least one weekly slot.";
      setErrorMessage(err);
      toast.error(err);
      return;
    }

    try {
      setIsGenerating(true);
      const plans = await generateClassLessonPlan(
        teacherId,
        { id: cls.id, name: cls.name, level: cls.level },
        {
          startDate,
          slots,
          totalOccurrences: targetCount,
          timeOff: availability?.timeOff || [],
          availability,
        }
      );
      toast.success(
        isPt
          ? `Plano de aulas gerado para ${cls.name}!`
          : `Lesson plan generated for ${cls.name}!`
      );
      onSuccess(plans);
      onClose();
    } catch (err: any) {
      const msg = err?.message || (isPt ? "Falha ao gerar o plano de aulas." : "Failed to generate lesson plan.");
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const optionCard = (
    key: "package" | "20" | "23" | "40" | "custom",
    caption: string,
    value: string
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => setQuantityType(key)}
      className={`p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
        quantityType === key
          ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
          : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
      }`}
    >
      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{caption}</span>
      <span className="text-sm font-bold text-foreground mt-1">{value}</span>
    </button>
  );

  const lessonsLabel = (n: number | string) => (isPt ? `${n} aulas` : `${n} lessons`);

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
                {isPt ? "Gerar Plano de Aulas da Turma" : "Generate Class Lesson Plan"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isPt
                  ? `Crie automaticamente a sequência de aulas de ${cls.name}.`
                  : `Automatically create the lesson sequence for ${cls.name}.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">{isPt ? "Erro na geração" : "Generation error"}</p>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        <div className="space-y-6 py-2">
          {/* STEP 1 — NUMBER OF LESSONS */}
          <div className="space-y-3">
            <Label className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{isPt ? "1. Número de aulas" : "1. Number of lessons"}</span>
              <span className="text-muted-foreground font-normal">{lessonsLabel(targetCount)}</span>
            </Label>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {packageLessonCount
                ? optionCard("package", isPt ? "Total do pacote" : "Package total", lessonsLabel(packageLessonCount))
                : null}
              {optionCard("20", isPt ? "Padrão" : "Standard", lessonsLabel(20))}
              {optionCard("23", isPt ? "Recomendado" : "Recommended", lessonsLabel(23))}
              {optionCard("40", isPt ? "Estendido" : "Extended", lessonsLabel(40))}
              {optionCard("custom", isPt ? "Personalizado" : "Custom", isPt ? "Definir" : "Specify")}
            </div>

            {quantityType === "custom" && (
              <div className="pt-2">
                <Label htmlFor="class-custom-qty" className="text-xs text-muted-foreground mb-1 block">
                  {isPt ? "Informe a quantidade de aulas" : "Enter the number of lessons"}
                </Label>
                <Input
                  id="class-custom-qty"
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

          {/* STEP 2 — START DATE */}
          <div className="space-y-2">
            <Label htmlFor="class-start-date" className="text-xs font-semibold text-foreground flex items-center justify-between">
              <span>{isPt ? "2. Data de início do curso" : "2. Course start date"}</span>
              <span className="text-muted-foreground font-normal text-[11px]">
                {isPt ? "Data da primeira aula" : "First lesson date"}
              </span>
            </Label>
            <Input
              id="class-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 text-sm font-mono bg-background border-border"
            />
          </div>

          {/* STEP 3 — WEEKLY SCHEDULE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                {isPt ? "3. Horário semanal da turma" : "3. Class weekly schedule"}
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={addRow}
                className="h-7 text-xs text-primary hover:bg-primary/10 gap-1"
              >
                <Plus className="w-3 h-3" />
                {isPt ? "Adicionar Horário" : "Add Schedule"}
              </Button>
            </div>

            <div className="space-y-2 border border-border/80 rounded-xl p-3 bg-muted/20">
              {rows.map((row, idx) => (
                <div
                  key={`class-sched-${idx}`}
                  className="flex items-center gap-2 bg-card p-2 rounded-lg border border-border/60 shadow-2xs"
                >
                  <Select value={row.weekday} onValueChange={(val) => updateRow(idx, "weekday", val)}>
                    <SelectTrigger className="h-9 text-xs flex-1 bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {isPt ? d.pt : d.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="w-28">
                    <Input
                      type="time"
                      value={row.startTime}
                      onChange={(e) => updateRow(idx, "startTime", e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                    />
                  </div>
                  <div className="w-28">
                    <Input
                      type="time"
                      value={row.endTime}
                      onChange={(e) => updateRow(idx, "endTime", e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title={isPt ? "Remover horário" : "Remove slot"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {isPt
                  ? "Folgas, férias e feriados bloqueiam datas: elas são puladas sem consumir número de aula. Seu horário habitual e pausas recorrentes servem apenas como orientação — você pode abrir a turma em qualquer dia e horário."
                  : "Time off, vacations and holidays block dates: they are skipped without consuming a lesson number. Your usual working hours and recurring breaks are only guidance — you can schedule the class on any day or time."}
              </span>
            </div>

            {(advisoryWarnings.length > 0 || conflictWarnings.length > 0) && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-400">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{isPt ? "Avisos (não impedem a geração)" : "Warnings (generation is still allowed)"}</span>
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-amber-800/90 dark:text-amber-300/90">
                  {advisoryWarnings.map((w, i) => (
                    <li key={`adv-${i}`}>{w}</li>
                  ))}
                  {conflictWarnings.map((w, i) => (
                    <li key={`conf-${i}`}>
                      {isPt ? "Conflito com " : "Conflict with "}
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* STEP 4 — REVIEW */}
          <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-semibold text-primary">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isPt ? "Revise antes de gerar" : "Review before generating"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-foreground/90 pt-1">
              <div>
                <span className="text-muted-foreground">{isPt ? "Turma:" : "Class:"}</span>{" "}
                <span className="font-semibold">{cls.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{isPt ? "Total:" : "Total:"}</span>{" "}
                <span className="font-semibold">{lessonsLabel(targetCount)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{isPt ? "Início:" : "Start:"}</span>{" "}
                <span className="font-mono font-semibold">{startDate}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{isPt ? "Término previsto:" : "Expected end:"}</span>{" "}
                <span className="font-mono font-semibold text-primary">
                  {expectedEndDate || (isPt ? "Calculando..." : "Calculating...")}
                </span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">{isPt ? "Fuso horário:" : "Timezone:"}</span>{" "}
                <span className="font-semibold">{availability?.timezone || "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3 border-t border-border/60">
          <Button type="button" variant="outline" onClick={onClose} disabled={isGenerating} className="h-10 text-xs">
            {isPt ? "Cancelar" : "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="h-10 text-xs font-semibold gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Sparkles className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
            {isGenerating
              ? isPt ? "Gerando..." : "Generating..."
              : isPt ? `Gerar ${targetCount} aulas` : `Generate ${targetCount} lessons`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
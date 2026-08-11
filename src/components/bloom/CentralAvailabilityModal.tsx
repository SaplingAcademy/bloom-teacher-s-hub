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
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  Calendar,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Search,
  Check,
} from "lucide-react";
import {
  WorkingAvailability,
  WEEKDAYS_MAP,
  RestBlock,
  fetchTeacherWorkingAvailability,
  saveTeacherWorkingAvailability,
  checkWorkingAvailabilityConflicts,
  fetchTeacherRestBlocks,
  saveTeacherRestBlocks,
  validateRestBlock,
  checkRestBlockConflicts,
} from "@/lib/availability-engine";
import {
  fetchTeacherTimeOff,
  createTeacherTimeOffBatch,
  deleteTeacherTimeOffBatch,
  updateTeacherTimeOff,
  TeacherTimeOff,
  TimeOffType,
  TimeOffInput,
  formatLocalDateStr,
} from "@/lib/time-off-engine";
import { toast } from "sonner";

interface CentralAvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  initialTab?: "working_hours" | "rest_blocks" | "days_off";
  onSaved?: () => void;
}

export function CentralAvailabilityModal({
  isOpen,
  onClose,
  teacherId,
  initialTab = "working_hours",
  onSaved,
}: CentralAvailabilityModalProps) {
  const [activeTab, setActiveTab] = useState<"working_hours" | "rest_blocks" | "days_off">(initialTab);

  // Tab 1: Horários de trabalho state
  const [selectedWeekdays, setSelectedWeekdays] = useState<Set<string>>(new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]));
  const [sameHours, setSameHours] = useState<boolean>(true);
  const [sharedStartTime, setSharedStartTime] = useState<string>("08:00");
  const [sharedEndTime, setSharedEndTime] = useState<string>("18:00");
  const [differentHoursMap, setDifferentHoursMap] = useState<Record<string, { startTime: string; endTime: string }>>({
    Monday: { startTime: "08:00", endTime: "18:00" },
    Tuesday: { startTime: "08:00", endTime: "18:00" },
    Wednesday: { startTime: "08:00", endTime: "18:00" },
    Thursday: { startTime: "08:00", endTime: "18:00" },
    Friday: { startTime: "08:00", endTime: "18:00" },
    Saturday: { startTime: "09:00", endTime: "13:00" },
    Sunday: { startTime: "09:00", endTime: "13:00" },
  });
  const [isSavingHours, setIsSavingHours] = useState(false);
  const [conflictsList, setConflictsList] = useState<Array<{ studentName: string; weekday: string; startTime: string }>>([]);

  // Tab 2: Horários de descanso state
  const [restBlocksList, setRestBlocksList] = useState<RestBlock[]>([]);
  const [restSelectedWeekdays, setRestSelectedWeekdays] = useState<Set<string>>(
    new Set(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"])
  );
  const [restStartTime, setRestStartTime] = useState<string>("12:00");
  const [restEndTime, setRestEndTime] = useState<string>("13:30");
  const [restLabel, setRestLabel] = useState<string>("Almoço");
  const [isSavingRestBlocks, setIsSavingRestBlocks] = useState<boolean>(false);
  const [restConflictsList, setRestConflictsList] = useState<
    Array<{ targetName: string; weekday: string; timeRange: string; restLabel: string }>
  >([]);

  // Tab 3: Dias sem aula state
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);
  const [timeOffMode, setTimeOffMode] = useState<"single" | "range" | "multiple">("single");
  const [singleDate, setSingleDate] = useState<string>(formatLocalDateStr(new Date()));
  const [rangeStart, setRangeStart] = useState<string>(formatLocalDateStr(new Date()));
  const [rangeEnd, setRangeEnd] = useState<string>(formatLocalDateStr(new Date()));
  const [selectedDatesSet, setSelectedDatesSet] = useState<Set<string>>(new Set());
  const [pickerYear, setPickerYear] = useState<number>(new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(new Date().getMonth());
  const [timeOffCategory, setTimeOffCategory] = useState<TimeOffType | "Nenhuma">("Férias");
  const [timeOffTitle, setTimeOffTitle] = useState<string>("");
  const [isSavingDaysOff, setIsSavingDaysOff] = useState(false);
  const [daysOffSearchTerm, setDaysOffSearchTerm] = useState<string>("");
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);

  // Initialize data when modal opens
  useEffect(() => {
    if (isOpen && teacherId) {
      setActiveTab(initialTab);
      loadWorkingHoursData();
      loadRestBlocksData();
      loadDaysOffData();
    }
  }, [isOpen, teacherId, initialTab]);

  const loadRestBlocksData = async () => {
    const serverBlocks = await fetchTeacherRestBlocks(teacherId);
    setRestBlocksList(serverBlocks || []);
  };

  const loadWorkingHoursData = async () => {
    const serverAvail = await fetchTeacherWorkingAvailability(teacherId);
    if (serverAvail && serverAvail.length > 0) {
      const enabledSet = new Set<string>();
      const diffMap: Record<string, { startTime: string; endTime: string }> = { ...differentHoursMap };
      let isUniform = true;
      let firstStart = "";
      let firstEnd = "";

      serverAvail.forEach((a) => {
        if (a.enabled) {
          enabledSet.add(a.day);
          diffMap[a.day] = { startTime: a.startTime, endTime: a.endTime };

          if (!firstStart) {
            firstStart = a.startTime;
            firstEnd = a.endTime;
          } else if (a.startTime !== firstStart || a.endTime !== firstEnd) {
            isUniform = false;
          }
        }
      });

      setSelectedWeekdays(enabledSet);
      setSameHours(isUniform);
      if (firstStart) setSharedStartTime(firstStart);
      if (firstEnd) setSharedEndTime(firstEnd);
      setDifferentHoursMap(diffMap);
    }
  };

  const loadDaysOffData = async () => {
    const list = await fetchTeacherTimeOff(teacherId);
    setTimeOffList(list);
  };

  // Toggle Weekday Selection
  const toggleWeekday = (dayKey: string) => {
    setSelectedWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) {
        next.delete(dayKey);
      } else {
        next.add(dayKey);
      }
      return next;
    });
  };

  // Build proposed WorkingAvailability array
  const buildProposedAvailability = (): WorkingAvailability[] => {
    return WEEKDAYS_MAP.map((w) => {
      const isEnabled = selectedWeekdays.has(w.key);
      const times = sameHours
        ? { startTime: sharedStartTime, endTime: sharedEndTime }
        : differentHoursMap[w.key] || { startTime: "08:00", endTime: "18:00" };

      return {
        day: w.key,
        enabled: isEnabled,
        startTime: times.startTime,
        endTime: times.endTime,
      };
    });
  };

  // Save Working Hours
  const handleSaveWorkingHours = async () => {
    const proposed = buildProposedAvailability();

    // Check conflicts with student recurring schedules
    const conflicts = await checkWorkingAvailabilityConflicts(teacherId, proposed);
    if (conflicts.length > 0) {
      setConflictsList(conflicts);
    } else {
      setConflictsList([]);
    }

    try {
      setIsSavingHours(true);
      const res = await saveTeacherWorkingAvailability(teacherId, proposed);
      if (!res.success) {
        toast.error(`Erro ao salvar: ${res.error}`);
        return;
      }

      toast.success("Horários de trabalho atualizados com sucesso!");
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error("Falha ao salvar horários de trabalho.");
    } finally {
      setIsSavingHours(false);
    }
  };

  // Calendar Days Grid helper for Tab 2
  const monthDaysGrid = React.useMemo(() => {
    const firstDay = new Date(pickerYear, pickerMonth, 1);
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sun
    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();

    const days: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ dateStr: "", dayNum: 0, isCurrentMonth: false });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(pickerYear, pickerMonth, d);
      days.push({
        dateStr: formatLocalDateStr(dateObj),
        dayNum: d,
        isCurrentMonth: true,
      });
    }

    return days;
  }, [pickerYear, pickerMonth]);

  const existingTimeOffDatesSet = React.useMemo(() => {
    const set = new Set<string>();
    timeOffList.forEach((item) => {
      let curr = new Date(item.startDate + "T00:00:00");
      const end = new Date(item.endDate + "T00:00:00");
      while (curr <= end) {
        set.add(formatLocalDateStr(curr));
        curr.setDate(curr.getDate() + 1);
      }
    });
    return set;
  }, [timeOffList]);

  const toggleMultiDate = (dateStr: string) => {
    if (!dateStr) return;
    setSelectedDatesSet((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  };

  // Save Days Off
  const handleSaveDaysOff = async () => {
    const finalCategory: TimeOffType =
      !timeOffCategory || timeOffCategory === "Nenhuma" ? "Férias" : timeOffCategory;
    const finalTitle = timeOffTitle.trim() || undefined;

    let payload: TimeOffInput[] = [];

    if (timeOffMode === "single") {
      if (!singleDate) {
        toast.error("Selecione uma data válida.");
        return;
      }
      payload = [{ startDate: singleDate, endDate: singleDate, type: finalCategory, title: finalTitle }];
    } else if (timeOffMode === "range") {
      if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) {
        toast.error("A data de início deve ser anterior ou igual à data de fim.");
        return;
      }
      payload = [{ startDate: rangeStart, endDate: rangeEnd, type: finalCategory, title: finalTitle }];
    } else if (timeOffMode === "multiple") {
      if (selectedDatesSet.size === 0) {
        toast.error("Selecione pelo menos um dia no calendário.");
        return;
      }
      const sortedDates = Array.from(selectedDatesSet).sort();
      payload = sortedDates.map((dStr) => ({
        startDate: dStr,
        endDate: dStr,
        type: finalCategory,
        title: finalTitle,
      }));
    }

    try {
      setIsSavingDaysOff(true);
      const res = await createTeacherTimeOffBatch(teacherId, payload);

      if (!res.success) {
        toast.error(`Erro ao salvar: ${res.error}`);
        return;
      }

      toast.success(`${res.count} registro(s) de dias sem aula salvo(s) com sucesso!`);
      setSelectedDatesSet(new Set());
      setTimeOffTitle("");
      await loadDaysOffData();
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error("Falha ao salvar dias sem aula.");
    } finally {
      setIsSavingDaysOff(false);
    }
  };

  const filteredDaysOffRecords = React.useMemo(() => {
    return timeOffList.filter((r) => {
      if (!daysOffSearchTerm) return true;
      const term = daysOffSearchTerm.toLowerCase();
      return (
        r.startDate.includes(term) ||
        r.endDate.includes(term) ||
        r.type.toLowerCase().includes(term) ||
        (r.title && r.title.toLowerCase().includes(term))
      );
    });
  }, [timeOffList, daysOffSearchTerm]);

  const handleDeleteDaysOffBatch = async () => {
    if (selectedRecordIds.size === 0) return;
    try {
      const res = await deleteTeacherTimeOffBatch(teacherId, Array.from(selectedRecordIds));
      if (res.success) {
        toast.success(`${selectedRecordIds.size} registro(s) excluído(s).`);
        setSelectedRecordIds(new Set());
        await loadDaysOffData();
        if (onSaved) onSaved();
      } else {
        toast.error(res.error || "Erro ao excluir registros.");
      }
    } catch (err) {
      toast.error("Falha ao excluir registros.");
    }
  };

  const toggleRestWeekday = (dayKey: string) => {
    setRestSelectedWeekdays((prev) => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  };

  const handleApplyPreset = (preset: { label: string; startTime: string; endTime: string }) => {
    setRestLabel(preset.label);
    setRestStartTime(preset.startTime);
    setRestEndTime(preset.endTime);
  };

  const handleAddRestBlocks = async () => {
    if (restSelectedWeekdays.size === 0) {
      toast.error("Selecione pelo menos um dia da semana.");
      return;
    }
    if (!restStartTime || !restEndTime || restStartTime >= restEndTime) {
      toast.error("O horário de início deve ser anterior ao horário de término.");
      return;
    }

    const currentAvail = await fetchTeacherWorkingAvailability(teacherId);
    const newBlocks: RestBlock[] = [];
    let validationFailedMessage = "";

    Array.from(restSelectedWeekdays).forEach((day) => {
      const candidate: RestBlock = {
        id: `rb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        day,
        startTime: restStartTime,
        endTime: restEndTime,
        label: restLabel.trim() || "Descanso",
      };

      const val = validateRestBlock(currentAvail, candidate);
      if (!val.valid) {
        validationFailedMessage = val.error || "Horário inválido.";
      } else {
        newBlocks.push(candidate);
      }
    });

    if (newBlocks.length === 0) {
      toast.error(validationFailedMessage || "Não foi possível adicionar o horário de descanso.");
      return;
    }

    const updatedList = [...restBlocksList, ...newBlocks];
    setRestBlocksList(updatedList);

    // Check conflicts with existing scheduled lessons
    const conflicts = await checkRestBlockConflicts(teacherId, updatedList);
    setRestConflictsList(conflicts);

    if (conflicts.length > 0) {
      toast.warning("Horário de descanso adicionado, mas entra em conflito com aulas agendadas.");
    } else {
      toast.success(`${newBlocks.length} horário(s) de descanso adicionado(s)!`);
    }
  };

  const handleDeleteRestBlock = (blockId: string) => {
    const updated = restBlocksList.filter((b) => b.id !== blockId);
    setRestBlocksList(updated);
    toast.success("Horário de descanso removido.");
  };

  const handleSaveRestBlocksSubmit = async () => {
    setIsSavingRestBlocks(true);
    try {
      const res = await saveTeacherRestBlocks(teacherId, restBlocksList);
      if (res.success) {
        toast.success("Horários de descanso salvos com sucesso!");
        if (onSaved) onSaved();
      } else {
        toast.error(res.error || "Erro ao salvar horários de descanso.");
      }
    } catch (err) {
      toast.error("Falha ao salvar horários de descanso.");
    } finally {
      setIsSavingRestBlocks(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] rounded-2xl p-6 bg-card border-border shadow-xl flex flex-col">
        {/* Header */}
        <DialogHeader className="pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#163020] text-[#F4EBE1]">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground font-display">
                Configurar Disponibilidade
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Gerencie seus horários semanais de trabalho, horários de descanso e exceções no calendário.
              </DialogDescription>
            </div>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center gap-2 pt-4 flex-wrap">
            <button
              type="button"
              onClick={() => setActiveTab("working_hours")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "working_hours"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Horários de trabalho</span>
              {selectedWeekdays.size > 0 && (
                <Badge variant="outline" className="text-[10px] bg-white/10 text-white border-white/20 px-1.5 py-0">
                  {selectedWeekdays.size} dias
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("rest_blocks")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "rest_blocks"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Horários de descanso</span>
              {restBlocksList.length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-white/10 text-white border-white/20 px-1.5 py-0">
                  {restBlocksList.length}
                </Badge>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("days_off")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === "days_off"
                  ? "bg-[#163020] text-[#F4EBE1] shadow-xs"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <CalendarOff className="w-3.5 h-3.5" />
              <span>Dias sem aula</span>
              {timeOffList.length > 0 && (
                <Badge variant="outline" className="text-[10px] bg-white/10 text-white border-white/20 px-1.5 py-0">
                  {timeOffList.length}
                </Badge>
              )}
            </button>
          </div>
        </DialogHeader>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto py-4 space-y-6 scrollbar-thin">
          {/* TAB 1: HORÁRIOS DE TRABALHO */}
          {activeTab === "working_hours" && (
            <div className="space-y-6">
              {/* Conflict Warning Banner */}
              {conflictsList.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Esta alteração entra em conflito com aulas já agendadas:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800 dark:text-amber-300">
                    {conflictsList.map((c, idx) => (
                      <li key={idx}>
                        <strong>{c.studentName}</strong> — {c.weekday} às {c.startTime}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground italic">
                    As aulas históricas e já agendadas foram preservadas. Revise a agenda caso deseje reagendá-las.
                  </p>
                </div>
              )}

              {/* 1. Weekday Buttons Selector */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-foreground block">
                  1. Em quais dias da semana você costuma dar aulas?
                </Label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {WEEKDAYS_MAP.map((w) => {
                    const isSelected = selectedWeekdays.has(w.key);
                    return (
                      <button
                        key={w.key}
                        type="button"
                        onClick={() => toggleWeekday(w.key)}
                        className={`p-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                          isSelected
                            ? "bg-[#163020] text-[#F4EBE1] border-[#163020] font-bold shadow-xs"
                            : "bg-card text-muted-foreground hover:border-border border-border/60 font-medium"
                        }`}
                      >
                        <span className="text-xs font-bold">{w.labelPt}</span>
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2. Same vs Different Hours Toggle */}
              {selectedWeekdays.size > 0 && (
                <div className="space-y-4 pt-2 border-t border-border/60">
                  <Label className="text-xs font-bold text-foreground block">
                    2. Você trabalha no mesmo horário nesses dias?
                  </Label>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSameHours(true)}
                      className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        sameHours
                          ? "bg-primary/10 text-primary border-primary"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      Sim (Mesmo horário)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSameHours(false)}
                      className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        !sameHours
                          ? "bg-primary/10 text-primary border-primary"
                          : "bg-card text-muted-foreground border-border"
                      }`}
                    >
                      Não (Horários diferentes)
                    </button>
                  </div>

                  {/* Single Shared Hours */}
                  {sameHours ? (
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/60 grid grid-cols-2 gap-4 max-w-md">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">Horário inicial</Label>
                        <Input
                          type="time"
                          value={sharedStartTime}
                          onChange={(e) => setSharedStartTime(e.target.value)}
                          className="h-10 text-sm font-mono bg-background border-border"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold text-muted-foreground">Horário final</Label>
                        <Input
                          type="time"
                          value={sharedEndTime}
                          onChange={(e) => setSharedEndTime(e.target.value)}
                          className="h-10 text-sm font-mono bg-background border-border"
                        />
                      </div>
                    </div>
                  ) : (
                    /* Different Hours per Weekday */
                    <div className="space-y-3 pt-1">
                      {WEEKDAYS_MAP.filter((w) => selectedWeekdays.has(w.key)).map((w) => {
                        const currentTimes = differentHoursMap[w.key] || { startTime: "08:00", endTime: "18:00" };
                        return (
                          <div
                            key={w.key}
                            className="p-3 rounded-xl bg-muted/30 border border-border/60 flex items-center justify-between gap-4 text-xs"
                          >
                            <span className="font-bold text-foreground w-28">{w.fullPt}</span>
                            <div className="flex items-center gap-2">
                              <Input
                                type="time"
                                value={currentTimes.startTime}
                                onChange={(e) =>
                                  setDifferentHoursMap((prev) => ({
                                    ...prev,
                                    [w.key]: { ...currentTimes, startTime: e.target.value },
                                  }))
                                }
                                className="h-9 text-xs font-mono bg-background border-border w-28"
                              />
                              <span className="text-muted-foreground">até</span>
                              <Input
                                type="time"
                                value={currentTimes.endTime}
                                onChange={(e) =>
                                  setDifferentHoursMap((prev) => ({
                                    ...prev,
                                    [w.key]: { ...currentTimes, endTime: e.target.value },
                                  }))
                                }
                                className="h-9 text-xs font-mono bg-background border-border w-28"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: HORÁRIOS DE DESCANSO */}
          {activeTab === "rest_blocks" && (
            <div className="space-y-6">
              {/* Conflict Warning Banner for Rest Blocks */}
              {restConflictsList.length > 0 && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Este horário de descanso entra em conflito com aulas já agendadas:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-800 dark:text-amber-300">
                    {restConflictsList.map((c, idx) => (
                      <li key={idx}>
                        <strong>{c.targetName}</strong> — {c.weekday} ({c.timeRange}) com descanso "{c.restLabel}"
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-muted-foreground italic">
                    As aulas agendadas foram mantidas. A Bloom contabiliza estas aulas para evitar remoção acidental.
                  </p>
                </div>
              )}

              {/* Supporting Text */}
              <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground leading-relaxed">
                <p className="font-semibold text-foreground mb-1">Horários de descanso recorrentes</p>
                Selecione horários em que você normalmente não deseja dar aulas (almoço, pausas, estudo, deslocamento, horário pessoal), mesmo estando dentro do seu período de trabalho.
              </div>

              {/* Quick Presets */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground block">Sugestões rápidas de descanso:</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: "Almoço", startTime: "12:00", endTime: "13:30" },
                    { label: "Pausa", startTime: "15:00", endTime: "15:30" },
                    { label: "Deslocamento", startTime: "17:00", endTime: "17:30" },
                    { label: "Estudo", startTime: "08:00", endTime: "09:00" },
                    { label: "Horário pessoal", startTime: "18:00", endTime: "19:00" },
                  ].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-3 py-1.5 rounded-lg border border-border/80 bg-card hover:bg-secondary text-xs font-medium text-foreground transition-colors cursor-pointer"
                    >
                      {preset.label} ({preset.startTime}–{preset.endTime})
                    </button>
                  ))}
                </div>
              </div>

              {/* Weekday Selection for Rest Block */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-foreground block">1. Aplicar aos dias da semana:</Label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                  {WEEKDAYS_MAP.map((w) => {
                    const isSelected = restSelectedWeekdays.has(w.key);
                    return (
                      <button
                        key={w.key}
                        type="button"
                        onClick={() => toggleRestWeekday(w.key)}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                          isSelected
                            ? "bg-[#163020] text-[#F4EBE1] border-[#163020] font-bold shadow-xs"
                            : "bg-card text-muted-foreground hover:border-border border-border/60 font-medium"
                        }`}
                      >
                        <span className="text-xs font-bold">{w.labelPt}</span>
                        {isSelected && <Check className="w-3 h-3 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Rest Block Form Inputs */}
              <div className="p-4 rounded-xl border border-border bg-muted/20 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground block">Horário de Início</Label>
                    <Input
                      type="time"
                      value={restStartTime}
                      onChange={(e) => setRestStartTime(e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground block">Horário de Término</Label>
                    <Input
                      type="time"
                      value={restEndTime}
                      onChange={(e) => setRestEndTime(e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] font-semibold text-foreground block">Identificação / Motivo</Label>
                    <Input
                      type="text"
                      placeholder="Ex: Almoço, Pausa"
                      value={restLabel}
                      onChange={(e) => setRestLabel(e.target.value)}
                      className="h-9 text-xs bg-background border-border"
                    />
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={handleAddRestBlocks}
                  className="w-full h-9 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 font-bold text-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Adicionar horário de descanso nos dias selecionados
                </Button>
              </div>

              {/* Configured Rest Blocks List */}
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-foreground">
                    Horários de descanso configurados ({restBlocksList.length}):
                  </Label>
                </div>

                {restBlocksList.length === 0 ? (
                  <div className="p-4 rounded-xl border border-dashed border-border/70 text-center text-xs text-muted-foreground">
                    Nenhum horário de descanso cadastrado.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {WEEKDAYS_MAP.map((w) => {
                      const dayBlocks = restBlocksList.filter((b) => b.day.toLowerCase() === w.key.toLowerCase());
                      if (dayBlocks.length === 0) return null;
                      return (
                        <div key={w.key} className="p-3 rounded-xl border border-border/60 bg-card space-y-2">
                          <span className="text-xs font-bold text-primary block">{w.fullPt}</span>
                          <div className="space-y-1.5">
                            {dayBlocks.map((b) => (
                              <div
                                key={b.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-muted/40 text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] font-mono bg-background">
                                    {b.startTime}–{b.endTime}
                                  </Badge>
                                  <span className="font-medium text-foreground">{b.label || "Descanso"}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRestBlock(b.id)}
                                  className="text-muted-foreground hover:text-destructive transition-colors p-1 cursor-pointer"
                                  title="Remover este horário de descanso"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: DIAS SEM AULA */}
          {activeTab === "days_off" && (
            <div className="space-y-6">
              {/* Mode Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTimeOffMode("single")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    timeOffMode === "single"
                      ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  Data única
                </button>
                <button
                  type="button"
                  onClick={() => setTimeOffMode("range")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    timeOffMode === "range"
                      ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  Intervalo
                </button>
                <button
                  type="button"
                  onClick={() => setTimeOffMode("multiple")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                    timeOffMode === "multiple"
                      ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                      : "bg-card text-muted-foreground border-border"
                  }`}
                >
                  Múltiplos dias
                </button>
              </div>

              {/* Input Forms by Mode */}
              {timeOffMode === "single" && (
                <div className="space-y-1.5 max-w-xs">
                  <Label className="text-xs font-semibold text-muted-foreground">Selecione a data</Label>
                  <Input
                    type="date"
                    value={singleDate}
                    onChange={(e) => setSingleDate(e.target.value)}
                    className="h-9 text-xs font-mono bg-background border-border"
                  />
                </div>
              )}

              {timeOffMode === "range" && (
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Data inicial</Label>
                    <Input
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Data final</Label>
                    <Input
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="h-9 text-xs font-mono bg-background border-border"
                    />
                  </div>
                </div>
              )}

              {timeOffMode === "multiple" && (
                <div className="p-4 rounded-xl bg-muted/20 border border-border/60 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        if (pickerMonth === 0) {
                          setPickerMonth(11);
                          setPickerYear((y) => y - 1);
                        } else setPickerMonth((m) => m - 1);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-bold text-foreground">
                      {new Date(pickerYear, pickerMonth).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (pickerMonth === 11) {
                          setPickerMonth(0);
                          setPickerYear((y) => y + 1);
                        } else setPickerMonth((m) => m + 1);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 text-center text-[11px] font-bold text-muted-foreground py-1">
                    <span>Dom</span><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center">
                    {monthDaysGrid.map((item, idx) => {
                      if (!item.isCurrentMonth) return <div key={idx} className="h-8" />;
                      const isSelected = selectedDatesSet.has(item.dateStr);
                      const hasExisting = existingTimeOffDatesSet.has(item.dateStr);

                      return (
                        <button
                          key={item.dateStr}
                          type="button"
                          onClick={() => toggleMultiDate(item.dateStr)}
                          className={`h-8 rounded-lg text-xs font-semibold transition-all relative cursor-pointer ${
                            isSelected
                              ? "bg-[#163020] text-[#F4EBE1] font-bold shadow-2xs"
                              : "bg-card hover:bg-muted/80 border border-border/40 text-foreground"
                          }`}
                        >
                          {item.dayNum}
                          {hasExisting && !isSelected && (
                            <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-amber-500" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional Category and Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Categoria (opcional)</Label>
                  <select
                    value={timeOffCategory}
                    onChange={(e) => setTimeOffCategory(e.target.value as any)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                  >
                    <option value="Férias">Férias</option>
                    <option value="Feriado">Feriado</option>
                    <option value="Recesso">Recesso</option>
                    <option value="Viagem">Viagem</option>
                    <option value="Compromisso Pessoal">Compromisso Pessoal</option>
                    <option value="Nenhuma">Nenhuma</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground">Nome / Identificação (opcional)</Label>
                  <Input
                    type="text"
                    placeholder="Ex: Natal, Recesso de Fim de Ano..."
                    value={timeOffTitle}
                    onChange={(e) => setTimeOffTitle(e.target.value)}
                    className="h-9 text-xs bg-background border-border"
                  />
                </div>
              </div>

              {/* Registered Time-Off Table */}
              <div className="space-y-3 pt-4 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground">Dias sem aula cadastrados ({timeOffList.length})</h4>
                  {selectedRecordIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleDeleteDaysOffBatch}
                      className="h-7 text-xs gap-1"
                    >
                      <Trash2 className="w-3 h-3" /> Excluir ({selectedRecordIds.size})
                    </Button>
                  )}
                </div>

                {filteredDaysOffRecords.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic text-center py-4">Nenhum dia sem aula cadastrado ainda.</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                    {filteredDaysOffRecords.map((item) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl border border-border/60 bg-card flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedRecordIds.has(item.id)}
                            onChange={(e) => {
                              setSelectedRecordIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(item.id);
                                else next.delete(item.id);
                                return next;
                              });
                            }}
                            className="rounded border-border"
                          />
                          <span className="font-bold text-foreground">{item.startDate === item.endDate ? item.startDate.split("-").reverse().join("/") : `${item.startDate.split("-").reverse().join("/")} → ${item.endDate.split("-").reverse().join("/")}`}</span>
                          <Badge variant="outline" className="text-[10px] font-semibold bg-muted">
                            {item.type}
                          </Badge>
                          {item.title && <span className="text-muted-foreground">({item.title})</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="pt-3 border-t border-border/60 shrink-0 gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="h-9 text-xs">
            Fechar
          </Button>

          {activeTab === "working_hours" ? (
            <Button
              type="button"
              onClick={handleSaveWorkingHours}
              disabled={isSavingHours}
              className="h-9 text-xs font-bold gap-1.5 bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              {isSavingHours ? "Salvando..." : "Salvar horários de trabalho"}
            </Button>
          ) : activeTab === "rest_blocks" ? (
            <Button
              type="button"
              onClick={handleSaveRestBlocksSubmit}
              disabled={isSavingRestBlocks}
              className="h-9 text-xs font-bold gap-1.5 bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              {isSavingRestBlocks ? "Salvando..." : "Salvar horários de descanso"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSaveDaysOff}
              disabled={isSavingDaysOff}
              className="h-9 text-xs font-bold gap-1.5 bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              {isSavingDaysOff ? "Salvando..." : "Adicionar dias sem aula"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

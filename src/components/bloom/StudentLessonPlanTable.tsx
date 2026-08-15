import React, { useState, useMemo } from "react";
import { StudentLesson, saveStudentLessons, LessonScheduleInput } from "@/lib/lesson-plan-sync";
import { CEFRLevel, CourseFocus } from "@/lib/calendar-sync";
import { GenerateLessonPlanModal } from "./GenerateLessonPlanModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle2,
  Clock,
  BookOpen,
  Calendar,
  Sparkles,
  Search,
  Filter,
  RefreshCw,
  FileText,
  AlertCircle,
  Plus,
  Download,
  History,
  CheckCheck,
} from "lucide-react";
import { exportLessonPlanPDF } from "@/lib/pdf-export";
import { LessonNotesModal, LessonAttachment } from "./LessonNotesModal";
import { StudentLessonPlanHistoryModal } from "./StudentLessonPlanHistoryModal";
import { completeStudentLessonPlan } from "@/lib/lesson-plan-documents";
import { toast } from "sonner";

import {
  fetchTeacherTimeOff,
  checkDateIsNonWorking,
  TeacherTimeOff,
  formatLocalDateStr,
} from "@/lib/time-off-engine";
import { generateLessonPlanOccurrences } from "@/lib/lesson-plan-sync";

interface Props {
  studentId: string;
  teacherId: string;
  studentName: string;
  level?: CEFRLevel;
  focus?: CourseFocus;
  schedules?: LessonScheduleInput[];
  startDateStr?: string;
  totalPackageLessons?: number;
  lessons: StudentLesson[];
  onLessonsChange: (updatedLessons: StudentLesson[]) => void;
}

import { useLanguage } from "@/hooks/use-language";

export function StudentLessonPlanTable({
  studentId,
  teacherId,
  studentName,
  level = "B2",
  focus = "General English",
  schedules = [],
  startDateStr = new Date().toISOString().split("T")[0],
  totalPackageLessons = 23,
  lessons,
  onLessonsChange,
}: Props) {
  const { t, formatStatus } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending" | "present" | "absent" | "rescheduled">("all");
  const [isSaving, setIsSaving] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCompletingPlan, setIsCompletingPlan] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [selectedLessonForNotes, setSelectedLessonForNotes] = useState<StudentLesson | null>(null);
  const [timeOffList, setTimeOffList] = useState<TeacherTimeOff[]>([]);
  const [overriddenConflictLessonNumbers, setOverriddenConflictLessonNumbers] = useState<Set<number>>(new Set());

  // Load teacher time off on mount
  React.useEffect(() => {
    if (teacherId) {
      fetchTeacherTimeOff(teacherId).then(setTimeOffList);
    }
  }, [teacherId]);

  // Find all lessons with conflicts
  const conflictedLessons = useMemo(() => {
    return lessons.filter((l) => {
      if (l.completed || overriddenConflictLessonNumbers.has(l.lesson_number)) return false;
      const matchedTimeOff = checkDateIsNonWorking(l.scheduled_date, timeOffList);
      return matchedTimeOff !== null;
    });
  }, [lessons, timeOffList, overriddenConflictLessonNumbers]);

  // Handle Auto-Reschedule for a conflicted lesson
  const handleAutoRescheduleLesson = async (conflictLessonNumber: number) => {
    const conflictIndex = lessons.findIndex((l) => l.lesson_number === conflictLessonNumber);
    if (conflictIndex === -1) return;

    // Remaining lessons to regenerate starting from the conflict lesson
    const remainingCount = lessons.length - conflictIndex;
    const currentConflictDate = lessons[conflictIndex].scheduled_date;

    // Next candidate start date: day after the conflict date
    const nextStart = new Date(currentConflictDate + "T00:00:00");
    nextStart.setDate(nextStart.getDate() + 1);
    const nextStartStr = formatLocalDateStr(nextStart);

    const regeneratedOccurrences = generateLessonPlanOccurrences(
      nextStartStr,
      schedules,
      remainingCount,
      studentId,
      teacherId,
      timeOffList
    );

    if (regeneratedOccurrences.length === 0) {
      toast.error("Não foi possível encontrar datas disponíveis para reagendar.");
      return;
    }

    // Replace future lessons from conflictIndex onwards with regenerated valid dates
    const updated = [...lessons];
    for (let i = 0; i < regeneratedOccurrences.length; i++) {
      const idx = conflictIndex + i;
      if (idx < updated.length) {
        updated[idx] = {
          ...updated[idx],
          scheduled_date: regeneratedOccurrences[i].scheduled_date,
          start_time: regeneratedOccurrences[i].start_time,
          end_time: regeneratedOccurrences[i].end_time,
          attendance_status: "Rescheduled",
        };
      }
    }

    onLessonsChange(updated);

    try {
      setIsSaving(true);
      await saveStudentLessons(studentId, teacherId, studentName, level, focus, updated);
      toast.success(`Aula #${conflictLessonNumber} reagendada automaticamente para ${updated[conflictIndex].scheduled_date.split("-").reverse().join("/")}!`);
    } catch (err: any) {
      toast.error("Erro ao salvar reagendamento.");
    } finally {
      setIsSaving(false);
    }
  };

  // Compute Progress
  const totalLessons = lessons.length > 0 ? lessons.length : totalPackageLessons;
  const completedCount = lessons.filter((l) => l.completed).length;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  // Fecha o plano atual como um documento no Histórico de Planos.
  const handleCompletePlan = async () => {
    if (lessons.length === 0 || isCompletingPlan) return;
    const pending = lessons.filter((l) => !l.completed).length;
    const confirmed = window.confirm(
      pending > 0
        ? `Concluir este plano de aulas? ${pending} aula(s) ainda não estão marcadas como concluídas. O plano será arquivado no Histórico de Planos e você poderá gerar um novo.`
        : "Concluir este plano de aulas? Ele será arquivado no Histórico de Planos e você poderá gerar um novo."
    );
    if (!confirmed) return;

    try {
      setIsCompletingPlan(true);
      // Garante que a última edição esteja persistida antes de fechar a versão.
      await saveStudentLessons(studentId, teacherId, studentName, level, focus, lessons);
      const res = await completeStudentLessonPlan({
        teacherId,
        studentId,
        studentName,
        lessons,
      });
      if (!res.success) {
        toast.error(res.error || "Não foi possível concluir o plano.");
        return;
      }
      setHistoryRefreshKey((k) => k + 1);
      onLessonsChange([]);
      toast.success("Plano concluído e salvo no Histórico de Planos.");
    } catch (e: any) {
      toast.error("Erro ao concluir o plano. Tente novamente.");
    } finally {
      setIsCompletingPlan(false);
    }
  };

  // Filter lessons
  const filteredLessons = useMemo(() => {
    return lessons.filter((l) => {
      // Search filter
      const matchesSearch =
        !searchTerm ||
        `Lesson ${l.lesson_number}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.scheduled_date.includes(searchTerm) ||
        (l.content && l.content.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.homework && l.homework.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (l.notes && l.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchesSearch) return false;

      // Status filter
      if (filterStatus === "completed") return l.completed;
      if (filterStatus === "pending") return !l.completed;
      if (filterStatus === "present") return l.attendance_status === "Present";
      if (filterStatus === "absent") return l.attendance_status === "Absent";
      if (filterStatus === "rescheduled") return l.attendance_status === "Rescheduled";

      return true;
    });
  }, [lessons, searchTerm, filterStatus]);

  // Handle cell edit
  const handleCellChange = async (index: number, field: keyof StudentLesson, value: any) => {
    const updated = [...lessons];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };

    onLessonsChange(updated);

    // Save changes asynchronously
    try {
      setIsSaving(true);
      const res = await saveStudentLessons(studentId, teacherId, studentName, level, focus, updated);
      if (!res.success) {
        console.warn("[LessonPlan] Supabase sync deferred (saved locally):", res.error);
      }
    } catch (e: any) {
      console.error("[LessonPlan] Exception updating lesson cell:", e);
      toast.error("Não foi possível salvar as alterações. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  // Badge styles helper
  const getAttendanceBadgeClass = (status: StudentLesson["attendance_status"]) => {
    switch (status) {
      case "Present":
        return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "Absent":
        return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
      case "Rescheduled":
        return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "Cancelled":
        return "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30";
      default:
        return "bg-muted text-muted-foreground border-transparent";
    }
  };

  // ----------------------------------------------------
  // REQUIRED EMPTY STATE (When student has no lesson plan yet)
  // ----------------------------------------------------
  if (!lessons || lessons.length === 0) {
    return (
      <div className="space-y-6">
        <div className="p-8 sm:p-12 rounded-2xl bg-card border border-border shadow-sm text-center max-w-2xl mx-auto space-y-4 my-6">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-primary/10 text-primary grid place-items-center shadow-xs">
            <Sparkles className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold text-foreground tracking-tight">{t("students.createLessonPlanTitle")}</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
              {t("students.createLessonPlanSubtitle")}
            </p>
          </div>
          <div className="pt-2">
            <Button
              onClick={() => setIsModalOpen(true)}
              className="h-11 px-6 text-sm font-semibold rounded-xl gap-2 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              {t("students.generateLessonPlan")}
            </Button>
          </div>
        </div>

        {/* GENERATION MODAL */}
        <GenerateLessonPlanModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          studentId={studentId}
          teacherId={teacherId}
          studentName={studentName}
          level={level}
          focus={focus}
          initialSchedules={schedules}
          initialStartDate={startDateStr}
          packageLessonCount={totalPackageLessons}
          existingLessonsCount={lessons.length}
          onSuccess={(generated) => onLessonsChange(generated)}
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // FULL SPREADSHEET TABLE VIEW (When lesson plan exists)
  // ----------------------------------------------------
  return (
    <div className="space-y-6">
      {/* 1. PROGRESS HEADER CARD */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {t("students.lessonPlanTitle")}
                </h3>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                  {t("students.completedCount").replace("{completed}", String(completedCount)).replace("{total}", String(totalLessons))}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("students.lessonPlanSubtitle")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsHistoryOpen(true)}
              className="gap-2 text-xs h-9 border-border hover:bg-muted font-semibold"
            >
              <History className="w-3.5 h-3.5" />
              Histórico de Planos
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className="gap-2 text-xs h-9 border-border hover:bg-muted font-semibold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t("students.regeneratePlan")}
            </Button>
          </div>
        </div>

        {/* Progress Bar & Percentage Indicator */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{t("students.courseProgress")}</span>
            <span className="text-foreground font-semibold">{progressPercent}%</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden p-0.5 border border-border/50">
            <div
              className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-500 ease-out shadow-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* CONFLICT WARNING BANNER */}
      {conflictedLessons.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <h4 className="font-bold text-amber-900 dark:text-amber-200 text-xs">
                Atenção: {conflictedLessons.length} {conflictedLessons.length === 1 ? "aula coincide" : "aulas coincidem"} com dias sem trabalho cadastrados!
              </h4>
              <p className="text-amber-800/80 dark:text-amber-300/80 text-[11px]">
                Nenhuma aula foi excluída. Escolha uma ação abaixo para ajustar o plano de aulas sem perder créditos do pacote.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-1 border-t border-amber-500/20">
            {conflictedLessons.map((l) => {
              const matched = checkDateIsNonWorking(l.scheduled_date, timeOffList);
              return (
                <div
                  key={`conflict-${l.lesson_number}`}
                  className="p-2.5 rounded-xl bg-card border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-foreground">Aula #{l.lesson_number}</span> —{" "}
                    <span className="font-mono">{l.scheduled_date.split("-").reverse().join("/")}</span>{" "}
                    <Badge variant="outline" className="text-[10px] font-bold border-amber-400 bg-amber-50 text-amber-900">
                      Coincide com {matched?.type || "Dia sem aula"} {matched?.title ? `(${matched.title})` : ""}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      onClick={() => handleAutoRescheduleLesson(l.lesson_number)}
                      className="h-7 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-xs gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Reagendar automaticamente
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const newDate = prompt("Digite a nova data (AAAA-MM-DD):", l.scheduled_date);
                        if (newDate) {
                          handleCellChange(
                            lessons.findIndex((x) => x.lesson_number === l.lesson_number),
                            "scheduled_date",
                            newDate
                          );
                        }
                      }}
                      className="h-7 text-[11px] font-semibold border-border"
                    >
                      Escolher nova data
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setOverriddenConflictLessonNumbers(
                          (prev) => new Set([...prev, l.lesson_number])
                        );
                        toast.info(`Mantida aula #${l.lesson_number} na data original.`);
                      }}
                      className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      Manter aula mesmo assim
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. FILTER & SEARCH CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("students.searchLessonPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm bg-card border-border"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={filterStatus}
            onValueChange={(val: any) => setFilterStatus(val)}
          >
            <SelectTrigger className="w-[170px] h-9 text-xs bg-card border-border">
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <SelectValue placeholder={t("students.filterByStatus")} />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("students.allLessonsCount").replace("{count}", String(lessons.length))}</SelectItem>
              <SelectItem value="completed">{t("students.completedLessonsCount").replace("{count}", String(completedCount))}</SelectItem>
              <SelectItem value="pending">{t("students.pendingLessonsCount").replace("{count}", String(totalLessons - completedCount))}</SelectItem>
              <SelectItem value="present">{t("status.present")}</SelectItem>
              <SelectItem value="absent">{t("status.absent")}</SelectItem>
              <SelectItem value="rescheduled">{t("status.rescheduled")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 3. SPREADSHEET TABLE CONTAINER */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[650px] scrollbar-thin">
          <table className="w-full text-left text-sm border-collapse min-w-[950px]">
            {/* Table Header */}
            <thead className="sticky top-0 z-10 bg-[#163020] text-white text-xs font-bold uppercase tracking-wider shadow-xs border-b border-[#163020]">
              <tr>
                <th className="py-3 px-3 w-12 text-center border-r border-white/10">#</th>
                <th className="py-3 px-4 w-14 text-center border-r border-white/10">{t("students.headerDone")}</th>
                <th className="py-3 px-4 w-36 border-r border-white/10">{t("students.headerDate")}</th>
                <th className="py-3 px-3 w-28 border-r border-white/10">{t("students.headerTime")}</th>
                <th className="py-3 px-4 w-56 border-r border-white/10">{t("students.headerContentTopic")}</th>
                <th className="py-3 px-4 w-36 border-r border-white/10">{t("students.headerHomework")}</th>
                <th className="py-3 px-4 w-36 border-r border-white/10">{t("students.headerAttendance")}</th>
                <th className="py-3 px-4 border-r border-white/10">{t("students.headerNotes")}</th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-border/60 font-normal text-foreground">
              {filteredLessons.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground/60" />
                      <p className="text-sm font-medium">{t("students.noLessonsFound")}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLessons.map((lesson, idx) => {
                  const originalIndex = lessons.findIndex((l) => l.lesson_number === lesson.lesson_number);
                  const isDone = lesson.completed;
                  
                  // Homework status: true -> Entregue (posted), false -> Pendente (pending), null/undefined -> — Selecionar — (unrecorded)
                  let hwStatus: "posted" | "pending" | "unrecorded" = "unrecorded";
                  if (lesson.homework_posted === true) {
                    hwStatus = "posted";
                  } else if (lesson.homework_posted === false) {
                    hwStatus = "pending";
                  } else {
                    hwStatus = "unrecorded";
                  }

                  return (
                    <tr
                      key={`lesson-row-${lesson.lesson_number}`}
                      className={`hover:bg-muted/40 transition-all group ${
                        isDone ? "opacity-75 bg-emerald-950/5 text-muted-foreground/80 dark:bg-emerald-950/20" : ""
                      }`}
                    >
                      {/* Lesson # */}
                      <td className="py-2 px-3 text-center font-semibold text-xs border-r border-border/40 bg-muted/10 group-hover:bg-muted/30">
                        L{lesson.lesson_number}
                      </td>

                      {/* Completed Checkbox */}
                      <td className="py-2 px-4 text-center border-r border-border/40">
                        <Checkbox
                          checked={lesson.completed}
                          onCheckedChange={(checked) =>
                            handleCellChange(originalIndex, "completed", Boolean(checked))
                          }
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary cursor-pointer"
                        />
                      </td>

                      {/* Date (Editable Input) */}
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Input
                          type="date"
                          value={lesson.scheduled_date}
                          onChange={(e) =>
                            handleCellChange(originalIndex, "scheduled_date", e.target.value)
                          }
                          className="h-8 text-xs font-mono bg-transparent border-transparent hover:border-border focus:border-primary focus:bg-background transition-all cursor-pointer"
                        />
                      </td>

                      {/* Time (Editable Input) */}
                      <td className="py-1.5 px-2 border-r border-border/40">
                        <Input
                          type="time"
                          value={lesson.start_time.slice(0, 5)}
                          onChange={(e) =>
                            handleCellChange(originalIndex, "start_time", e.target.value)
                          }
                          className="h-8 text-xs font-mono bg-transparent border-transparent hover:border-border focus:border-primary focus:bg-background transition-all cursor-pointer"
                        />
                      </td>

                      {/* Content / Topic (Editable Input) */}
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Input
                          placeholder={t("students.topicPlaceholder")}
                          value={lesson.content || ""}
                          onChange={(e) =>
                            handleCellChange(originalIndex, "content", e.target.value)
                          }
                          className="h-8 text-xs bg-transparent border-transparent hover:border-border focus:border-primary focus:bg-background transition-all"
                        />
                      </td>

                      {/* Homework Status (Select Dropdown: — Selecionar — / Pendente / Entregue) */}
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Select
                          value={hwStatus}
                          onValueChange={(val) =>
                            handleCellChange(
                              originalIndex,
                              "homework_posted" as any,
                              val === "posted" ? true : val === "pending" ? false : null
                            )
                          }
                        >
                          <SelectTrigger
                            className={`h-8 text-xs font-semibold border cursor-pointer ${
                              hwStatus === "posted"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                : hwStatus === "pending"
                                ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                                : "bg-transparent text-muted-foreground border-transparent hover:border-border"
                            }`}
                          >
                            <SelectValue placeholder={t("students.hwUnrecorded")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unrecorded">
                              <span className="font-normal text-muted-foreground">{t("students.hwUnrecorded")}</span>
                            </SelectItem>
                            <SelectItem value="pending">
                              <span className="font-semibold text-amber-700 dark:text-amber-400">{t("students.hwPending")}</span>
                            </SelectItem>
                            <SelectItem value="posted">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{t("students.hwPosted")}</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Attendance Status (Select Dropdown) */}
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Select
                          value={lesson.attendance_status || "none"}
                          onValueChange={(val) =>
                            handleCellChange(
                              originalIndex,
                              "attendance_status",
                              val === "none" ? null : val
                            )
                          }
                        >
                          <SelectTrigger
                            className={`h-8 text-xs font-medium border border-border/60 cursor-pointer ${getAttendanceBadgeClass(
                              lesson.attendance_status
                            )}`}
                          >
                            <SelectValue placeholder={t("students.selectAttendance")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t("students.unrecordedAttendance")}</SelectItem>
                            <SelectItem value="Present">{t("status.present")}</SelectItem>
                            <SelectItem value="Absent">{t("status.absent")}</SelectItem>
                            <SelectItem value="Rescheduled">{t("status.rescheduled")}</SelectItem>
                            <SelectItem value="Cancelled">{t("status.cancelled")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Notes Indicator & Popup Trigger */}
                      <td className="py-1.5 px-3 border-r border-border/40">
                        {(() => {
                          const hasNotesText = Boolean(lesson.notes && lesson.notes.trim().length > 0);
                          const atts = ((lesson as any).attachments || []) as LessonAttachment[];
                          const attCount = atts.length;

                          let label = "Adicionar";
                          let badgeClass = "text-muted-foreground hover:text-foreground hover:bg-secondary border-dashed border-border/70";

                          if (hasNotesText && attCount > 0) {
                            label = `📝 Nota · 📎 ${attCount}`;
                            badgeClass = "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 font-bold";
                          } else if (hasNotesText) {
                            label = "📝 1 nota";
                            badgeClass = "bg-primary/10 text-primary border-primary/30 font-bold";
                          } else if (attCount > 0) {
                            label = `📎 ${attCount} ${attCount === 1 ? "anexo" : "anexos"}`;
                            badgeClass = "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 font-bold";
                          }

                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLessonForNotes(lesson);
                                setIsNotesModalOpen(true);
                              }}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all shadow-2xs ${badgeClass}`}
                            >
                              <span>{label}</span>
                            </button>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Action Footer Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3.5 bg-secondary/20 border-t border-border/60">
          <div className="text-xs text-muted-foreground font-semibold">
            {completedCount} de {totalLessons} aulas concluídas ({progressPercent}%)
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              exportLessonPlanPDF({
                studentName,
                level,
                focus,
                totalPackageLessons,
                lessons,
              })
            }
            className="h-9 px-4 text-xs font-bold rounded-xl gap-2 cursor-pointer border-border hover:bg-secondary transition-all shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            Baixar PDF
          </Button>
        </div>
      </div>

      {/* GENERATION MODAL */}
      <GenerateLessonPlanModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        studentId={studentId}
        teacherId={teacherId}
        studentName={studentName}
        level={level}
        focus={focus}
        initialSchedules={schedules}
        initialStartDate={startDateStr}
        packageLessonCount={totalPackageLessons}
        existingLessonsCount={lessons.length}
        onSuccess={(generated) => onLessonsChange(generated)}
      />

      {/* LESSON NOTES & ATTACHMENTS MODAL */}
      <StudentLessonPlanHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        studentId={studentId}
        studentName={studentName}
        refreshKey={historyRefreshKey}
      />

      <LessonNotesModal
        isOpen={isNotesModalOpen}
        onClose={() => {
          setIsNotesModalOpen(false);
          setSelectedLessonForNotes(null);
        }}
        studentId={studentId}
        teacherId={teacherId}
        studentName={studentName}
        lesson={selectedLessonForNotes}
        onSave={async (updatedLesson) => {
          const origIdx = lessons.findIndex((l) => l.lesson_number === updatedLesson.lesson_number);
          if (origIdx !== -1) {
            const updated = [...lessons];
            updated[origIdx] = updatedLesson;
            onLessonsChange(updated);
            try {
              setIsSaving(true);
              const res = await saveStudentLessons(studentId, teacherId, studentName, level, focus, updated);
              if (!res.success) {
                console.warn("[LessonPlan] Supabase save deferred for notes/attachments (saved locally):", res.error);
              }
            } catch (e: any) {
              console.error("[LessonPlan] Exception saving lesson notes:", e);
              toast.error("Não foi possível salvar os anexos. Tente novamente.");
            } finally {
              setIsSaving(false);
            }
          }
        }}
      />
    </div>
  );
}

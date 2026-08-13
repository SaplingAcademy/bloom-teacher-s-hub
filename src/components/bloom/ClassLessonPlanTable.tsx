import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BookOpen,
  Search,
  Filter,
  FileText,
  RefreshCw,
  Users,
  Ban,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { LessonNotesModal } from "./LessonNotesModal";
import { GenerateClassLessonPlanModal } from "./GenerateClassLessonPlanModal";
import { ClassWithDetails } from "@/lib/class-sync";
import {
  AttendanceRecordRow,
  AttendanceStatus,
  ATTENDANCE_STATUSES,
  LessonPlan,
  fetchLessonPlans,
  fetchAttendanceForEvents,
  saveAttendanceRecords,
  saveLessonPlans,
  setEventStatus,
} from "@/lib/lesson-plans";

interface Props {
  cls: ClassWithDetails;
  teacherId: string;
  isPt: boolean;
}

const STATUS_LABELS: Record<AttendanceStatus, { pt: string; en: string; cls: string }> = {
  present: { pt: "Presente", en: "Present", cls: "bg-emerald-700 text-white" },
  absent: { pt: "Falta", en: "Absent", cls: "bg-rose-700 text-white" },
  late: { pt: "Atrasado", en: "Late", cls: "bg-amber-600 text-white" },
  excused: { pt: "Justificada", en: "Excused", cls: "bg-sky-700 text-white" },
};

export function ClassLessonPlanTable({ cls, teacherId, isPt }: Props) {
  const [plans, setPlans] = useState<LessonPlan[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecordRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "completed" | "pending" | "cancelled">("all");
  const [notesPlan, setNotesPlan] = useState<LessonPlan | null>(null);
  const [attendancePlan, setAttendancePlan] = useState<LessonPlan | null>(null);
  const [generatorOpen, setGeneratorOpen] = useState(false);

  const activeMembers = useMemo(
    () => (cls.members || []).filter((m) => m.status === "active" && !m.left_at),
    [cls.members]
  );

  const load = useCallback(async () => {
    if (!teacherId || !cls?.id) return;
    setLoading(true);
    try {
      const list = (await fetchLessonPlans({ classId: cls.id })).map((p, idx) => ({
        ...p,
        lesson_number: p.lesson_number || idx + 1,
      }));
      setPlans(list);
      setAttendance(await fetchAttendanceForEvents(list.map((p) => p.event_id)));
    } catch (err: any) {
      console.error("[ClassLessonPlanTable] load error:", err);
      toast.error(isPt ? "Erro ao carregar as aulas da turma." : "Failed to load class lessons.");
    } finally {
      setLoading(false);
    }
  }, [teacherId, cls.id, isPt]);

  const applyGenerated = async (generated: LessonPlan[]) => {
    setPlans(generated);
    setAttendance(await fetchAttendanceForEvents(generated.map((p) => p.event_id)));
  };

  const generatorModal = (
    <GenerateClassLessonPlanModal
      isOpen={generatorOpen}
      onClose={() => setGeneratorOpen(false)}
      cls={cls}
      teacherId={teacherId}
      isPt={isPt}
      onSuccess={applyGenerated}
    />
  );

  useEffect(() => {
    load();
  }, [load]);

  const completedCount = plans.filter((p) => p.completed).length;
  const progressPercent = plans.length > 0 ? Math.round((completedCount / plans.length) * 100) : 0;

  const filtered = useMemo(() => {
    return plans.filter((p) => {
      const term = searchTerm.toLowerCase();
      const matches =
        !term ||
        p.scheduled_date.includes(term) ||
        (p.content || "").toLowerCase().includes(term) ||
        (p.homework || "").toLowerCase().includes(term) ||
        (p.notes || "").toLowerCase().includes(term);
      if (!matches) return false;
      if (filterStatus === "completed") return p.completed;
      if (filterStatus === "pending") return !p.completed && p.event_status !== "Cancelled";
      if (filterStatus === "cancelled") return p.event_status === "Cancelled";
      return true;
    });
  }, [plans, searchTerm, filterStatus]);

  const patchPlan = async (eventId: string, patch: Partial<LessonPlan>) => {
    const next = plans.map((p) => (p.event_id === eventId ? { ...p, ...patch } : p));
    setPlans(next);
    const target = next.find((p) => p.event_id === eventId);
    if (!target) return;
    const res = await saveLessonPlans(teacherId, [target]);
    if (!res.success) toast.error(isPt ? "Não foi possível salvar." : "Could not save.");
  };

  const toggleCancelled = async (plan: LessonPlan) => {
    const nextStatus = plan.event_status === "Cancelled" ? "Scheduled" : "Cancelled";
    try {
      await setEventStatus(teacherId, plan.event_id, nextStatus);
      setPlans((prev) =>
        prev.map((p) => (p.event_id === plan.event_id ? { ...p, event_status: nextStatus } : p))
      );
      toast.success(
        nextStatus === "Cancelled"
          ? isPt ? "Aula cancelada." : "Lesson cancelled."
          : isPt ? "Aula reativada." : "Lesson reactivated."
      );
    } catch {
      toast.error(isPt ? "Erro ao cancelar a aula." : "Failed to cancel lesson.");
    }
  };

  const attendanceSummary = (eventId: string) => {
    const list = attendance[eventId] || [];
    if (list.length === 0) return isPt ? "Registrar" : "Record";
    const present = list.filter((a) => a.status === "present" || a.status === "late").length;
    return `${present}/${activeMembers.length} ${isPt ? "presentes" : "present"}`;
  };

  if (loading) {
    return (
      <div className="py-14 flex justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-emerald-800" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="p-10 rounded-2xl bg-card border border-dashed border-border text-center space-y-3">
        <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/60" />
        <p className="text-sm font-semibold text-foreground">
          {isPt ? "Nenhuma aula gerada para esta turma." : "No lessons generated for this class."}
        </p>
        <p className="text-xs text-muted-foreground">
          {isPt
            ? "Gere o plano de aulas usando os horários recorrentes da turma e a sua disponibilidade."
            : "Generate the lesson plan using the class recurring schedule and your availability."}
        </p>
        <Button onClick={() => setGeneratorOpen(true)} className="gap-2 text-xs h-9 font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          {isPt ? "Gerar Plano de Aulas da Turma" : "Generate Class Lesson Plan"}
        </Button>
        {generatorModal}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold tracking-tight text-foreground">
                  {isPt ? "Plano de Aulas da Turma" : "Class Lesson Plan"}
                </h3>
                <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                  {completedCount}/{plans.length}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isPt
                  ? "Um plano por aula, presença individual por aluno."
                  : "One plan per lesson, individual attendance per student."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} className="gap-2 text-xs h-9 font-semibold">
              <RefreshCw className="w-3.5 h-3.5" />
              {isPt ? "Atualizar aulas" : "Refresh lessons"}
            </Button>
            <Button size="sm" onClick={() => setGeneratorOpen(true)} className="gap-2 text-xs h-9 font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              {isPt ? "Gerar Plano de Aulas da Turma" : "Generate Class Lesson Plan"}
            </Button>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>{isPt ? "Progresso do curso" : "Course progress"}</span>
            <span className="text-foreground font-semibold">{progressPercent}%</span>
          </div>
          <div className="w-full h-3 bg-muted rounded-full overflow-hidden p-0.5 border border-border/50">
            <div
              className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isPt ? "Buscar aula, conteúdo ou nota..." : "Search lesson, content or note..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-sm bg-card border-border"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
          <SelectTrigger className="w-[190px] h-9 text-xs bg-card border-border">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{isPt ? `Todas (${plans.length})` : `All (${plans.length})`}</SelectItem>
            <SelectItem value="completed">{isPt ? "Concluídas" : "Completed"}</SelectItem>
            <SelectItem value="pending">{isPt ? "Pendentes" : "Pending"}</SelectItem>
            <SelectItem value="cancelled">{isPt ? "Canceladas" : "Cancelled"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[650px] scrollbar-thin">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead className="sticky top-0 z-10 bg-[#163020] text-white text-xs font-bold uppercase tracking-wider border-b border-[#163020]">
              <tr>
                <th className="py-3 px-3 w-12 text-center border-r border-white/10">#</th>
                <th className="py-3 px-4 w-14 text-center border-r border-white/10">{isPt ? "Feito" : "Done"}</th>
                <th className="py-3 px-4 w-36 border-r border-white/10">{isPt ? "Data" : "Date"}</th>
                <th className="py-3 px-3 w-28 border-r border-white/10">{isPt ? "Hora" : "Time"}</th>
                <th className="py-3 px-4 w-56 border-r border-white/10">{isPt ? "Conteúdo" : "Content"}</th>
                <th className="py-3 px-4 w-36 border-r border-white/10">{isPt ? "Homework" : "Homework"}</th>
                <th className="py-3 px-4 w-40 border-r border-white/10">{isPt ? "Presença" : "Attendance"}</th>
                <th className="py-3 px-4 w-32 border-r border-white/10">{isPt ? "Notas" : "Notes"}</th>
                <th className="py-3 px-4 w-28">{isPt ? "Aula" : "Lesson"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-foreground">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-8 h-8 text-muted-foreground/60" />
                      <p className="text-sm font-medium">{isPt ? "Nenhuma aula encontrada." : "No lessons found."}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((plan) => {
                  const isCancelled = plan.event_status === "Cancelled";
                  const hwStatus =
                    plan.homework_posted === true ? "posted" : plan.homework_posted === false ? "pending" : "unrecorded";
                  const attCount = (attendance[plan.event_id] || []).length;
                  const noteCount = (plan.attachments || []).length;
                  const hasNotes = Boolean(plan.notes && plan.notes.trim());

                  return (
                    <tr
                      key={plan.event_id}
                      className={`hover:bg-muted/40 transition-all group ${
                        isCancelled ? "opacity-60 line-through decoration-rose-500/40" : plan.completed ? "opacity-75 bg-emerald-950/5" : ""
                      }`}
                    >
                      <td className="py-2 px-3 text-center font-semibold text-xs border-r border-border/40 bg-muted/10">
                        L{plan.lesson_number}
                      </td>
                      <td className="py-2 px-4 text-center border-r border-border/40">
                        <Checkbox
                          checked={plan.completed}
                          disabled={isCancelled}
                          onCheckedChange={(c) => patchPlan(plan.event_id, { completed: Boolean(c) })}
                          className="data-[state=checked]:bg-primary data-[state=checked]:border-primary cursor-pointer"
                        />
                      </td>
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Input
                          type="date"
                          value={plan.scheduled_date}
                          onChange={(e) => patchPlan(plan.event_id, { scheduled_date: e.target.value })}
                          className="h-8 text-xs font-mono bg-transparent border-transparent hover:border-border focus:border-primary focus:bg-background"
                        />
                      </td>
                      <td className="py-1.5 px-2 border-r border-border/40">
                        <Input
                          type="time"
                          value={(plan.start_time || "").slice(0, 5)}
                          onChange={(e) => patchPlan(plan.event_id, { start_time: e.target.value })}
                          className="h-8 text-xs font-mono bg-transparent border-transparent hover:border-border focus:border-primary focus:bg-background"
                        />
                      </td>
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Input
                          placeholder={isPt ? "Tópico da aula" : "Lesson topic"}
                          value={plan.content || ""}
                          onChange={(e) =>
                            setPlans((prev) =>
                              prev.map((p) => (p.event_id === plan.event_id ? { ...p, content: e.target.value } : p))
                            )
                          }
                          onBlur={(e) => patchPlan(plan.event_id, { content: e.target.value })}
                          className="h-8 text-xs bg-transparent border-transparent hover:border-border focus:border-primary focus:bg-background"
                        />
                      </td>
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <Select
                          value={hwStatus}
                          onValueChange={(val) =>
                            patchPlan(plan.event_id, {
                              homework_posted: val === "posted" ? true : val === "pending" ? false : null,
                            })
                          }
                        >
                          <SelectTrigger
                            className={`h-8 text-xs font-semibold border cursor-pointer ${
                              hwStatus === "posted"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                : hwStatus === "pending"
                                ? "bg-amber-50 text-amber-800 border-amber-300"
                                : "bg-transparent text-muted-foreground border-transparent hover:border-border"
                            }`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unrecorded">{isPt ? "— Selecionar —" : "— Select —"}</SelectItem>
                            <SelectItem value="pending">{isPt ? "Pendente" : "Pending"}</SelectItem>
                            <SelectItem value="posted">{isPt ? "Entregue" : "Posted"}</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <button
                          type="button"
                          disabled={isCancelled}
                          onClick={() => setAttendancePlan(plan)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all disabled:cursor-not-allowed ${
                            attCount > 0
                              ? "bg-emerald-50 text-emerald-800 border-emerald-300 font-bold"
                              : "text-muted-foreground border-dashed border-border/70 hover:text-foreground"
                          }`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          {attendanceSummary(plan.event_id)}
                        </button>
                      </td>
                      <td className="py-1.5 px-3 border-r border-border/40">
                        <button
                          type="button"
                          onClick={() => setNotesPlan(plan)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs cursor-pointer transition-all ${
                            hasNotes || noteCount > 0
                              ? "bg-primary/10 text-primary border-primary/30 font-bold"
                              : "text-muted-foreground border-dashed border-border/70 hover:text-foreground"
                          }`}
                        >
                          {hasNotes && noteCount > 0
                            ? `📝 · 📎 ${noteCount}`
                            : hasNotes
                            ? "📝 1 nota"
                            : noteCount > 0
                            ? `📎 ${noteCount}`
                            : isPt ? "Adicionar" : "Add"}
                        </button>
                      </td>
                      <td className="py-1.5 px-3">
                        <button
                          type="button"
                          onClick={() => toggleCancelled(plan)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-semibold cursor-pointer ${
                            isCancelled
                              ? "bg-rose-50 text-rose-700 border-rose-300"
                              : "text-muted-foreground border-border hover:text-foreground"
                          }`}
                        >
                          {isCancelled ? <RotateCcw className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                          {isCancelled ? (isPt ? "Reativar" : "Restore") : isPt ? "Cancelar" : "Cancel"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attendance panel */}
      <Dialog open={Boolean(attendancePlan)} onOpenChange={() => setAttendancePlan(null)}>
        <DialogContent className="max-w-lg rounded-3xl bg-[#FAF7F2] border border-stone-200 font-figtree">
          <DialogHeader>
            <DialogTitle className="font-outfit text-xl font-bold text-[#163020]">
              {isPt ? "Presença da aula" : "Lesson attendance"} — L{attendancePlan?.lesson_number}
            </DialogTitle>
            <span className="text-xs text-stone-500 font-semibold">
              {attendancePlan?.scheduled_date} · {(attendancePlan?.start_time || "").slice(0, 5)}
            </span>
          </DialogHeader>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pt-1">
            {activeMembers.length === 0 && (
              <p className="text-xs text-stone-500">
                {isPt ? "Nenhum aluno ativo nesta turma." : "No active students in this class."}
              </p>
            )}
            {activeMembers.map((m) => {
              const current = (attendance[attendancePlan?.event_id || ""] || []).find(
                (a) => a.student_id === m.student_id
              );
              return (
                <div
                  key={m.student_id}
                  className="p-3 bg-white rounded-xl border border-stone-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <span className="font-bold text-xs text-stone-900">{m.student_name}</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {ATTENDANCE_STATUSES.map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={async () => {
                          if (!attendancePlan) return;
                          try {
                            await saveAttendanceRecords(teacherId, attendancePlan.event_id, [
                              { student_id: m.student_id, status: st },
                            ]);
                            setAttendance((prev) => {
                              const list = (prev[attendancePlan.event_id] || []).filter(
                                (a) => a.student_id !== m.student_id
                              );
                              return {
                                ...prev,
                                [attendancePlan.event_id]: [
                                  ...list,
                                  {
                                    event_id: attendancePlan.event_id,
                                    student_id: m.student_id,
                                    status: st,
                                    student_name: m.student_name,
                                  },
                                ],
                              };
                            });
                          } catch {
                            toast.error(isPt ? "Erro ao salvar presença." : "Failed to save attendance.");
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          current?.status === st
                            ? STATUS_LABELS[st].cls + " shadow-sm"
                            : "bg-stone-50 text-stone-600 hover:bg-stone-100 border border-stone-200"
                        }`}
                      >
                        {isPt ? STATUS_LABELS[st].pt : STATUS_LABELS[st].en}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-stone-200 flex justify-between items-center gap-3">
            <button
              type="button"
              onClick={() => attendancePlan && toggleCancelled(attendancePlan)}
              className="h-10 px-4 rounded-xl border border-rose-200 bg-white text-rose-700 font-bold text-xs hover:bg-rose-50 cursor-pointer"
            >
              {attendancePlan?.event_status === "Cancelled"
                ? isPt ? "Reativar aula" : "Restore lesson"
                : isPt ? "Cancelar aula" : "Cancel lesson"}
            </button>
            <button
              type="button"
              onClick={() => setAttendancePlan(null)}
              className="h-10 px-5 rounded-xl bg-[#163020] text-[#F4EBE1] font-bold text-xs hover:bg-[#1a3825] cursor-pointer"
            >
              {isPt ? "Concluir" : "Done"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Notes & attachments (shared with the individual track) */}
      <LessonNotesModal
        isOpen={Boolean(notesPlan)}
        onClose={() => setNotesPlan(null)}
        studentId={cls.id}
        teacherId={teacherId}
        studentName={cls.name}
        lesson={
          notesPlan
            ? ({
                ...notesPlan,
                student_id: cls.id,
                schedule_id: null,
                attendance_status: null,
              } as any)
            : null
        }
        onSave={async (updated: any) => {
          if (!notesPlan) return;
          await patchPlan(notesPlan.event_id, {
            notes: updated.notes || "",
            attachments: updated.attachments || [],
          });
          setNotesPlan(null);
        }}
      />

      {generatorModal}
    </div>
  );
}

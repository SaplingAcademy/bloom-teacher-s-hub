import React, { useEffect, useMemo, useState } from "react";
import { StudentLesson, fetchStudentLessons } from "@/lib/lesson-plan-sync";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  History,
  Loader2,
  FileText,
  Paperclip,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Pencil,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  /** current in-memory lessons, used as a fallback while fetching */
  lessons: StudentLesson[];
  /** optional edit hook — preserves existing permission to edit completed plans */
  onEditLesson?: (lesson: StudentLesson) => void;
}

const fmtDate = (d: string) => (d ? d.split("-").reverse().join("/") : "—");
const fmtTime = (t?: string) => (t ? t.slice(0, 5) : "—");

const attendanceLabel: Record<string, string> = {
  Present: "Presente",
  Absent: "Ausente",
  Rescheduled: "Reagendada",
  Cancelled: "Cancelada",
};

const attendanceClass = (status?: StudentLesson["attendance_status"]) => {
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

export function StudentLessonPlanHistoryModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  lessons,
  onEditLesson,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StudentLesson[]>(lessons);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !studentId) return;
    let active = true;
    setLoading(true);
    fetchStudentLessons(studentId)
      .then((data) => {
        if (active) setRows(data.length > 0 ? data : lessons);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, studentId]);

  const todayStr = new Date().toISOString().split("T")[0];

  // History = concluded plans + past occurrences. Nothing is deleted or reused.
  const history = useMemo(() => {
    return rows
      .filter((l) => l.completed || l.scheduled_date < todayStr)
      .sort((a, b) => {
        const byDate = (b.scheduled_date || "").localeCompare(a.scheduled_date || "");
        if (byDate !== 0) return byDate;
        return (b.start_time || "").localeCompare(a.start_time || "");
      });
  }, [rows, todayStr]);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <History className="w-5 h-5 text-primary" />
            Histórico de Planos
          </DialogTitle>
          <DialogDescription>
            Todos os planos de aula anteriores e concluídos de {studentName}, do mais recente para o
            mais antigo.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico…
          </div>
        ) : history.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <FileText className="w-8 h-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Ainda não há aulas concluídas ou anteriores no histórico deste aluno.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((l) => {
              const key = l.event_id || l.id || `${l.scheduled_date}-${l.lesson_number}`;
              const isOpenRow = expanded === key;
              const atts = l.attachments || [];
              return (
                <div key={key} className="rounded-xl border border-border bg-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpenRow ? null : key)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors cursor-pointer"
                  >
                    {isOpenRow ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                    <span className="text-xs font-bold text-foreground shrink-0">
                      L{l.lesson_number}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {fmtDate(l.scheduled_date)} · {fmtTime(l.start_time)}–{fmtTime(l.end_time)}
                    </span>
                    <span className="text-xs text-foreground truncate flex-1">
                      {l.content || "Sem conteúdo registrado"}
                    </span>
                    {atts.length > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                        <Paperclip className="w-3 h-3" />
                        {atts.length}
                      </Badge>
                    )}
                    {l.completed && (
                      <Badge
                        variant="outline"
                        className="text-[10px] shrink-0 bg-primary/10 text-primary border-primary/30"
                      >
                        Concluída
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] shrink-0 ${attendanceClass(l.attendance_status)}`}
                    >
                      {l.attendance_status ? attendanceLabel[l.attendance_status] : "Sem registro"}
                    </Badge>
                  </button>

                  {isOpenRow && (
                    <div className="px-4 pb-4 pt-1 space-y-3 border-t border-border/60 bg-muted/10">
                      <div className="grid sm:grid-cols-2 gap-3 pt-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Conteúdo
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {l.content || "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Homework
                          </p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">
                            {l.homework || "—"}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {l.homework_posted === true
                              ? "Entregue"
                              : l.homework_posted === false
                              ? "Pendente"
                              : "Sem registro"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Notas
                        </p>
                        <p className="text-sm text-foreground whitespace-pre-wrap">
                          {l.notes || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                          Anexos
                        </p>
                        {atts.length === 0 ? (
                          <p className="text-sm text-muted-foreground">—</p>
                        ) : (
                          <ul className="space-y-1">
                            {atts.map((a: any) => (
                              <li key={a.id} className="text-sm">
                                {a.file_url ? (
                                  <a
                                    href={a.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {a.title || a.file_name || a.file_url}
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-foreground">
                                    <Paperclip className="w-3.5 h-3.5" />
                                    {a.title || a.file_name || "Anexo"}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {onEditLesson && (
                        <div className="pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditLesson(l)}
                            className="h-8 text-xs gap-1.5"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Editar notas e anexos
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

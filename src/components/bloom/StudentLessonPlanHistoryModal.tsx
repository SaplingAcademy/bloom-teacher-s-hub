import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  FileText,
  Layers,
  Loader2,
  Paperclip,
} from "lucide-react";
import type { StudentLesson } from "@/lib/lesson-plan-sync";
import {
  fetchLessonPlanDocuments,
  LessonPlanDocument,
} from "@/lib/lesson-plan-documents";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  /** Recarrega a lista quando um novo documento é criado */
  refreshKey?: number;
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—";
  const onlyDate = dateStr.slice(0, 10);
  const [y, m, d] = onlyDate.split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

const attendanceLabel: Record<string, string> = {
  Present: "Presente",
  Absent: "Ausente",
  Rescheduled: "Reagendada",
  Cancelled: "Cancelada",
};

function attendanceClass(status?: string | null) {
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
}

/** Documento histórico: mesma planilha do plano ativo, em modo somente leitura. */
function PlanDocumentSheet({ doc }: { doc: LessonPlanDocument }) {
  const lessons = useMemo(
    () =>
      [...(doc.snapshot || [])].sort(
        (a, b) => (a.lesson_number || 0) - (b.lesson_number || 0)
      ),
    [doc]
  );

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="overflow-x-auto max-h-[55vh] scrollbar-thin">
        <table className="w-full text-left text-sm border-collapse min-w-[900px]">
          <thead className="sticky top-0 z-10 bg-[#163020] text-white text-xs font-bold uppercase tracking-wider border-b border-[#163020]">
            <tr>
              <th className="py-3 px-3 w-12 text-center border-r border-white/10">#</th>
              <th className="py-3 px-4 w-14 text-center border-r border-white/10">OK</th>
              <th className="py-3 px-4 w-32 border-r border-white/10">Data</th>
              <th className="py-3 px-3 w-24 border-r border-white/10">Horário</th>
              <th className="py-3 px-4 w-56 border-r border-white/10">Conteúdo</th>
              <th className="py-3 px-4 w-40 border-r border-white/10">Homework</th>
              <th className="py-3 px-4 w-32 border-r border-white/10">Presença</th>
              <th className="py-3 px-4 border-r border-white/10">Notas / Anexos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 text-foreground">
            {lessons.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                  Este documento não possui aulas registradas.
                </td>
              </tr>
            ) : (
              lessons.map((l: StudentLesson, idx) => {
                const atts = l.attachments || [];
                return (
                  <tr key={`${doc.id}-${l.lesson_number}-${idx}`} className="hover:bg-muted/30">
                    <td className="py-2 px-3 text-center font-semibold text-xs border-r border-border/40 bg-muted/10">
                      L{l.lesson_number}
                    </td>
                    <td className="py-2 px-4 text-center border-r border-border/40">
                      {l.completed ? (
                        <CheckCircle2 className="w-4 h-4 text-primary mx-auto" />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-xs font-mono border-r border-border/40">
                      {formatDate(l.scheduled_date)}
                    </td>
                    <td className="py-2 px-3 text-xs font-mono border-r border-border/40">
                      {String(l.start_time || "").slice(0, 5)}
                    </td>
                    <td className="py-2 px-4 text-xs border-r border-border/40">
                      {l.content?.trim() || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2 px-4 text-xs border-r border-border/40">
                      {l.homework?.trim() ? (
                        l.homework
                      ) : l.homework_posted === true ? (
                        "Entregue"
                      ) : l.homework_posted === false ? (
                        "Pendente"
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 px-4 border-r border-border/40">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${attendanceClass(l.attendance_status)}`}
                      >
                        {attendanceLabel[l.attendance_status || ""] || "—"}
                      </Badge>
                    </td>
                    <td className="py-2 px-4 text-xs space-y-1">
                      {l.notes?.trim() && <p className="text-muted-foreground">{l.notes}</p>}
                      {atts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {atts.map((a, i) => (
                            <span
                              key={a.id || i}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-border bg-muted/40 text-[11px]"
                            >
                              <Paperclip className="w-3 h-3" />
                              {a.title || a.file_name || "Anexo"}
                            </span>
                          ))}
                        </div>
                      )}
                      {!l.notes?.trim() && atts.length === 0 && (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StudentLessonPlanHistoryModal({
  isOpen,
  onClose,
  studentId,
  studentName,
  refreshKey = 0,
}: Props) {
  const [documents, setDocuments] = useState<LessonPlanDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openDoc, setOpenDoc] = useState<LessonPlanDocument | null>(null);

  useEffect(() => {
    if (!isOpen || !studentId) return;
    setOpenDoc(null);
    setIsLoading(true);
    fetchLessonPlanDocuments({ studentId })
      .then(setDocuments)
      .finally(() => setIsLoading(false));
  }, [isOpen, studentId, refreshKey]);

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            {openDoc ? (
              <>
                <FileText className="w-5 h-5 text-primary" />
                {openDoc.title}
              </>
            ) : (
              <>
                <Layers className="w-5 h-5 text-primary" />
                Histórico de Planos
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {openDoc
              ? `Documento fechado em ${formatDate(openDoc.completed_at)} — somente leitura.`
              : `Planos de aula concluídos de ${studentName}. Cada documento é um plano completo.`}
          </DialogDescription>
        </DialogHeader>

        {openDoc ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setOpenDoc(null)}
                className="gap-2 h-9 text-xs font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Voltar ao histórico
              </Button>
              <Badge variant="outline" className="text-[11px] font-semibold">
                {openDoc.lesson_count} {openDoc.lesson_count === 1 ? "aula" : "aulas"}
              </Badge>
              <Badge variant="outline" className="text-[11px] font-semibold">
                {formatDate(openDoc.period_start)} – {formatDate(openDoc.period_end)}
              </Badge>
              <Badge className="bg-primary/10 text-primary border-primary/20 text-[11px] font-semibold">
                Concluído
              </Badge>
            </div>
            <PlanDocumentSheet doc={openDoc} />
          </div>
        ) : isLoading ? (
          <div className="py-16 flex items-center justify-center text-muted-foreground gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico...
          </div>
        ) : documents.length === 0 ? (
          <div className="py-14 text-center space-y-2">
            <FileText className="w-9 h-9 text-muted-foreground/60 mx-auto" />
            <p className="text-sm font-semibold text-foreground">Nenhum plano concluído ainda</p>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              Ao clicar em “Concluir Plano”, o plano atual é fechado e arquivado aqui como um
              documento completo, com todas as aulas preservadas.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="p-4 rounded-2xl border border-border bg-card shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-semibold text-sm text-foreground truncate">
                      {doc.title}
                    </span>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                      Concluído
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="w-3 h-3" />
                      Período: {formatDate(doc.period_start)} – {formatDate(doc.period_end)}
                    </span>
                    <span>Criado em {formatDate(doc.plan_created_at)}</span>
                    <span>Concluído em {formatDate(doc.completed_at)}</span>
                    <span className="font-semibold text-foreground">
                      {doc.lesson_count} {doc.lesson_count === 1 ? "aula" : "aulas"}
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOpenDoc(doc)}
                  className="h-9 text-xs font-bold gap-2 shrink-0"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Abrir Plano
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

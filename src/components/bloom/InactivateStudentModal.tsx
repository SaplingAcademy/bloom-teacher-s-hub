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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, UserX, Calendar, DollarSign, ShieldAlert, CheckCircle2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  teacherId: string;
  studentName: string;
  packageName?: string;
  activeClassCount?: number;
  onSuccess: (data: {
    inactivationDate: string;
    inactivationReason: string;
    stopBilling: boolean;
    cancelFutureEvents: boolean;
  }) => void;
}

export function InactivateStudentModal({
  isOpen,
  onClose,
  studentId,
  teacherId,
  studentName,
  packageName,
  activeClassCount = 0,
  onSuccess,
}: Props) {
  const [inactivationDate, setInactivationDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [inactivationReason, setInactivationReason] = useState<string>("Pausou as aulas");
  const [stopBilling, setStopBilling] = useState<boolean>(true);
  const [cancelFutureEvents, setCancelFutureEvents] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setInactivationDate(new Date().toISOString().split("T")[0]);
      setInactivationReason("Pausou as aulas");
      setStopBilling(true);
      setCancelFutureEvents(true);
    }
  }, [isOpen]);

  const handleConfirmInactivation = async () => {
    if (!studentId || !teacherId) return;

    try {
      setIsSubmitting(true);

      // 1. Update student status in public.students table
      const { error: studentErr } = await supabase
        .from("students")
        .update({
          status: "Inactive",
          notes: inactivationReason ? `[Inativado em ${inactivationDate.split("-").reverse().join("/")} - Motivo: ${inactivationReason}]` : undefined,
        })
        .eq("id", studentId)
        .eq("teacher_id", teacherId);

      if (studentErr) {
        console.warn("[InactivateStudentModal] Supabase update warning:", studentErr.message);
      }

      // 2. Stop future recurring billing if requested
      if (stopBilling) {
        await supabase
          .from("student_packages")
          .update({
            status: "inactive",
            ended_at: inactivationDate,
          })
          .eq("student_id", studentId)
          .eq("teacher_id", teacherId)
          .eq("status", "active");
      }

      // 3. Cancel future scheduled calendar events after inactivation date if requested
      if (cancelFutureEvents) {
        await supabase
          .from("calendar_events")
          .update({
            status: "Closed",
          })
          .eq("student_id", studentId)
          .eq("teacher_id", teacherId)
          .gt("date", inactivationDate)
          .eq("status", "Scheduled");
      }

      toast.success(`${studentName} foi marcado(a) como inativo(a). Todo o histórico foi preservado.`);
      onSuccess({
        inactivationDate,
        inactivationReason,
        stopBilling,
        cancelFutureEvents,
      });
      onClose();
    } catch (err: any) {
      console.error("[InactivateStudentModal] Inactivation error:", err);
      toast.error(err.message || "Erro ao inativar aluno.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-2xl p-6 bg-card border-border shadow-lg space-y-4">
        <DialogHeader className="space-y-2 pb-3 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <UserX className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Marcar aluno como inativo?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                O perfil e todo o histórico deste aluno serão preservados, mas ele deixará de aparecer entre os alunos ativos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Student Summary */}
        <div className="p-3 rounded-xl bg-muted/40 border border-border/60 space-y-1 text-xs">
          <div className="flex items-center justify-between font-semibold text-foreground">
            <span>{studentName}</span>
            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
              Sairá da lista ativa
            </Badge>
          </div>
          {packageName && (
            <p className="text-[11px] text-muted-foreground">Pacote atual: {packageName}</p>
          )}
        </div>

        {/* Class Warning if active class member */}
        {activeClassCount > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <div>
              <p className="font-bold">Atenção: Turmas / Duplas</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                Este aluno participa de {activeClassCount} turma(s) ativa(s). A inativação preservará o histórico de participação na turma.
              </p>
            </div>
          </div>
        )}

        {/* Form Options */}
        <div className="space-y-4 py-1">
          {/* Data de Inativação */}
          <div className="space-y-1.5">
            <Label htmlFor="inactivation-date" className="text-xs font-semibold text-foreground">
              Data de inativação (opcional)
            </Label>
            <Input
              id="inactivation-date"
              type="date"
              value={inactivationDate}
              onChange={(e) => setInactivationDate(e.target.value)}
              className="h-9 text-xs font-mono bg-background border-border"
            />
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <Label htmlFor="inactivation-reason" className="text-xs font-semibold text-foreground">
              Motivo da inativação (opcional)
            </Label>
            <Select value={inactivationReason} onValueChange={setInactivationReason}>
              <SelectTrigger id="inactivation-reason" className="h-9 text-xs bg-background border-border">
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Concluiu o curso">Concluiu o curso</SelectItem>
                <SelectItem value="Pausou as aulas">Pausou as aulas</SelectItem>
                <SelectItem value="Cancelou">Cancelou</SelectItem>
                <SelectItem value="Mudança de horário">Mudança de horário</SelectItem>
                <SelectItem value="Questões financeiras">Questões financeiras</SelectItem>
                <SelectItem value="Outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Financial & Calendar Checkboxes */}
          <div className="space-y-2 pt-2 border-t border-border/60">
            <div className="flex items-start gap-2.5">
              <Checkbox
                id="stop-billing"
                checked={stopBilling}
                onCheckedChange={(checked) => setStopBilling(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="grid gap-0.5 leading-none">
                <label htmlFor="stop-billing" className="text-xs font-medium text-foreground cursor-pointer">
                  Encerrar cobranças futuras a partir da data de inativação
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Preserva todas as faturas e pagamentos já emitidos.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-1">
              <Checkbox
                id="cancel-future-events"
                checked={cancelFutureEvents}
                onCheckedChange={(checked) => setCancelFutureEvents(Boolean(checked))}
                className="mt-0.5"
              />
              <div className="grid gap-0.5 leading-none">
                <label htmlFor="cancel-future-events" className="text-xs font-medium text-foreground cursor-pointer">
                  Cancelar aulas futuras no calendário após a data de inativação
                </label>
                <p className="text-[11px] text-muted-foreground">
                  Preserva todas as aulas e presenças passadas.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-3 border-t border-border/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 text-xs"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmInactivation}
            disabled={isSubmitting}
            className="h-9 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white cursor-pointer"
          >
            {isSubmitting ? "Inativando..." : "Marcar como inativo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { reportUserError, toUserMessage } from "@/lib/user-error";
import { t as i18nT } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, Undo2, CalendarClock, Pencil, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  formatCentsToBRL,
  getStudentChargesByAgreement,
  recordInvoicePayment,
  updateInvoicePaymentDate,
  undoInvoicePayment,
  updateInvoiceDueDate,
  type ManagedCharge,
  type ManagedChargeGroup,
} from "@/lib/finance-engine";
import { localDateString } from "@/lib/billing-domain";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EditMode = { id: string; kind: "pay" | "payDate" | "due"; value: string } | null;

export function formatChargeDate(date: string | null | undefined, lang: string): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-");
  return lang === "pt" ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

export function chargeLabel(c: ManagedCharge, lang: string): string {
  const pt = lang === "pt";
  if (c.sequenceNumber == null) return pt ? "Cobrança" : "Charge";
  const base = c.chargeKind === "installment" ? (pt ? "Parcela" : "Installment")
    : c.chargeKind === "one_time" ? (pt ? "Pagamento único" : "One-time")
    : (pt ? "Mensalidade" : "Monthly");
  return c.sequenceCount ? `${base} ${c.sequenceNumber}/${c.sequenceCount}` : `${base} ${c.sequenceNumber}`;
}

function StatusBadge({ status, dueDate, lang }: { status: ManagedCharge["status"]; dueDate: string; lang: string }) {
  const pt = lang === "pt";
  if (status === "pending" && dueDate.slice(0, 7) > localDateString().slice(0, 7)) {
    return <Badge variant="outline" className="text-[10px] font-bold bg-secondary text-secondary-foreground border-border">{pt ? "Futura" : "Upcoming"}</Badge>;
  }
  const map = {
    paid: { label: pt ? "Paga" : "Paid", cls: "bg-primary/10 text-primary border-primary/30" },
    pending: { label: pt ? "Pendente" : "Pending", cls: "bg-muted text-muted-foreground border-border" },
    overdue: { label: pt ? "Vencida" : "Overdue", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    cancelled: { label: pt ? "Cancelada" : "Cancelled", cls: "bg-muted text-muted-foreground border-border line-through" },
  } as const;
  const m = map[status];
  return <Badge variant="outline" className={`text-[10px] font-bold ${m.cls}`}>{m.label}</Badge>;
}

export function ManageChargesTable({
  teacherId,
  studentId,
  lang,
  onChanged,
}: {
  teacherId: string;
  studentId: string;
  lang: string;
  onChanged: () => void;
}) {
  const pt = lang === "pt";
  const [groups, setGroups] = useState<ManagedChargeGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditMode>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setGroups(await getStudentChargesByAgreement(teacherId, studentId));
    } catch (err: any) {
      setLoadError(err?.message || (pt ? "Erro ao carregar cobranças." : "Could not load charges."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [teacherId, studentId]);

  const run = async (id: string, action: () => Promise<void>, success: string) => {
    setBusyId(id);
    try {
      await action();
      toast.success(success);
      setEdit(null);
      await load();
      onChanged();
    } catch (err: any) {
      toast.error(reportUserError(err, i18nT("errors.generic", pt ? "pt" : "en")));
    } finally {
      setBusyId(null);
    }
  };

  const confirmEdit = (c: ManagedCharge) => {
    if (!edit || !edit.value) return;
    if (edit.kind === "pay") {
      run(c.id, () => recordInvoicePayment(c.id, teacherId, edit.value), pt ? "Pagamento registrado." : "Payment recorded.");
    } else if (edit.kind === "payDate") {
      run(c.id, () => updateInvoicePaymentDate(c.id, teacherId, edit.value), pt ? "Data do pagamento atualizada." : "Payment date updated.");
    } else {
      run(c.id, () => updateInvoiceDueDate(c.id, teacherId, edit.value), pt ? "Vencimento atualizado." : "Due date updated.");
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-primary" /> {pt ? "Carregando cobranças..." : "Loading charges..."}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-xs text-destructive flex items-center justify-between gap-3">
        <span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{loadError}</span>
        <Button size="sm" variant="outline" onClick={load}>{pt ? "Tentar novamente" : "Retry"}</Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return <p className="text-xs text-muted-foreground italic text-center py-6">{pt ? "Nenhuma cobrança registrada." : "No charges yet."}</p>;
  }

  const editLabel = edit?.kind === "pay"
    ? (pt ? "Data do pagamento" : "Payment date")
    : edit?.kind === "payDate" ? (pt ? "Nova data do pagamento" : "New payment date")
    : (pt ? "Novo vencimento" : "New due date");

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.studentPackageId || "unlinked"} className="space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="font-display text-sm font-bold text-foreground">{g.studentPackageId ? g.packageName : (pt ? "Cobranças sem contrato" : "Charges without contract")}</h4>
            {g.isActive && <Badge className="text-[10px]">{pt ? "Contrato ativo" : "Active contract"}</Badge>}
            {g.startedAt && <span className="text-[11px] text-muted-foreground">{pt ? "desde" : "since"} {formatChargeDate(g.startedAt, lang)}</span>}
          </div>
          {g.charges.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">{pt ? "Sem cobranças neste contrato." : "No charges in this contract."}</p>
          ) : (
            <div className="rounded-xl border border-border divide-y divide-border/60">
              {g.charges.map((c) => {
                const busy = busyId === c.id;
                const editing = edit?.id === c.id;
                return (
                  <div key={c.id} className="p-3 text-xs space-y-2">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
                      <span className="font-bold text-foreground sm:col-span-2">{chargeLabel(c, lang)}</span>
                      <span className="text-muted-foreground">{pt ? "Venc." : "Due"} {formatChargeDate(c.dueDate, lang)}</span>
                      <span className="font-semibold text-foreground">{formatCentsToBRL(c.amountCents)}</span>
                      <StatusBadge status={c.status} dueDate={c.dueDate} lang={lang} />
                      <span className="text-muted-foreground">{c.paymentDate ? `${pt ? "Pago em" : "Paid"} ${formatChargeDate(c.paymentDate, lang)}` : "—"}</span>
                    </div>
                    {editing ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-muted-foreground">{editLabel}</span>
                        <Input type="date" value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} className="h-8 w-40 text-xs" />
                        <Button size="sm" className="h-8" disabled={busy || !edit.value} onClick={() => confirmEdit(c)}>{pt ? "Salvar" : "Save"}</Button>
                        <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => setEdit(null)}>{pt ? "Cancelar" : "Cancel"}</Button>
                      </div>
                    ) : c.status !== "cancelled" && (
                      <div className="flex flex-wrap gap-1.5">
                        {c.status === "paid" ? (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={busy} onClick={() => setEdit({ id: c.id, kind: "payDate", value: c.paymentDate || localDateString() })}>
                              <Pencil className="w-3 h-3" />{pt ? "Editar data do pagamento" : "Edit payment date"}
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={busy}
                              onClick={() => run(c.id, () => undoInvoicePayment(c.id, teacherId), pt ? "Pagamento desfeito." : "Payment undone.")}>
                              <Undo2 className="w-3 h-3" />{pt ? "Desfazer pagamento" : "Undo payment"}
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" disabled={busy} onClick={() => setEdit({ id: c.id, kind: "pay", value: localDateString() })}>
                            <CheckCircle2 className="w-3 h-3" />{pt ? "Marcar como paga" : "Mark as paid"}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" disabled={busy} onClick={() => setEdit({ id: c.id, kind: "due", value: c.dueDate })}>
                          <CalendarClock className="w-3 h-3" />{pt ? "Editar vencimento" : "Edit due date"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

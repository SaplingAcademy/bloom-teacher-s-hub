import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getStudentChargesByAgreement, recordInvoicePayment, formatCentsToBRL, type ManagedCharge } from "@/lib/finance-engine";
import { isPriorOrCurrentMonthOpenCharge } from "@/lib/billing-domain";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { chargeLabel, formatChargeDate } from "@/components/bloom/ManageChargesTable";

/**
 * Shown right after a new contract is saved: asks which past/current-month charges were already paid.
 * Nothing is preselected; skipping changes nothing.
 */
export function PriorPaymentsDialog({
  teacherId,
  studentId,
  lang,
  onClose,
  onChanged,
}: {
  teacherId: string;
  studentId: string;
  lang: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const pt = lang === "pt";
  const [charges, setCharges] = useState<ManagedCharge[] | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStudentChargesByAgreement(teacherId, studentId)
      .then((groups) => {
        if (cancelled) return;
        const active = groups.find((g) => g.isActive && g.studentPackageId);
        const open = (active?.charges || []).filter((c) => isPriorOrCurrentMonthOpenCharge(c));
        if (open.length === 0) onClose();
        else setCharges(open);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || (pt ? "Não foi possível carregar as cobranças." : "Could not load charges."));
        onClose();
      });
    return () => {
      cancelled = true;
    };
  }, [teacherId, studentId]);

  if (!charges) return null;

  const toggle = (c: ManagedCharge, on: boolean) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[c.id] = prev[c.id] || c.dueDate;
      else delete next[c.id];
      return next;
    });

  const allSelected = charges.every((c) => selected[c.id] !== undefined);
  const selectedIds = Object.keys(selected);

  const save = async () => {
    if (selectedIds.some((id) => !selected[id])) {
      setError(pt ? "Informe a data do pagamento de cada cobrança marcada." : "Enter the payment date for each selected charge.");
      return;
    }
    setSaving(true);
    setError(null);
    let done = 0;
    try {
      for (const id of selectedIds) {
        await recordInvoicePayment(id, teacherId, selected[id]);
        done += 1;
      }
      toast.success(pt ? `${done} pagamento(s) registrado(s).` : `${done} payment(s) recorded.`);
      onChanged();
      onClose();
    } catch (err: any) {
      onChanged();
      setError(
        `${err?.message || (pt ? "Falha ao registrar pagamento." : "Failed to record payment.")} ` +
          (pt ? `${done} de ${selectedIds.length} foram registrados; as demais seguem pendentes.` : `${done} of ${selectedIds.length} were recorded; the rest stay unpaid.`),
      );
      // Drop the ones already recorded so a retry does not touch them again.
      setCharges((prev) => (prev || []).filter((c) => !selectedIds.slice(0, done).includes(c.id)));
      setSelected((prev) => {
        const next = { ...prev };
        selectedIds.slice(0, done).forEach((id) => delete next[id]);
        return next;
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle>{pt ? "Pagamentos anteriores" : "Earlier payments"}</DialogTitle>
          <DialogDescription>
            {pt
              ? "Este contrato já possui cobranças referentes a períodos anteriores ou ao mês atual. Quais já foram pagas?"
              : "This contract already has charges for earlier periods or the current month. Which were already paid?"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
            if (allSelected) setSelected({});
            else setSelected(Object.fromEntries(charges.map((c) => [c.id, selected[c.id] || c.dueDate])));
          }}>
            {allSelected ? (pt ? "Desmarcar todas" : "Clear all") : (pt ? "Marcar todas" : "Select all")}
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border divide-y divide-border/60">
          {charges.map((c) => {
            const on = selected[c.id] !== undefined;
            return (
              <div key={c.id} className="p-3 text-xs space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <Checkbox checked={on} onCheckedChange={(v) => toggle(c, v === true)} />
                  <span className="font-bold text-foreground flex-1">{chargeLabel(c, lang)}</span>
                  <span className="text-muted-foreground">{formatChargeDate(c.dueDate, lang)}</span>
                  <span className="font-semibold">{formatCentsToBRL(c.amountCents)}</span>
                </label>
                {on && (
                  <div className="flex items-center gap-2 pl-7">
                    <span className="text-muted-foreground">{pt ? "Pago em" : "Paid on"}</span>
                    <Input type="date" value={selected[c.id]} onChange={(e) => setSelected((p) => ({ ...p, [c.id]: e.target.value }))} className="h-8 w-40 text-xs" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={onClose}>{pt ? "Pular por enquanto" : "Skip for now"}</Button>
          <Button disabled={saving || selectedIds.length === 0} onClick={save}>
            {saving ? (pt ? "Salvando..." : "Saving...") : (pt ? `Registrar ${selectedIds.length} pagamento(s)` : `Record ${selectedIds.length} payment(s)`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

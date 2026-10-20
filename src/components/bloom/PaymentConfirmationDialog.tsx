import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  recordInvoicePayment,
  updateInvoicePaymentDate,
  type RealInvoice,
} from "@/lib/finance-engine";
import { localDateString } from "@/lib/billing-domain";
import { formatOnboardingPaymentMethod } from "@/lib/i18n";
import { getFriendlyErrorMessage } from "@/lib/error-handler";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

/** Canonical payment methods already used by packages and expenses — no parallel model. */
const PAYMENT_METHODS = ["Pix", "Bank Transfer", "Cash"] as const;

/** Derives the editable date (YYYY-MM-DD) from a stored paid_at timestamp; falls back to today. */
export function paymentDateFromPaidAt(paidAt?: string | null): string {
  if (paidAt && /^\d{4}-\d{2}-\d{2}/.test(paidAt)) return paidAt.slice(0, 10);
  return localDateString();
}

export interface PaymentDialogLabels {
  titlePay: string;
  titleEdit: string;
  description: string;
  paymentDate: string;
  paymentMethod: string;
  confirmPay: string;
  confirmEdit: string;
  cancel: string;
  saving: string;
  dueLabel: string;
  successPay: string;
  successEdit: string;
  errorFallback: string;
}

/**
 * Compact confirmation shown before marking a charge as paid (mode "pay") or when
 * correcting an already-paid charge (mode "edit"). Persists through the canonical
 * recordInvoicePayment/updateInvoicePaymentDate flow so payments.received_at and
 * invoices.paid_at both receive the selected date — never a silent "today".
 */
export function PaymentConfirmationDialog({
  invoice,
  mode,
  teacherId,
  lang,
  labels,
  onClose,
  onConfirmed,
}: {
  invoice: RealInvoice | null;
  mode: "pay" | "edit";
  teacherId: string;
  lang: string;
  labels: PaymentDialogLabels;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [date, setDate] = useState(localDateString());
  const [method, setMethod] = useState<string>("Pix");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (invoice) {
      setDate(mode === "edit" ? paymentDateFromPaidAt(invoice.paidAt) : localDateString());
      setMethod(invoice.paymentMethod || "Pix");
    }
  }, [invoice, mode]);

  if (!invoice) return null;

  const chargeContext = invoice.currentInstallmentLabel || invoice.progressLabel || null;

  const confirm = async () => {
    if (!date || saving) return;
    setSaving(true);
    try {
      if (mode === "edit" && method === (invoice.paymentMethod || "Pix")) {
        await updateInvoicePaymentDate(invoice.id, teacherId, date);
      } else {
        // Updates the existing payment row (received_at + method) — never creates a duplicate.
        await recordInvoicePayment(invoice.id, teacherId, date, method);
      }
      toast.success(mode === "edit" ? labels.successEdit : labels.successPay);
      onConfirmed();
      onClose();
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, labels.errorFallback));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? labels.titleEdit : labels.titlePay}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs space-y-1">
          <p className="font-bold text-foreground text-sm">{invoice.targetName}</p>
          <p className="text-muted-foreground flex items-center gap-1.5 flex-wrap">
            {chargeContext && (
              <>
                <span className="font-semibold text-foreground">{chargeContext}</span>
                <span>•</span>
              </>
            )}
            <span>
              {labels.dueLabel} <strong className="text-foreground">{invoice.dueDate}</strong>
            </span>
            <span>•</span>
            <strong className="text-foreground">{invoice.amountFormatted}</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="payment-date" className="text-xs font-semibold">
              {labels.paymentDate}
            </Label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-10 rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold">{labels.paymentMethod}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-lg border border-border bg-popover text-popover-foreground">
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m} className="text-xs font-semibold cursor-pointer">
                    {formatOnboardingPaymentMethod(m, lang === "pt" ? "pt" : "en")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={saving} onClick={onClose}>
            {labels.cancel}
          </Button>
          <Button disabled={saving || !date} onClick={confirm}>
            {saving ? labels.saving : mode === "edit" ? labels.confirmEdit : labels.confirmPay}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

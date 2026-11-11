import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, Loader2, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useStudentsQuery } from "@/hooks/use-students-query";
import { useTeacherIdentity } from "@/components/layout/TeacherAvatar";
import { listStudentContracts } from "@/lib/student-contracts";
import {
  buildReceiptModel,
  emptyReceipt,
  RECEIPT_LIMITS,
  RECEIPT_PAYMENT_METHODS,
  receiptFileName,
  validateReceipt,
  type ReceiptData,
  type ReceiptField,
} from "@/lib/receipt";
import { renderReceiptPdf } from "@/lib/receipt-pdf";
import { ReceiptDocument } from "@/components/resources/ReceiptDocument";
import { cn } from "@/lib/utils";

const MANUAL = "__manual__";

/**
 * Who pays according to the student's current contract. The document is only used together with
 * the person it belongs to: the student (signer_type "student") or a named guardian/company signer.
 * A guardian/company without a name yields nothing, so the student's name is never paired with
 * someone else's CPF/CNPJ. Issuer fields are never touched here.
 */
export function contractPayer(
  contract: { signer_type: string; signer_name: string | null; signer_document: string | null },
  studentName: string,
): { payerName: string; payerDocument: string } | null {
  const document = contract.signer_document?.trim() ?? "";
  if (contract.signer_type === "student") return document ? { payerName: studentName, payerDocument: document } : null;
  const name = contract.signer_name?.trim() ?? "";
  return name ? { payerName: name, payerDocument: document } : null;
}

/**
 * Receipt generator: form + live A4 preview + PDF download. It only reads data to prefill the form
 * (teacher identity, the teacher's students and the selected student's current contract signer) and
 * never writes anything: no payment is marked as received and no charge or transaction is created.
 */
export function ReceiptGenerator({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const identity = useTeacherIdentity();
  const R = (k: string) => t(`receipts.${k}`);
  const { students, error: studentsError } = useStudentsQuery(user?.id, lang);

  const [data, setData] = useState<ReceiptData>(() => emptyReceipt(lang, { name: identity.name ?? "", email: identity.email }));
  const [studentId, setStudentId] = useState(MANUAL);
  const [contractError, setContractError] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [mobileView, setMobileView] = useState<"form" | "preview">("form");
  const selection = useRef(0);

  // Fresh, prefilled form each time the generator opens (nothing is persisted).
  useEffect(() => {
    if (!open) return;
    setData(emptyReceipt(lang, { name: identity.name ?? "", email: identity.email }));
    setStudentId(MANUAL);
    setContractError(false);
    setShowErrors(false);
    setMobileView("form");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = <K extends ReceiptField>(key: K, value: ReceiptData[K]) => setData((d) => ({ ...d, [key]: value }));
  const errors = validateReceipt(data);
  const model = useMemo(() => buildReceiptModel(data, lang, t), [data, lang, t]);

  const selectStudent = async (id: string) => {
    setStudentId(id);
    setContractError(false);
    const attempt = ++selection.current;
    if (id === MANUAL) return;
    const student = students.find((s) => s.id === id);
    if (!student) return;
    setData((d) => ({ ...d, payerName: student.name, payerDocument: "" }));
    try {
      // The current contract's signer (guardian/company) is who pays; keep everything editable.
      const contracts = await listStudentContracts(id);
      if (attempt !== selection.current) return;
      const current = contracts.find((c) => c.status === "active") ?? null;
      const payer = current ? contractPayer(current, student.name) : null;
      if (payer) {
        // Only fill fields still holding what this selection set: never overwrite the teacher's edits.
        setData((d) => (d.payerName === student.name && d.payerDocument === "" ? { ...d, ...payer } : d));
      }
    } catch {
      if (attempt === selection.current) setContractError(true);
    }
  };

  const download = async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      setMobileView("form");
      toast.error(R("fixErrors"));
      return;
    }
    setGenerating(true);
    try {
      const pdf = await renderReceiptPdf(model);
      pdf.save(receiptFileName(data, lang));
      toast.success(R("downloaded"));
    } catch (error) {
      console.error("[ReceiptGenerator] PDF failed:", error);
      toast.error(R("pdfError"));
    } finally {
      setGenerating(false);
    }
  };

  const errorText = (key: ReceiptField) => (showErrors && errors[key] ? R(errors[key]!) : null);
  const field = (key: ReceiptField, label: string, control: ReactNode, hint?: ReactNode) => (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={`receipt-${key}`} className="text-xs font-semibold text-foreground">{label}</Label>
      {control}
      {errorText(key) ? <p id={`receipt-${key}-error`} className="text-[11px] text-destructive">{errorText(key)}</p> : hint}
    </div>
  );
  const text = (key: ReceiptField, max: number, props: React.ComponentProps<typeof Input> = {}) => (
    <Input
      id={`receipt-${key}`}
      value={data[key] as string}
      maxLength={max}
      onChange={(e) => set(key, e.target.value as never)}
      aria-invalid={Boolean(errorText(key))}
      aria-describedby={errorText(key) ? `receipt-${key}-error` : undefined}
      className={cn("h-9 rounded-xl text-sm", errorText(key) && "border-destructive")}
      {...props}
    />
  );
  const section = (title: string, children: ReactNode) => (
    <section className="space-y-3">
      <h3 className="border-b border-border/60 pb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );

  const form = (
    <div className="space-y-5">
      {section(R("sectionPayer"), <>
        <div className="min-w-0 space-y-1 sm:col-span-2">
          <Label htmlFor="receipt-student" className="text-xs font-semibold text-foreground">{R("student")}</Label>
          <Select value={studentId} onValueChange={(v) => void selectStudent(v)}>
            <SelectTrigger id="receipt-student" className="h-9 rounded-xl text-sm"><SelectValue placeholder={R("studentPlaceholder")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={MANUAL}>{R("manual")}</SelectItem>
              {students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {studentsError && <p role="alert" className="text-[11px] text-destructive">{R("studentsError")}</p>}
          {contractError && <p role="status" className="text-[11px] text-muted-foreground">{R("contractError")}</p>}
        </div>
        {field("payerName", R("payerName"), text("payerName", RECEIPT_LIMITS.name))}
        {field("payerDocument", R("payerDocument"), text("payerDocument", RECEIPT_LIMITS.document))}
      </>)}

      {section(R("sectionPayment"), <>
        {field("number", R("number"), text("number", RECEIPT_LIMITS.number))}
        {field("amount", R("amount"), text("amount", 16, { inputMode: "decimal", placeholder: R("amountPlaceholder") }))}
        <div className="sm:col-span-2">
          {field("description", R("description"), (
            <Textarea
              id="receipt-description"
              value={data.description}
              maxLength={RECEIPT_LIMITS.description}
              rows={3}
              placeholder={R("descriptionPlaceholder")}
              onChange={(e) => set("description", e.target.value)}
              aria-invalid={Boolean(errorText("description"))}
              className={cn("rounded-xl text-sm", errorText("description") && "border-destructive")}
            />
          ), (
            <p className="text-right text-[11px] text-muted-foreground tabular-nums">
              {R("counter").replace("{count}", String(data.description.length)).replace("{max}", String(RECEIPT_LIMITS.description))}
            </p>
          ))}
        </div>
        {field("period", R("period"), text("period", RECEIPT_LIMITS.period))}
        {field("paymentDate", R("paymentDate"), text("paymentDate", 10, { type: "date" }))}
        {field("paymentMethod", R("paymentMethod"), (
          <Select value={data.paymentMethod} onValueChange={(v) => set("paymentMethod", v as ReceiptData["paymentMethod"])}>
            <SelectTrigger id="receipt-paymentMethod" className="h-9 rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RECEIPT_PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{t(`receiptDoc.methods.${m}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {data.paymentMethod === "other" && field("paymentMethodOther", R("paymentMethodOther"), text("paymentMethodOther", RECEIPT_LIMITS.methodOther))}
      </>)}

      {section(R("sectionIssuer"), <>
        {field("issuerName", R("issuerName"), text("issuerName", RECEIPT_LIMITS.name))}
        {field("issuerDocument", R("issuerDocument"), text("issuerDocument", RECEIPT_LIMITS.document))}
        {field("issuerEmail", R("issuerEmail"), text("issuerEmail", RECEIPT_LIMITS.email, { type: "email" }))}
        {field("issuerPhone", R("issuerPhone"), text("issuerPhone", RECEIPT_LIMITS.phone, { inputMode: "tel" }))}
        {field("issuerCity", R("issuerCity"), text("issuerCity", RECEIPT_LIMITS.city))}
      </>)}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-6xl flex-col gap-0 overflow-hidden p-0 sm:h-[92vh] sm:max-h-[92vh] sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
            <ReceiptText className="h-5 w-5 text-primary" aria-hidden="true" /> {R("title")}
          </DialogTitle>
          <DialogDescription className="text-xs">{R("subtitle")}</DialogDescription>
        </DialogHeader>

        {/* Phones: switch between the form and the preview instead of one very long scroll. */}
        <div className="flex shrink-0 gap-1 border-b border-border bg-muted/40 p-1.5 lg:hidden" role="tablist">
          {(["form", "preview"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => setMobileView(view)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                mobileView === view ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {view === "form" ? R("edit") : R("showPreview")}
            </button>
          ))}
        </div>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className={cn("min-h-0 overflow-y-auto overscroll-contain px-5 py-5", mobileView === "preview" && "hidden lg:block")}>{form}</div>
          <div className={cn("min-h-0 overflow-y-auto overscroll-contain bg-muted/40 px-5 py-5 lg:border-l lg:border-border", mobileView === "form" && "hidden lg:block")}>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{R("preview")}</p>
            <ReceiptDocument model={model} />
          </div>
        </div>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-border px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-muted-foreground">{R("notInvoice")}</p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" className="h-9 rounded-xl text-xs font-semibold" onClick={() => onOpenChange(false)}>{R("close")}</Button>
            <Button className="h-9 gap-1.5 rounded-xl text-xs font-semibold" onClick={() => void download()} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {generating ? R("generating") : R("download")}
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

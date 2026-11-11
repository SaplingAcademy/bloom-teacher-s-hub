import { fmt, formatOnboardingFrequency, formatOnboardingPaymentMethod } from "@/lib/i18n";
import { currentLanguage, reportUserError, toUserMessage } from "@/lib/user-error";
import { t as i18nT } from "@/lib/i18n";
import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import {
  formatCentsToBRL,
  calculateInstallmentSchedule,
  calculateLastDueDate,
  renewStudentPackage,
  findRenewalChargeConflicts,
  getStudentFinancialSummary,
  StudentFinancialSummary,
} from "@/lib/finance-engine";
import { isRenewalEndDateValid, resolveRenewalEndDate, samePackageRenewalTerms } from "@/lib/package-renewal";
import { addDays, suggestFirstDueDate, suggestedRenewalStart, type ChargeConflict } from "@/lib/contract-renewal-schedule";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { BillingDurationType, billingModelFromPackage, buildBillingAgreement } from "@/lib/billing-domain";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  RefreshCw,
  ArrowRight,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  Package as PackageIcon,
  ShieldCheck,
  ChevronLeft,
  FileText,
} from "lucide-react";

interface CatalogPackage {
  id: string;
  name: string;
  price: number; // in cents or BRL units
  frequency: string;
  lessons: number;
  duration: number;
  defaultInstallmentCount?: number;
  billingModel?: "monthly" | "installment_total" | "one_time";
  billingDurationType?: BillingDurationType | null;
  contractMonths?: number | null;
}

interface PackageRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  studentId: string;
  studentName: string;
  currentSummary?: StudentFinancialSummary | null;
  onRenewalCompleted?: () => void;
  /** Optional discreet link shown next to the footer's left button (e.g. Today's "Ver contrato"). */
  secondaryAction?: React.ReactNode;
}

function todayYmdLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatAgreementDate(value?: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function PackageRenewalModal({
  isOpen,
  onClose,
  teacherId,
  studentId,
  studentName,
  currentSummary,
  onRenewalCompleted,
  secondaryAction,
}: PackageRenewalModalProps) {
  const { t, formatStatus, lang } = useLanguage();
  const tr = t;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [catalogPackages, setCatalogPackages] = useState<CatalogPackage[]>([]);
  const [renewalType, setRenewalType] = useState<"same" | "change">("same");

  // Agreement State
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedPackage, setSelectedPackage] = useState<CatalogPackage | null>(null);

  // Commercial Conditions State
  const [startDate, setStartDate] = useState<string>("");
  const [totalAmountCents, setTotalAmountCents] = useState<number>(0);
  const [installmentCount, setInstallmentCount] = useState<number>(0);
  const [dueDay, setDueDay] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("Pix");
  const [renewalNotes, setRenewalNotes] = useState<string>("");
  const [billingDurationType, setBillingDurationType] = useState<BillingDurationType>("continuous");
  const [contractMonths, setContractMonths] = useState<number>(0);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [endDateInput, setEndDateInput] = useState<{ value: string; customized: boolean }>({ value: "", customized: false });
  // Early renewal: a contract in force is never shortened; the new one is scheduled.
  const [scheduleDialog, setScheduleDialog] = useState<"fixed" | "continuous" | null>(null);
  const [scheduleConfirmed, setScheduleConfirmed] = useState(false);
  const [transitionDate, setTransitionDate] = useState("");
  const [transitionAck, setTransitionAck] = useState(false);
  // started_at and first_due_date are independent; the first due date is only suggested.
  const [firstDueInput, setFirstDueInput] = useState<{ value: string; customized: boolean }>({ value: "", customized: false });
  const [conflicts, setConflicts] = useState<ChargeConflict[] | null>(null);
  const [conflictsAck, setConflictsAck] = useState(false);

  // Every entry point (Urgente, Financeiro, student profile) renews from the same
  // canonical active-agreement summary; callers that don't pass one get it loaded here.
  const [loadedSummary, setLoadedSummary] = useState<StudentFinancialSummary | null>(null);
  const summary = currentSummary ?? loadedSummary;

  useEffect(() => {
    if (!isOpen || currentSummary || !teacherId || !studentId) return;
    let cancelled = false;
    setLoadedSummary(null);
    getStudentFinancialSummary(teacherId, studentId)
      .then((result) => { if (!cancelled) setLoadedSummary(result); })
      .catch((err) => console.error("[PackageRenewalModal] Error loading current agreement:", err));
    return () => { cancelled = true; };
  }, [isOpen, currentSummary, teacherId, studentId]);

  const applySamePackageTerms = (packages: CatalogPackage[]) => {
    const terms = samePackageRenewalTerms(summary);
    const pkg = terms ? packages.find((p) => p.id === terms.packageId) : undefined;
    if (!terms || !pkg) {
      // Never substitute a similar package: the teacher must pick one explicitly.
      setSelectedPackageId("");
      setSelectedPackage(null);
      return;
    }
    setSelectedPackageId(pkg.id);
    setSelectedPackage(pkg);
    setTotalAmountCents(terms.amountCents);
    setInstallmentCount(terms.installmentCount);
    setBillingDurationType(terms.billingDurationType);
    setContractMonths(terms.contractMonths);
  };

  // Load teacher packages catalog
  useEffect(() => {
    if (!isOpen || !teacherId) return;

    const loadCatalog = async () => {
      setLoadingPackages(true);
      try {
        const { data, error } = await supabase
          .from("packages")
          .select("*")
          .eq("teacher_id", teacherId)
          .order("name");

        if (!error && data) {
          const formatted = data.map((pkg: any) => ({
            id: pkg.id,
            name: pkg.name,
            price: Math.round((Number(pkg.price) || 0) * 100),
            frequency: pkg.frequency || "Monthly",
            lessons: pkg.lessons || 0,
            duration: pkg.lesson_duration_minutes ?? pkg.duration ?? 0,
            defaultInstallmentCount: pkg.billing_model === "installment_total" ? pkg.default_installment_count ?? undefined : undefined,
            billingModel: pkg.billing_model,
            billingDurationType: pkg.billing_duration_type || null,
            contractMonths: pkg.contract_duration_months ?? (pkg.billing_model == null ? pkg.contract_months : null),
          }));
          setCatalogPackages(formatted);

          // "Mesmo pacote" preselects the contracted package with its own agreed terms.
          setRenewalType("same");
          applySamePackageTerms(formatted);
        }
      } catch (err) {
        console.error("[PackageRenewalModal] Error loading packages:", err);
      } finally {
        setLoadingPackages(false);
      }
    };

    loadCatalog();
  }, [isOpen, teacherId, summary]);

  // Default start: the day after the current contract ends (never a pending due date);
  // without a contract in force, today. Continuous contracts get the date the teacher picks.
  useEffect(() => {
    if (!isOpen) return;

    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const defaultStart = summary?.hasActiveAgreement
      ? suggestedRenewalStart(summary.agreementEndDate ?? null) || ""
      : todayYmd;
    setStartDate(defaultStart);
    setEndDateInput({ value: "", customized: false });
    setFirstDueInput({ value: "", customized: false });
    setScheduleConfirmed(false);
    setScheduleDialog(null);
    setTransitionDate("");
    setTransitionAck(false);
    setConflicts(null);
    setConflictsAck(false);
    setDueDay(null);
  }, [isOpen, summary]);

  const hasContractInForce = Boolean(summary?.hasActiveAgreement);
  const currentEnd = summary?.agreementEndDate ?? null;
  const scheduledStart = currentEnd ? suggestedRenewalStart(currentEnd) : null;
  const suggestedFirstDue = startDate ? suggestFirstDueDate(startDate, dueDay) : null;
  const firstDueDate = firstDueInput.customized && firstDueInput.value ? firstDueInput.value : suggestedFirstDue || "";

  /** Step 1 → 2: with a contract in force, the teacher confirms the scheduling first. */
  const continueFromCurrentContract = () => {
    if (!hasContractInForce || scheduleConfirmed) { setStep(2); return; }
    if (summary?.scheduledRenewalStart) {
      toast.error(fmt(tr("packageRenewal.alreadyScheduled"), formatAgreementDate(summary.scheduledRenewalStart)));
      return;
    }
    setScheduleDialog(currentEnd ? "fixed" : "continuous");
  };

  /** Step 3 → 4: read the open charges of the current contract that could overlap. */
  const loadConflicts = async (): Promise<boolean> => {
    if (!hasContractInForce || !summary?.agreementId) { setConflicts([]); return true; }
    try {
      const found = await findRenewalChargeConflicts(teacherId, summary.agreementId, startDate);
      setConflicts(found);
      setConflictsAck(false);
      return true;
    } catch (err) {
      toast.error(reportUserError(err, i18nT("errors.renewPackage", currentLanguage())));
      return false;
    }
  };

  // When selected package changes
  const handleSelectPackage = (pkgId: string) => {
    setSelectedPackageId(pkgId);
    const found = catalogPackages.find((p) => p.id === pkgId);
    if (found) {
      setSelectedPackage(found);
      setTotalAmountCents(found.price);
      setInstallmentCount(found.defaultInstallmentCount || 0);
      setBillingDurationType(found.billingDurationType || "continuous");
      setContractMonths(found.contractMonths || 0);
    }
  };

  // Derived change classification
  const currentTotalCents = summary?.totalAmountCents || 0;
  const currentPkgName = summary?.packageName || "—";

  let changeClassification: "Renovação" | "Upgrade" | "Downgrade" | "Troca de pacote" = "Renovação";
  let changeBadgeVariant: "default" | "secondary" | "outline" = "outline";

  if (renewalType === "change") {
    if (totalAmountCents > currentTotalCents) {
      changeClassification = "Upgrade";
      changeBadgeVariant = "default";
    } else if (totalAmountCents < currentTotalCents && currentTotalCents > 0) {
      changeClassification = "Downgrade";
      changeBadgeVariant = "secondary";
    } else {
      changeClassification = "Troca de pacote";
      changeBadgeVariant = "outline";
    }
  }

  // Calculate schedule preview
  const selectedBillingModel = selectedPackage ? billingModelFromPackage(selectedPackage) : "monthly";
  const canBuildPreview = Boolean(
    selectedPackage
    && startDate
    && (selectedBillingModel !== "installment_total" || installmentCount > 0)
    && (selectedBillingModel !== "monthly" || billingDurationType !== "fixed" || contractMonths > 0),
  );
  const previewTerms = canBuildPreview && selectedPackage ? buildBillingAgreement(
    { ...selectedPackage, price: totalAmountCents / 100 },
    { firstDueDate: firstDueDate || startDate, installmentCount, billingDurationType, contractMonths },
  ) : null;
  const safeCount = previewTerms?.installmentCount || 1;
  const { baseAmountCents } = calculateInstallmentSchedule(previewTerms?.totalAmountCents || totalAmountCents, safeCount);
  const suggestedEndDate = previewTerms?.lastDueDate || (billingDurationType === "continuous" ? null : startDate);
  const lastDueDateStr = resolveRenewalEndDate(endDateInput, suggestedEndDate) || null;
  const customEndDateInvalid = endDateInput.customized && !isRenewalEndDateValid(startDate, lastDueDateStr);

  // Handle final submission with Idempotency Guard
  const handleConfirmRenewal = async () => {
    if (isSubmitting) return; // Guard against double click
    if (!dueDay || !startDate) {
      toast.error(tr("packageRenewal.errDueDate"));
      return;
    }
    if (selectedBillingModel === "installment_total" && installmentCount < 1) {
      toast.error(tr("packageRenewal.errInstallments"));
      return;
    }
    if (selectedBillingModel === "monthly" && billingDurationType === "fixed" && contractMonths < 1) {
      toast.error(tr("packageRenewal.errMonths"));
      return;
    }
    if (!selectedPackage) {
      toast.error(tr("packageRenewal.errNoPackage"));
      return;
    }
    if (customEndDateInvalid) {
      toast.error(tr("packageRenewal.errEndBeforeStart"));
      return;
    }
    if (!firstDueDate) {
      toast.error(tr("packageRenewal.errFirstDue"));
      return;
    }
    if (conflicts && conflicts.length > 0 && !conflictsAck) {
      toast.error(tr("packageRenewal.errConflictsAck"));
      return;
    }
    setIsSubmitting(true);

    try {
      const res = await renewStudentPackage({
        teacherId,
        studentId,
        newPackageId: selectedPackageId,
        isSamePackage: renewalType === "same",
        startDate,
        totalAmountCents,
        installmentCount: safeCount,
        dueDay,
        paymentMethod,
        renewalNotes,
        billingDurationType,
        contractMonths: billingDurationType === "fixed" ? contractMonths : null,
        endDate: endDateInput.customized ? lastDueDateStr : null,
        firstDueDate,
        acknowledgeChargeConflicts: conflictsAck,
      });

      if (!res.success && res.code === "charge_conflicts") {
        // The server re-checked and found open charges: show them and ask for a decision.
        setConflicts(res.conflicts || []);
        setConflictsAck(false);
        toast.error(tr("packageRenewal.errConflictsAck"));
      } else if (res.success) {
        toast.success(res.message);
        if (onRenewalCompleted) onRenewalCompleted();
        onClose();
        setStep(1);
      } else {
        toast.error(toUserMessage(res.message, i18nT("errors.renewPackage", currentLanguage())));
      }
    } catch (err: any) {
      toast.error(reportUserError(err, i18nT("errors.renewPackage", currentLanguage())));
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentPkgDisplay = summary?.packageName || "—";
  const currentTotalFormatted = formatCentsToBRL(summary?.totalAmountCents || 0);
  const currentInstallmentDisplay = summary?.isInstallment
    ? `${summary.installmentCount}x de ${formatCentsToBRL(summary.installmentAmountCents)}`
    : summary?.billingModel === "one_time"
      ? currentTotalFormatted
      : `${formatCentsToBRL(summary?.installmentAmountCents || summary?.totalAmountCents || 0)} / mês`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl rounded-2xl p-0 overflow-hidden border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="bg-[#163020] text-[#F4EBE1] p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-white/10 text-emerald-400">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#F4EBE1]">
                  {t("finance.renewalTitle").replace("{name}", studentName)}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#F4EBE1]/80 mt-0.5">
                  {t("finance.renewalSubtitle")}
                </DialogDescription>
              </div>
            </div>

            <Badge variant="outline" className="border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
              {fmt(tr("packageRenewal.stepOf"), step)}
            </Badge>
          </div>

          {/* Stepper Progress Bar */}
          <div className="grid grid-cols-4 gap-2 mt-5">
            <div className={`h-1.5 rounded-full transition-all ${step >= 1 ? "bg-emerald-400" : "bg-white/20"}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 2 ? "bg-emerald-400" : "bg-white/20"}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 3 ? "bg-emerald-400" : "bg-white/20"}`} />
            <div className={`h-1.5 rounded-full transition-all ${step >= 4 ? "bg-emerald-400" : "bg-white/20"}`} />
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* STEP 1: Current Agreement Overview */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-muted/40 border border-border/80 space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Contrato Atual em Vigor
                </h4>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-muted-foreground font-medium block">{tr("packageRenewal.lStudent")}</span>
                    <strong className="text-foreground text-sm">{studentName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">{tr("packageRenewal.lCurrentPackage")}</span>
                    <strong className="text-foreground text-sm">{currentPkgDisplay}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">{tr("packageRenewal.lContractAmount")}</span>
                    <span className="font-bold text-foreground">{currentTotalFormatted}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">{tr("packageRenewal.lPaymentMethod")}</span>
                    <span className="font-bold text-foreground">{currentInstallmentDisplay}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">{tr("packageRenewal.lPackageEnd")}</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {summary?.agreementEndDate ? formatAgreementDate(summary.agreementEndDate) : tr("packageRenewal.noEnd")}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">{tr("packageRenewal.lProgress")}</span>
                    <span className="font-bold text-stone-700">
                      {summary?.progressLabel || tr("packageRenewal.inProgress")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-stone-700 dark:text-stone-300 space-y-1">
                <p className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Garantia Bloom de Histórico Imutável
                </p>
                <p>
                  {tr("packageRenewal.renewNoteA")} <strong>{tr("packageRenewal.renewNoteB")}</strong> {tr("packageRenewal.renewNoteC")}
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Choose Same or Change Package */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-bold text-foreground">{tr("packageRenewal.lHowWouldYouLikeToContinue")}</Label>
                <p className="text-xs text-muted-foreground">
                  Escolha se vai manter as mesmas condições ou realizar uma alteração de plano.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRenewalType("same");
                    applySamePackageTerms(catalogPackages);
                  }}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-2 ${
                    renewalType === "same"
                      ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20"
                      : "border-border hover:border-stone-400 bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{tr("packageRenewal.lRenewWithTheSamePackage")}</span>
                    {renewalType === "same" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cria um novo ciclo mantendo o pacote <strong>{currentPkgName}</strong> nas condições comerciais atuais.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRenewalType("change")}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-2 ${
                    renewalType === "change"
                      ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20"
                      : "border-border hover:border-stone-400 bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{tr("packageRenewal.lSwitchPackage")}</span>
                    {renewalType === "change" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Altera o aluno para outro pacote do seu catálogo (Upgrade, Downgrade ou troca lateral).
                  </p>
                </button>
              </div>

              {/* Package Selection list when Trocar de pacote is selected */}
              {renewalType === "change" && (
                <div className="space-y-3 pt-2">
                  <Label className="text-xs font-bold text-foreground">{tr("packageRenewal.lSelectTheNewPackageFromTheCa")}</Label>
                  {loadingPackages ? (
                    <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando pacotes ativos...
                    </div>
                  ) : catalogPackages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">{tr("packageRenewal.lNoOtherPackageInTheCatalog")}</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {catalogPackages.map((pkg) => (
                        <div
                          key={pkg.id}
                          onClick={() => handleSelectPackage(pkg.id)}
                          className={`p-3 rounded-xl border flex items-center justify-between text-xs cursor-pointer transition-all ${
                            selectedPackageId === pkg.id
                              ? "border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20 font-bold"
                              : "border-border hover:bg-muted/40"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <span className="text-foreground font-bold text-sm">{pkg.name}</span>
                            <span className="text-muted-foreground block text-[11px]">
                              {fmt(tr("packageRenewal.pkgLine"), pkg.lessons, formatOnboardingFrequency(pkg.frequency, lang))}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-foreground text-sm">
                              {formatCentsToBRL(pkg.price)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Payment Agreement Terms */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h4 className="font-bold text-sm text-foreground">{tr("packageRenewal.lNewContractTerms")}</h4>
                  <p className="text-xs text-muted-foreground">{tr("packageRenewal.lSetInstallmentsDueDateAndSta")}</p>
                </div>
                <Badge variant={changeBadgeVariant} className="text-xs font-bold px-2.5 py-1">
                  {tr(`packageRenewal.change.${changeClassification}`)}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lRenewalStartDate")}</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                  {hasContractInForce && currentEnd && (
                    <span className="text-[10px] text-muted-foreground">
                      {fmt(tr("packageRenewal.startAfterEndHint"), formatAgreementDate(currentEnd))}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lFirstDueDate")}</Label>
                  <Input
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueInput(e.target.value
                      ? { value: e.target.value, customized: true }
                      : { value: "", customized: false })}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {firstDueInput.customized ? tr("packageRenewal.firstDueCustomHint") : tr("packageRenewal.firstDueHint")}
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lRenewalEndDate")}</Label>
                  <Input
                    type="date"
                    value={lastDueDateStr || ""}
                    min={startDate || undefined}
                    aria-invalid={customEndDateInvalid || undefined}
                    onChange={(e) => setEndDateInput(e.target.value
                      ? { value: e.target.value, customized: true }
                      : { value: "", customized: false })}
                  />
                  <span className={`text-[10px] ${customEndDateInvalid ? "text-destructive" : "text-muted-foreground"}`}>
                    {customEndDateInvalid
                      ? tr("packageRenewal.errEndBeforeStart")
                      : endDateInput.customized ? tr("packageRenewal.endDateCustomHint") : tr("packageRenewal.endDateHint")}
                  </span>
                </div>

                 <div className="space-y-1">
                   <Label className="text-xs font-bold">{selectedBillingModel === "monthly" ? tr("packageRenewal.monthlyAmountBrl") : selectedBillingModel === "one_time" ? tr("packageRenewal.chargeAmountBrl") : tr("packageRenewal.totalAmountBrl")}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(totalAmountCents / 100).toFixed(2)}
                    onChange={(e) => setTotalAmountCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                  />
                </div>

                 {selectedBillingModel === "installment_total" && <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lNumberOfInstallments")}</Label>
                  <Select
                    value={String(installmentCount)}
                    onValueChange={(val) => setInstallmentCount(parseInt(val, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => (
                        <SelectItem key={num} value={String(num)}>
                          {num}x de {formatCentsToBRL(Math.round(totalAmountCents / num))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                 </div>}

                 {selectedBillingModel === "monthly" && <div className="space-y-1">
                   <Label className="text-xs font-bold">{tr("packageRenewal.lBillingDuration")}</Label>
                   <Select value={billingDurationType} onValueChange={(value) => setBillingDurationType(value as BillingDurationType)}>
                     <SelectTrigger><SelectValue /></SelectTrigger>
                     <SelectContent>
                       <SelectItem value="continuous">{tr("packageRenewal.continuous")}</SelectItem>
                       <SelectItem value="fixed">{tr("packageRenewal.fixed")}</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>}

                 {selectedBillingModel === "monthly" && billingDurationType === "fixed" && <div className="space-y-1">
                   <Label className="text-xs font-bold">{tr("packageRenewal.lContractLengthMonths")}</Label>
                   <Input type="number" min={1} max={120} value={contractMonths || ""} onChange={(e) => setContractMonths(Number(e.target.value))} required />
                 </div>}

                <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lMonthlyDueDay")}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={dueDay ?? ""}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      setDueDay(value >= 1 && value <= 31 ? value : null);
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lPaymentMethod")}</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pix">{formatOnboardingPaymentMethod("Pix", lang)}</SelectItem>
                      <SelectItem value="Cartão de Crédito">{formatOnboardingPaymentMethod("Cartão de Crédito", lang)}</SelectItem>
                      <SelectItem value="Boleto">{formatOnboardingPaymentMethod("Boleto", lang)}</SelectItem>
                      <SelectItem value="Transferência Bancária">{formatOnboardingPaymentMethod("Transferência Bancária", lang)}</SelectItem>
                      <SelectItem value="Dinheiro">{formatOnboardingPaymentMethod("Dinheiro", lang)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">{tr("packageRenewal.lRenewalNotes")}</Label>
                  <Input
                    placeholder={tr("packageRenewal.notesPh")}
                    value={renewalNotes}
                    onChange={(e) => setRenewalNotes(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Renewal Summary Review */}
          {step === 4 && (
            <div className="space-y-4">
              <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                Resumo da Renovação Contratual
              </h4>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm text-xs">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lStudent")}</span>
                    <strong className="text-foreground text-sm">{studentName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lChangeType")}</span>
                    <Badge variant={changeBadgeVariant} className="font-bold mt-0.5">
                      {tr(`packageRenewal.change.${changeClassification}`)}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lPreviousPackage")}</span>
                    <span className="font-semibold text-stone-700 dark:text-stone-300">{currentPkgName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lNewPackage")}</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {selectedPackage?.name || currentPkgName}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lStartDate")}</span>
                    <span className="font-bold text-foreground">{formatAgreementDate(startDate)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lFirstDueDate")}</span>
                    <span className="font-bold text-foreground">{formatAgreementDate(firstDueDate)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{selectedBillingModel === "installment_total" ? tr("packageRenewal.lastInstallmentEnd") : tr("packageRenewal.end")}</span>
                    <span className="font-bold text-foreground">{lastDueDateStr ? formatAgreementDate(lastDueDateStr) : tr("packageRenewal.noEnd")}</span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block">{selectedBillingModel === "monthly" ? tr("packageRenewal.monthlyAmount") : selectedBillingModel === "one_time" ? tr("packageRenewal.chargeAmount") : tr("packageRenewal.newTotal")}</span>
                     <span className="font-bold text-base text-foreground">{formatCentsToBRL(selectedBillingModel === "monthly" ? previewTerms?.monthlyAmountCents || totalAmountCents : previewTerms?.expectedTotalCents || totalAmountCents)}{selectedBillingModel === "monthly" ? tr("packageRenewal.perMonthSuffix") : ""}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{tr("packageRenewal.lPaymentMethod")}</span>
                    <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
                       {selectedBillingModel === "monthly" ? fmt(tr("packageRenewal.perMonth"), formatCentsToBRL(previewTerms?.monthlyAmountCents || 0)) : selectedBillingModel === "one_time" ? fmt(tr("packageRenewal.oneTimeOf"), formatCentsToBRL(totalAmountCents)) : fmt(tr("packageRenewal.installmentsOf"), safeCount, formatCentsToBRL(baseAmountCents))} ({formatOnboardingPaymentMethod(paymentMethod, lang)})
                    </span>
                  </div>
                </div>
              </div>
              {hasContractInForce && startDate && (
                <p className="rounded-xl border border-emerald-500/20 bg-emerald-50/50 p-3 text-xs text-emerald-900">
                  {fmt(tr("packageRenewal.scheduledNote"), formatAgreementDate(addDays(startDate, -1)), formatAgreementDate(startDate))}
                </p>
              )}

              {conflicts && conflicts.length > 0 && (
                <div role="alert" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <p className="font-bold">{tr("packageRenewal.conflictsTitle")}</p>
                  <p>{tr("packageRenewal.conflictsBody")}</p>
                  <ul className="list-disc pl-5">
                    {conflicts.map((c) => (
                      <li key={c.id}>{formatAgreementDate(c.dueDate)} · {formatCentsToBRL(c.amountCents)} · {formatStatus(c.status)}</li>
                    ))}
                  </ul>
                  <label className="flex items-start gap-2 font-semibold">
                    <Checkbox checked={conflictsAck} onCheckedChange={(v) => setConflictsAck(v === true)} aria-label={tr("packageRenewal.conflictsAck")} />
                    <span>{tr("packageRenewal.conflictsAck")}</span>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <DialogFooter className="p-4 bg-muted/30 border-t border-border flex items-center justify-between sm:justify-between">
          <div className="flex items-center gap-3">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="gap-1 text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4" /> {tr("packageRenewal.back")}
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs font-semibold"
            >
              {tr("packageRenewal.lCancel")}
            </Button>
          )}
          {secondaryAction}
          </div>

          {step < 4 ? (
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                if (step === 1) {
                  continueFromCurrentContract();
                  return;
                }
                if (step === 2 && !selectedPackage) {
                  toast.error(tr("packageRenewal.errNoPackage"));
                  return;
                }
                if (step === 3 && (!dueDay || !startDate)) {
                  toast.error(tr("packageRenewal.errDueDate"));
                  return;
                }
                if (step === 3 && customEndDateInvalid) {
                  toast.error(tr("packageRenewal.errEndBeforeStart"));
                  return;
                }
                if (step === 3 && !firstDueDate) {
                  toast.error(tr("packageRenewal.errFirstDue"));
                  return;
                }
                if (step === 3 && !(await loadConflicts())) return;
                setStep((s) => (s + 1) as any);
              }}
              className="bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90 text-xs font-bold gap-1 cursor-pointer"
            >
              {tr("packageRenewal.continue")} <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting || Boolean(conflicts && conflicts.length > 0 && !conflictsAck)}
              onClick={handleConfirmRenewal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer shadow-md"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> {tr("packageRenewal.processing")}
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> {tr("packageRenewal.confirm")}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      {/* Contract in force with an end date: schedule the renewal for the day after it ends. */}
      <AlertDialog open={scheduleDialog === "fixed"} onOpenChange={(open) => !open && setScheduleDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("packageRenewal.scheduleTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {fmt(tr("packageRenewal.scheduleBody"), formatAgreementDate(currentEnd), formatAgreementDate(scheduledStart))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("packageRenewal.lCancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (scheduledStart) setStartDate(scheduledStart);
                setScheduleConfirmed(true);
                setScheduleDialog(null);
                setStep(2);
              }}
            >
              {tr("packageRenewal.scheduleConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Continuous contract (no end): the teacher picks the transition date and confirms the end. */}
      <AlertDialog open={scheduleDialog === "continuous"} onOpenChange={(open) => !open && setScheduleDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("packageRenewal.transitionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("packageRenewal.transitionBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="renewal-transition-date" className="text-xs font-bold">{tr("packageRenewal.transitionDate")}</Label>
              <Input id="renewal-transition-date" type="date" min={todayYmdLocal()} value={transitionDate} onChange={(e) => { setTransitionDate(e.target.value); setTransitionAck(false); }} />
              {transitionDate && transitionDate < todayYmdLocal() && (
                <p role="alert" className="text-[11px] text-destructive">{tr("packageRenewal.errTransitionPast")}</p>
              )}
            </div>
            {transitionDate && (
              <label className="flex items-start gap-2 text-xs font-semibold">
                <Checkbox checked={transitionAck} onCheckedChange={(v) => setTransitionAck(v === true)} aria-label={tr("packageRenewal.transitionAck")} />
                <span>{fmt(tr("packageRenewal.transitionAck"), formatAgreementDate(addDays(transitionDate, -1)))}</span>
              </label>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("packageRenewal.lCancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!transitionDate || !transitionAck || transitionDate < todayYmdLocal()}
              onClick={() => {
                setStartDate(transitionDate);
                setScheduleConfirmed(true);
                setScheduleDialog(null);
                setStep(2);
              }}
            >
              {tr("packageRenewal.transitionConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

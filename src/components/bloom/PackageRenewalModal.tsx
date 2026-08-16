import { useState, useEffect } from "react";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import {
  formatCentsToBRL,
  calculateInstallmentSchedule,
  calculateLastDueDate,
  renewStudentPackage,
  StudentFinancialSummary,
} from "@/lib/finance-engine";
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
  Sparkles,
  TrendingUp,
  TrendingDown,
  Calendar,
  CreditCard,
  Package as PackageIcon,
  ShieldCheck,
  ChevronLeft,
} from "lucide-react";

interface CatalogPackage {
  id: string;
  name: string;
  price: number; // in cents or BRL units
  frequency: string;
  lessons: number;
  duration: number;
}

interface PackageRenewalModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  studentId: string;
  studentName: string;
  currentSummary?: StudentFinancialSummary | null;
  onRenewalCompleted?: () => void;
}

export function PackageRenewalModal({
  isOpen,
  onClose,
  teacherId,
  studentId,
  studentName,
  currentSummary,
  onRenewalCompleted,
}: PackageRenewalModalProps) {
  const { t, formatStatus } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [catalogPackages, setCatalogPackages] = useState<CatalogPackage[]>([]);
  const [renewalType, setRenewalType] = useState<"same" | "change">("same");

  // Agreement State
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [selectedPackage, setSelectedPackage] = useState<CatalogPackage | null>(null);

  // Commercial Conditions State
  const [startDate, setStartDate] = useState<string>("");
  const [totalAmountCents, setTotalAmountCents] = useState<number>(240000);
  const [installmentCount, setInstallmentCount] = useState<number>(6);
  const [dueDay, setDueDay] = useState<number>(5);
  const [paymentMethod, setPaymentMethod] = useState<string>("Pix");
  const [renewalNotes, setRenewalNotes] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
            price: Math.round(Number(pkg.price || 0) * 100),
            frequency: pkg.frequency || "Monthly",
            lessons: pkg.lessons || 4,
            duration: pkg.duration || 6,
          }));
          setCatalogPackages(formatted);

          // Preselect current package if available
          if (currentSummary?.packageId) {
            const currentCatalogPkg = formatted.find((p) => p.id === currentSummary.packageId);
            if (currentCatalogPkg) {
              setSelectedPackageId(currentCatalogPkg.id);
              setSelectedPackage(currentCatalogPkg);
              setTotalAmountCents(currentSummary.totalAmountCents || currentCatalogPkg.price);
              setInstallmentCount(currentSummary.installmentCount || 6);
            } else if (formatted.length > 0) {
              setSelectedPackageId(formatted[0].id);
              setSelectedPackage(formatted[0]);
              setTotalAmountCents(formatted[0].price);
            }
          } else if (formatted.length > 0) {
            setSelectedPackageId(formatted[0].id);
            setSelectedPackage(formatted[0]);
            setTotalAmountCents(formatted[0].price);
          }
        }
      } catch (err) {
        console.error("[PackageRenewalModal] Error loading packages:", err);
      } finally {
        setLoadingPackages(false);
      }
    };

    loadCatalog();
  }, [isOpen, teacherId, currentSummary]);

  // Set default start date (day after current package end date or current date)
  useEffect(() => {
    if (!isOpen) return;

    let defaultStart = new Date().toISOString().split("T")[0];
    if (currentSummary?.nextDueDate) {
      defaultStart = currentSummary.nextDueDate;
    }
    setStartDate(defaultStart);
  }, [isOpen, currentSummary]);

  // When selected package changes
  const handleSelectPackage = (pkgId: string) => {
    setSelectedPackageId(pkgId);
    const found = catalogPackages.find((p) => p.id === pkgId);
    if (found) {
      setSelectedPackage(found);
      setTotalAmountCents(found.price);
    }
  };

  // Derived change classification
  const currentTotalCents = currentSummary?.totalAmountCents || 0;
  const currentPkgName = currentSummary?.packageName || "Essencial";

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
  const safeCount = Math.max(1, Math.min(12, installmentCount));
  const { schedule, baseAmountCents } = calculateInstallmentSchedule(totalAmountCents, safeCount);
  const lastDueDateStr = calculateLastDueDate(startDate, safeCount, dueDay);

  // Handle final submission with Idempotency Guard
  const handleConfirmRenewal = async () => {
    if (isSubmitting) return; // Guard against double click
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
      });

      if (res.success) {
        toast.success(res.message);
        if (onRenewalCompleted) onRenewalCompleted();
        onClose();
        setStep(1);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(`Erro ao renovar: ${err?.message || err}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentPkgDisplay = currentSummary?.packageName || "Pacote Ativo";
  const currentTotalFormatted = formatCentsToBRL(currentSummary?.totalAmountCents || 240000);
  const currentInstallmentDisplay = currentSummary?.isInstallment
    ? `${currentSummary.installmentCount}x de ${formatCentsToBRL(currentSummary.installmentAmountCents)}`
    : `${currentTotalFormatted} / mês`;

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
              Etapa {step} de 4
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
                    <span className="text-muted-foreground font-medium block">Aluno</span>
                    <strong className="text-foreground text-sm">{studentName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Pacote Atual</span>
                    <strong className="text-foreground text-sm">{currentPkgDisplay}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Valor do Contrato</span>
                    <span className="font-bold text-foreground">{currentTotalFormatted}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Forma de Pagamento</span>
                    <span className="font-bold text-foreground">{currentInstallmentDisplay}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Término do Pacote</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {currentSummary?.nextDueDate || "30/09/2026"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Progresso</span>
                    <span className="font-bold text-stone-700">
                      {currentSummary?.progressLabel || "Em andamento"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs text-stone-700 dark:text-stone-300 space-y-1">
                <p className="font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> Garantia Bloom de Histórico Imutável
                </p>
                <p>
                  Ao renovar, o contrato anterior será marcado como <strong>concluído</strong> e preservará todos os pagamentos e faturas antigas intactas.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: Choose Same or Change Package */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <Label className="text-sm font-bold text-foreground">Como deseja continuar?</Label>
                <p className="text-xs text-muted-foreground">
                  Escolha se vai manter as mesmas condições ou realizar uma alteração de plano.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRenewalType("same");
                    if (currentSummary?.packageId) {
                      handleSelectPackage(currentSummary.packageId);
                    }
                  }}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer space-y-2 ${
                    renewalType === "same"
                      ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-600/20"
                      : "border-border hover:border-stone-400 bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">Renovar com o mesmo pacote</span>
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
                    <span className="font-bold text-sm text-foreground">Trocar de pacote</span>
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
                  <Label className="text-xs font-bold text-foreground">Selecione o Novo Pacote do Catálogo:</Label>
                  {loadingPackages ? (
                    <div className="py-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando pacotes ativos...
                    </div>
                  ) : catalogPackages.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum outro pacote cadastrado no catálogo.</p>
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
                              {pkg.lessons} aulas • Frequência: {pkg.frequency}
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
                  <h4 className="font-bold text-sm text-foreground">Condições do Novo Contrato</h4>
                  <p className="text-xs text-muted-foreground">Configure parcelamento, vencimento e data de início.</p>
                </div>
                <Badge variant={changeBadgeVariant} className="text-xs font-bold px-2.5 py-1">
                  {changeClassification}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-bold">Data de Início da Renovação</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Padrão: dia após término do contrato anterior.
                  </span>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Valor Total do Pacote (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={(totalAmountCents / 100).toFixed(2)}
                    onChange={(e) => setTotalAmountCents(Math.round(parseFloat(e.target.value || "0") * 100))}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Número de Parcelas do Novo Contrato</Label>
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
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Dia do Vencimento Mensal</Label>
                  <Input
                    type="number"
                    min={1}
                    max={28}
                    value={dueDay}
                    onChange={(e) => setDueDay(parseInt(e.target.value || "5", 10))}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Meio de Pagamento</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pix">Pix</SelectItem>
                      <SelectItem value="Cartão de Crédito">Cartão de Crédito</SelectItem>
                      <SelectItem value="Boleto">Boleto</SelectItem>
                      <SelectItem value="Transferência Bancária">Transferência Bancária</SelectItem>
                      <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold">Observações de Renovação</Label>
                  <Input
                    placeholder="Ex: Condição especial acordada via WhatsApp"
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
                <Sparkles className="w-4 h-4 text-emerald-600" />
                Resumo da Renovação Contratual
              </h4>

              <div className="rounded-xl border border-border bg-card p-5 space-y-3 shadow-sm text-xs">
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-border">
                  <div>
                    <span className="text-muted-foreground block">Aluno</span>
                    <strong className="text-foreground text-sm">{studentName}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Tipo de Alteração</span>
                    <Badge variant={changeBadgeVariant} className="font-bold mt-0.5">
                      {changeClassification}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-muted-foreground block">Pacote Anterior</span>
                    <span className="font-semibold text-stone-700 dark:text-stone-300">{currentPkgName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Novo Pacote</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {selectedPackage?.name || currentPkgName}
                    </span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block">Data de Início</span>
                    <span className="font-bold text-foreground">{startDate}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Última Parcela / Término</span>
                    <span className="font-bold text-foreground">{lastDueDateStr}</span>
                  </div>

                  <div>
                    <span className="text-muted-foreground block">Valor Total do Novo Contrato</span>
                    <span className="font-bold text-base text-foreground">{formatCentsToBRL(totalAmountCents)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Forma de Pagamento</span>
                    <span className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
                      {safeCount}x de {formatCentsToBRL(baseAmountCents)} ({paymentMethod})
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <DialogFooter className="p-4 bg-muted/30 border-t border-border flex items-center justify-between sm:justify-between">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => (s - 1) as any)}
              className="gap-1 text-xs font-bold"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs font-semibold"
            >
              Cancelar
            </Button>
          )}

          {step < 4 ? (
            <Button
              type="button"
              size="sm"
              onClick={() => setStep((s) => (s + 1) as any)}
              className="bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90 text-xs font-bold gap-1 cursor-pointer"
            >
              Continuar <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={isSubmitting}
              onClick={handleConfirmRenewal}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 cursor-pointer shadow-md"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Processando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> Confirmar Renovação
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

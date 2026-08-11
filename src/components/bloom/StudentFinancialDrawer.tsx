import { useState, useEffect } from "react";
import {
  getStudentPaymentHistory,
  getStudentPackageHistory,
  getStudentFinancialTimeline,
  checkPackageExpirationAlerts,
  PaymentHistoryItem,
  PackageAgreementRecord,
  FinancialTimelineEvent,
  PackageRenewalAlert,
  StudentFinancialSummary,
  markInvoiceAsPaid,
  updateInvoiceStatus,
  formatCentsToBRL,
} from "@/lib/finance-engine";
import { toast } from "sonner";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Clock,
  History,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  Calendar,
  CreditCard,
  FileText,
  CheckCircle2,
  Package,
} from "lucide-react";

interface StudentFinancialDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  studentId: string;
  studentName: string;
  financialSummary?: StudentFinancialSummary | null;
  onOpenRenewalModal: () => void;
}

export function StudentFinancialDrawer({
  isOpen,
  onClose,
  teacherId,
  studentId,
  studentName,
  financialSummary,
  onOpenRenewalModal,
}: StudentFinancialDrawerProps) {
  const [activeTab, setActiveTab] = useState<"history" | "agreements" | "timeline">("history");
  const [loading, setLoading] = useState<boolean>(true);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [agreements, setAgreements] = useState<PackageAgreementRecord[]>([]);
  const [timeline, setTimeline] = useState<FinancialTimelineEvent[]>([]);
  const [renewalAlert, setRenewalAlert] = useState<PackageRenewalAlert | null>(null);

  const loadData = async () => {
    if (!teacherId || !studentId) return;
    setLoading(true);
    try {
      const [payHist, pkgHist, timelineEvts, alerts] = await Promise.all([
        getStudentPaymentHistory(teacherId, studentId),
        getStudentPackageHistory(teacherId, studentId),
        getStudentFinancialTimeline(teacherId, studentId),
        checkPackageExpirationAlerts(teacherId, studentId),
      ]);

      setPayments(payHist);
      setAgreements(pkgHist);
      setTimeline(timelineEvts);
      setRenewalAlert(alerts.length > 0 ? alerts[0] : null);
    } catch (err) {
      console.error("[StudentFinancialDrawer] Error loading financial data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, teacherId, studentId]);

  const currentAgreement = agreements.find((a) => a.isCurrent) || agreements[0];
  const pastAgreements = agreements.filter((a) => !a.isCurrent);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto rounded-2xl p-0 border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="bg-[#163020] text-[#F4EBE1] p-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/10 text-emerald-400">
                <Wallet className="w-6 h-6" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-[#F4EBE1]">
                  Histórico Financeiro — {studentName}
                </DialogTitle>
                <DialogDescription className="text-xs text-[#F4EBE1]/80 mt-0.5">
                  Registro contínuo de pagamentos, pacotes contratados e linha do tempo financeira
                </DialogDescription>
              </div>
            </div>

            {renewalAlert && (
              <Button
                size="sm"
                onClick={() => {
                  onClose();
                  onOpenRenewalModal();
                }}
                className="bg-emerald-500 hover:bg-emerald-600 text-stone-950 text-xs font-bold gap-1.5 cursor-pointer shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Renovar pacote
              </Button>
            )}
          </div>

          {/* Renewal Alert Banner if applicable */}
          {renewalAlert && (
            <div className="mt-4 p-3 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-between text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{renewalAlert.alertMessage}</span>
              </div>
              <button
                onClick={() => {
                  onClose();
                  onOpenRenewalModal();
                }}
                className="underline font-bold text-white hover:text-emerald-300 text-[11px] cursor-pointer shrink-0"
              >
                Renovar agora →
              </button>
            </div>
          )}

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-2 mt-5 border-t border-white/10 pt-4">
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "history"
                  ? "bg-[#F4EBE1] text-[#163020]"
                  : "text-[#F4EBE1]/80 hover:bg-white/10"
              }`}
            >
              Histórico de Pagamentos ({payments.length})
            </button>

            <button
              onClick={() => setActiveTab("agreements")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "agreements"
                  ? "bg-[#F4EBE1] text-[#163020]"
                  : "text-[#F4EBE1]/80 hover:bg-white/10"
              }`}
            >
              Histórico de Pacotes ({agreements.length})
            </button>

            <button
              onClick={() => setActiveTab("timeline")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "timeline"
                  ? "bg-[#F4EBE1] text-[#163020]"
                  : "text-[#F4EBE1]/80 hover:bg-white/10"
              }`}
            >
              Linha do Tempo ({timeline.length})
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Carregando histórico financeiro...
            </div>
          ) : (
            <>
              {/* TAB 1: PAYMENT HISTORY PER STUDENT */}
              {activeTab === "history" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                      <History className="w-4 h-4 text-emerald-600" />
                      Histórico de Pagamentos
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      Dados históricos originais e preservados
                    </span>
                  </div>

                  {payments.length === 0 ? (
                    <div className="p-8 text-center border border-dashed rounded-xl text-xs text-muted-foreground">
                      Nenhum pagamento registrado para este aluno ainda.
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border bg-card overflow-hidden divide-y divide-border/60">
                      {payments.map((pay) => (
                        <div
                          key={pay.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-muted/30 transition-colors"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground text-sm">
                                {pay.paymentDate.split("-").reverse().join("/")}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-bold text-stone-700 bg-stone-100 dark:bg-stone-800">
                                {pay.packageName}
                              </Badge>
                              {pay.installmentLabel && (
                                <Badge variant="secondary" className="text-[10px] font-bold">
                                  {pay.installmentLabel}
                                </Badge>
                              )}
                            </div>

                            <p className="text-muted-foreground text-[11px]">
                              Ref: <strong className="text-stone-800 dark:text-stone-200">{pay.invoiceReference}</strong> • Período: {pay.billingPeriod} • Meio: <strong>{pay.paymentMethod}</strong>
                            </p>
                            {pay.notes && (
                              <p className="text-[10px] italic text-stone-500">Nota: {pay.notes}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-3 self-end sm:self-center">
                            <span className="font-extrabold text-sm text-foreground">
                              {pay.amountFormatted}
                            </span>
                            <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]">
                              {pay.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: PACKAGE AGREEMENTS HISTORY */}
              {activeTab === "agreements" && (
                <div className="space-y-6">
                  {/* PACOTE ATUAL */}
                  {currentAgreement && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                        <Package className="w-4 h-4 text-emerald-600" />
                        Pacote Atual
                      </h4>

                      <div className="p-5 rounded-2xl border-2 border-emerald-600/40 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <span className="text-base font-extrabold text-foreground">
                              {currentAgreement.packageName}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              Vigência: {currentAgreement.startedAt.split("-").reverse().join("/")} até {currentAgreement.endedAt ? currentAgreement.endedAt.split("-").reverse().join("/") : "Em andamento"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-300 font-bold text-xs">
                              {currentAgreement.statusLabel}
                            </Badge>
                            <Badge variant="secondary" className="font-bold text-xs">
                              {currentAgreement.changeTypeLabel}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40">
                          <div>
                            <span className="text-muted-foreground block">Valor Total</span>
                            <strong className="text-foreground">{currentAgreement.totalAmountFormatted}</strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Parcelamento</span>
                            <strong className="text-foreground">
                              {currentAgreement.installmentCount}x de {currentAgreement.installmentAmountFormatted}
                            </strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Progresso</span>
                            <strong className="text-emerald-700 dark:text-emerald-400">
                              {currentAgreement.progressLabel}
                            </strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Pagamento</span>
                            <strong className="text-foreground">{currentAgreement.paymentMethod}</strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* PACOTES ANTERIORES */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <History className="w-4 h-4 text-stone-500" />
                      Pacotes Anteriores
                    </h4>

                    {pastAgreements.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-2">
                        Nenhum contrato anterior registrado.
                      </p>
                    ) : (
                      <div className="space-y-3 divide-y divide-border/40">
                        {pastAgreements.map((past) => (
                          <div key={past.id} className="pt-3 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-bold text-foreground text-sm">{past.packageName}</span>
                                <span className="text-muted-foreground text-[11px] block">
                                  {past.startedAt.split("-").reverse().join("/")} – {past.endedAt ? past.endedAt.split("-").reverse().join("/") : "Concluído"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-stone-600 bg-stone-100 dark:bg-stone-800 font-bold text-[10px]">
                                  {past.statusLabel}
                                </Badge>
                                <Badge variant="secondary" className="text-[10px] font-bold">
                                  {past.changeTypeLabel}
                                </Badge>
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-[11px] text-stone-700 dark:text-stone-300">
                              <div>
                                Valor: <strong>{past.totalAmountFormatted}</strong>
                              </div>
                              <div>
                                Condição: <strong>{past.installmentCount}x de {past.installmentAmountFormatted}</strong>
                              </div>
                              <div>
                                Progresso: <strong>{past.progressLabel}</strong>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: FINANCIAL TIMELINE */}
              {activeTab === "timeline" && (
                <div className="space-y-4">
                  <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-emerald-600" />
                    Linha do Tempo Financeira
                  </h4>

                  {timeline.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic text-center py-6">
                      Nenhum evento registrado na linha do tempo.
                    </p>
                  ) : (
                    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                      {timeline.map((evt) => (
                        <div key={evt.id} className="relative group">
                          <div className="absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-emerald-600 bg-background group-hover:bg-emerald-600 transition-colors" />
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-bold text-muted-foreground">
                                {evt.date.split("-").reverse().join("/")}
                              </span>
                              <span className="font-bold text-sm text-foreground">{evt.title}</span>
                              {evt.badgeText && (
                                <Badge variant={evt.badgeVariant || "outline"} className="text-[10px] font-bold">
                                  {evt.badgeText}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{evt.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

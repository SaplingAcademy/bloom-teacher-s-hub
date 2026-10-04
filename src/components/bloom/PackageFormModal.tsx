import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useLanguage } from "@/hooks/use-language";
import { translations, formatOnboardingFrequency, formatOnboardingPaymentMethod } from "@/lib/i18n";
import { OnboardingPackage } from "@/types/onboarding";
import { parseCurrencyToNumber, formatNumberToCurrencyInput } from "@/lib/finance-engine";
import { BillingDurationType, BillingModel, normalizeBillingModel } from "@/lib/billing-domain";

export interface PackageFormData {
  id?: string;
  name: string;
  price: number;
  frequency: "total" | "Monthly" | "One-time" | "Weekly" | string;
  duration: number;
  lessons: number;
  method: string;
  defaultInstallmentCount?: number;
  billingModel?: BillingModel;
  billingDurationType?: BillingDurationType | null;
  contractMonths?: number | null;
}

interface PackageFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (pkg: PackageFormData) => void;
  initialData?: PackageFormData | OnboardingPackage | null;
}

export function PackageFormModal({
  isOpen,
  onClose,
  onSave,
  initialData,
}: PackageFormModalProps) {
  const { lang } = useLanguage();
  const t = (translations[lang === "en" ? "en" : "pt"].finance || {}) as Record<string, string>;
  const isPt = lang === "pt";

  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [frequency, setFrequency] = useState<"total" | "Monthly" | "One-time">("Monthly");
  const [duration, setDuration] = useState<string>("");
  const [lessons, setLessons] = useState<string>("4");
  const [method, setMethod] = useState("Pix");
  const [defaultInstallmentCount, setDefaultInstallmentCount] = useState<string>("");
  const [billingDurationType, setBillingDurationType] = useState<BillingDurationType>("continuous");
  const [contractMonths, setContractMonths] = useState<string>("");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setPrice(formatNumberToCurrencyInput(initialData.price, lang));
      setFrequency((initialData.frequency as any) || "Monthly");
      setDuration(initialData.duration ? String(initialData.duration) : "");
      setLessons(String(initialData.lessons ?? 4));
      setMethod(initialData.method || "Pix");
      setDefaultInstallmentCount(initialData.defaultInstallmentCount ? String(initialData.defaultInstallmentCount) : "");
      setBillingDurationType(initialData.billingDurationType || "continuous");
      setContractMonths(initialData.contractMonths ? String(initialData.contractMonths) : "");
    } else {
      setName("");
      setPrice("");
      setFrequency("Monthly");
      setDuration("");
      setLessons("4");
      setMethod("Pix");
      setDefaultInstallmentCount("");
      setBillingDurationType("continuous");
      setContractMonths("");
    }
  }, [initialData, isOpen, lang]);

  const sanitizeNumeric = (value: string) => value.replace(/[^0-9]/g, "");

  const sanitizeDecimal = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
    const [intPart, ...rest] = normalized.split(".");
    return rest.length ? `${intPart}.${rest.join("").slice(0, 2)}` : intPart;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const numericPrice = parseCurrencyToNumber(price);
    const billingModel = normalizeBillingModel(frequency);
    const lessonDurationMinutes = Number(duration);
    const installments = Number(defaultInstallmentCount);
    const fixedMonths = Number(contractMonths);
    if (!lessonDurationMinutes || lessonDurationMinutes < 1) return;
    if (billingModel === "installment_total" && (!installments || installments < 1)) return;
    if (billingModel === "monthly" && billingDurationType === "fixed" && (!fixedMonths || fixedMonths < 1)) return;

    onSave({
      id: initialData?.id,
      name: name.trim(),
      price: numericPrice,
      frequency,
      duration: lessonDurationMinutes,
      lessons: Number(lessons) || 1,
      method,
      defaultInstallmentCount: billingModel === "installment_total" ? installments : undefined,
      billingModel,
      billingDurationType: billingModel === "monthly" ? billingDurationType : undefined,
      contractMonths: billingModel === "monthly" && billingDurationType === "fixed" ? fixedMonths : undefined,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6 shadow-2xl space-y-4 max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-outfit text-stone-900">
            {initialData ? (isPt ? "Editar Pacote" : "Edit Package") : (isPt ? "Criar Novo Pacote" : "Create New Package")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Package Name */}
          <div className="space-y-1">
            <Label htmlFor="modal-pkg-name" className="text-xs font-bold text-stone-700">
              {t.packageName}
            </Label>
            <Input
              id="modal-pkg-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.pkgPlaceholderName}
              required
              className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-sm focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {frequency === "Monthly" && (
            <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="space-y-1">
                <Label htmlFor="modal-pkg-duration-type" className="text-xs font-bold text-stone-700">
                  {isPt ? "Duração da cobrança" : "Billing duration"}
                </Label>
                <Select value={billingDurationType} onValueChange={(value) => setBillingDurationType(value as BillingDurationType)}>
                  <SelectTrigger id="modal-pkg-duration-type" className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="continuous">{isPt ? "Contínua — até cancelamento" : "Continuous — until cancelled"}</SelectItem>
                    <SelectItem value="fixed">{isPt ? "Período determinado" : "Fixed period"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {billingDurationType === "fixed" && (
                <div className="space-y-1">
                  <Label htmlFor="modal-pkg-contract-months" className="text-xs font-bold text-stone-700">
                    {isPt ? "Duração contratual (meses)" : "Contract duration (months)"}
                  </Label>
                  <Input
                    id="modal-pkg-contract-months"
                    type="number"
                    min={1}
                    max={120}
                    value={contractMonths}
                    onChange={(e) => setContractMonths(sanitizeNumeric(e.target.value))}
                    required
                    className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-sm font-bold"
                  />
                </div>
              )}
            </div>
          )}

          {/* Billing Model & Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="modal-pkg-freq" className="text-xs font-bold text-stone-700">
                {isPt ? "Modelo de Cobrança" : "Billing Model"}
              </Label>
              <Select value={frequency} onValueChange={(val) => setFrequency(val as any)}>
                <SelectTrigger id="modal-pkg-freq" className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs font-bold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monthly">{formatOnboardingFrequency("Monthly", lang)}</SelectItem>
                  <SelectItem value="total">{formatOnboardingFrequency("total", lang)}</SelectItem>
                  <SelectItem value="One-time">{formatOnboardingFrequency("One-time", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="modal-pkg-price" className="text-xs font-bold text-stone-700">
                {frequency === "total"
                  ? (isPt ? "Valor total (R$)" : "Total value ($)")
                  : frequency === "Monthly"
                  ? (isPt ? "Valor mensal (R$)" : "Monthly price ($)")
                  : (isPt ? "Valor (R$)" : "Price ($)")}
              </Label>
              <CurrencyInput
                id="modal-pkg-price"
                value={price}
                onChange={setPrice}
                placeholder="0,00"
                required
                className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-sm font-bold"
              />
            </div>
          </div>

          {/* Lessons & Duration */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="modal-pkg-lessons" className="text-xs font-bold text-stone-700">
                {isPt ? "Nº de aulas" : "No. of lessons"}
              </Label>
                <Input
                  id="modal-pkg-lessons"
                  type="number"
                  min={1}
                  value={lessons}
                  onChange={(e) => setLessons(sanitizeNumeric(e.target.value))}
                  required
                  className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-sm font-bold"
                />
            </div>

            <div className="space-y-1">
              <Label htmlFor="modal-pkg-duration" className="text-xs font-bold text-stone-700">
                {isPt ? "Duração da aula (min)" : "Lesson duration (min)"}
              </Label>
                <Input
                  id="modal-pkg-duration"
                  type="number"
                  min={15}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(sanitizeNumeric(e.target.value))}
                  required
                  className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-sm font-bold"
                />
            </div>
          </div>

          {/* Installment Suggestion for Total Course Value */}
          {frequency === "total" && (
            <div className="space-y-1 pt-1">
              <Label htmlFor="modal-pkg-installments" className="text-xs font-bold text-stone-700">
                {isPt ? "Sugestão de parcelamento padrão" : "Suggested default installments"}
              </Label>
              <div className="flex items-center gap-2">
                  <Input
                    id="modal-pkg-installments"
                    type="number"
                    min={1}
                    max={24}
                    value={defaultInstallmentCount}
                    onChange={(e) => setDefaultInstallmentCount(sanitizeNumeric(e.target.value))}
                    required
                    className="h-11 w-24 rounded-xl border border-stone-300 bg-white text-stone-800 text-sm font-bold text-center"
                  />
                <span className="text-xs text-stone-500 font-medium">
                  {isPt ? "parcelas (definido por aluno)" : "installments (chosen per student)"}
                </span>
              </div>
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-1">
            <Label htmlFor="modal-pkg-method" className="text-xs font-bold text-stone-700">
              {t.paymentMethod}
            </Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="modal-pkg-method" className="h-11 rounded-xl border border-stone-300 bg-white text-stone-800 text-xs font-bold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pix">Pix</SelectItem>
                <SelectItem value="Bank Transfer">{formatOnboardingPaymentMethod("Bank transfer", lang)}</SelectItem>
                <SelectItem value="Credit Card">{formatOnboardingPaymentMethod("Credit card", lang)}</SelectItem>
                <SelectItem value="Cash">{formatOnboardingPaymentMethod("Cash", lang)}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Footer CTAs */}
          <DialogFooter className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 font-bold text-sm transition-colors cursor-pointer"
            >
              {t.btnCancel}
            </button>
            <button
              type="submit"
              className="h-11 px-6 rounded-xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-sm transition-colors cursor-pointer shadow-md"
            >
              {initialData ? (isPt ? "Salvar Alterações" : "Save Changes") : (isPt ? "Criar Pacote" : "Create Package")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

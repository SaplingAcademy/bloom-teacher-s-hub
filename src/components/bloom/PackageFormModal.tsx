import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CurrencyInput } from "@/components/ui/currency-input";
import { useLanguage } from "@/hooks/use-language";
import { translations } from "@/lib/i18n";
import { OnboardingPackage } from "@/types/onboarding";
import { parseCurrencyToNumber, formatNumberToCurrencyInput } from "@/lib/finance-engine";

export interface PackageFormData {
  id?: string;
  name: string;
  price: number;
  frequency: "total" | "Monthly" | "One-time" | "Weekly" | string;
  duration: number;
  lessons: number;
  method: string;
  defaultInstallmentCount?: number;
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
  const [duration, setDuration] = useState<string>("60");
  const [lessons, setLessons] = useState<string>("4");
  const [method, setMethod] = useState("Pix");
  const [defaultInstallmentCount, setDefaultInstallmentCount] = useState<string>("6");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setPrice(formatNumberToCurrencyInput(initialData.price, lang));
      setFrequency((initialData.frequency as any) || "Monthly");
      setDuration(String(initialData.duration ?? 60));
      setLessons(String(initialData.lessons ?? 4));
      setMethod(initialData.method || "Pix");
      setDefaultInstallmentCount(String(initialData.defaultInstallmentCount ?? 6));
    } else {
      setName("");
      setPrice("");
      setFrequency("Monthly");
      setDuration("60");
      setLessons("4");
      setMethod("Pix");
      setDefaultInstallmentCount("6");
    }
  }, [initialData, isOpen, lang]);

  const sanitizeNumeric = (value: string) => value.replace(/[^0-9]/g, "");

  const sanitizeDecimal = (value: string) => {
    const normalized = value.replace(",", ".").replace(/[^0-9.]/g, "");
    const [intPart, ...rest] = normalized.split(".");
    return rest.length ? `${intPart}.${rest.join("").slice(0, 2)}` : intPart;
  };

  const handleNumericBlur = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    fallback: number
  ) => {
    const sanitized = sanitizeNumeric(value);
    setter(sanitized === "" ? String(fallback) : sanitized);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const numericPrice = parseCurrencyToNumber(price);

    onSave({
      id: initialData?.id,
      name: name.trim(),
      price: numericPrice,
      frequency,
      duration: Number(duration) || 60,
      lessons: Number(lessons) || 1,
      method,
      defaultInstallmentCount: frequency === "total" ? Number(defaultInstallmentCount) || 1 : 1,
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
                  <SelectItem value="Monthly">{isPt ? "Mensalidade" : "Monthly fee"}</SelectItem>
                  <SelectItem value="total">{isPt ? "Valor total do curso" : "Total course value"}</SelectItem>
                  <SelectItem value="One-time">{isPt ? "Aula avulsa" : "One-time"}</SelectItem>
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
                  onBlur={() => handleNumericBlur(lessons, setLessons, 4)}
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
                  onBlur={() => handleNumericBlur(duration, setDuration, 60)}
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
                    onBlur={() => handleNumericBlur(defaultInstallmentCount, setDefaultInstallmentCount, 6)}
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
                <SelectItem value="Bank Transfer">{isPt ? "Transferência Bancária" : "Bank Transfer"}</SelectItem>
                <SelectItem value="Credit Card">{isPt ? "Cartão de Crédito" : "Credit Card"}</SelectItem>
                <SelectItem value="Cash">{isPt ? "Dinheiro" : "Cash"}</SelectItem>
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

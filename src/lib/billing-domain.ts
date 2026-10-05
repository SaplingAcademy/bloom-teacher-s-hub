export type BillingModel = "monthly" | "installment_total" | "one_time";
export type BillingDurationType = "fixed" | "continuous";
export type ChargeKind = "monthly_charge" | "installment" | "one_time";

export interface BillingPackageInput {
  price?: number | string | null;
  billingModel?: string | null;
  frequency?: string | null;
  billingDurationType?: string | null;
  contractMonths?: number | null;
  defaultInstallmentCount?: number | null;
}

export interface BillingAgreementTerms {
  billingModel: BillingModel;
  billingDurationType: BillingDurationType | null;
  contractMonths: number | null;
  monthlyAmountCents: number | null;
  expectedTotalCents: number;
  totalAmountCents: number | null;
  installmentCount: number | null;
  installmentAmountCents: number | null;
  firstDueDate: string;
  lastDueDate: string | null;
}

export function isValidBillingDate(value?: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day || month > 12) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function normalizeDueDay(value?: number | null): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const day = Math.round(value);
  return day >= 1 && day <= 31 ? day : null;
}

export function billingDateForMonth(year: number, monthIndex: number, dueDay: number): string {
  const normalizedDay = normalizeDueDay(dueDay);
  if (!normalizedDay) throw new Error("Dia de vencimento obrigatório e inválido.");
  const monthStart = new Date(Date.UTC(year, monthIndex, 1));
  const targetYear = monthStart.getUTCFullYear();
  const targetMonth = monthStart.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const actualDay = Math.min(normalizedDay, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
}

export function recurringBillingDate(firstDueDate: string, monthOffset: number, dueDay?: number | null): string {
  if (!isValidBillingDate(firstDueDate)) throw new Error("Primeiro vencimento obrigatório e inválido.");
  const [year, month, firstDay] = firstDueDate.split("-").map(Number);
  const canonicalDay = normalizeDueDay(dueDay) ?? firstDay;
  return billingDateForMonth(year, month - 1 + monthOffset, canonicalDay);
}

export function nextAgreementDueDate(input: {
  firstDueDate: string;
  dueDay: number;
  billingModel: BillingModel;
  installmentCount?: number | null;
  contractMonths?: number | null;
  lastDueDate?: string | null;
  afterDate: string;
}): string | null {
  if (!isValidBillingDate(input.firstDueDate) || !isValidBillingDate(input.afterDate)) return null;
  const dueDay = normalizeDueDay(input.dueDay);
  if (!dueDay) return null;
  const maxCharges = input.billingModel === "one_time"
    ? 1
    : input.billingModel === "installment_total"
      ? Math.max(1, input.installmentCount || 1)
      : input.contractMonths && input.contractMonths > 0
        ? input.contractMonths
        : 2400;
  for (let index = 0; index < maxCharges; index += 1) {
    const candidate = recurringBillingDate(input.firstDueDate, index, dueDay);
    if (input.lastDueDate && candidate > input.lastDueDate) return null;
    if (candidate >= input.afterDate) return candidate;
  }
  return null;
}

export function normalizeBillingModel(value?: string | null): BillingModel {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "total" || normalized === "installment_total" || normalized.includes("valor_total")) {
    return "installment_total";
  }
  if (normalized === "one_time" || normalized === "onetime" || normalized.includes("avulsa")) {
    return "one_time";
  }
  return "monthly";
}

export function billingModelFromPackage(pkg: BillingPackageInput): BillingModel {
  return normalizeBillingModel(pkg.billingModel || pkg.frequency);
}

export function billingModelFromAgreement(agreement: Record<string, unknown>): BillingModel {
  return normalizeBillingModel(
    String(agreement.billing_model || agreement.snapshot_frequency || agreement.frequency || "monthly"),
  );
}

export function normalizeDurationType(value?: string | null): BillingDurationType {
  return String(value || "").toLowerCase() === "fixed" ? "fixed" : "continuous";
}

export function reaisToCents(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(String(value || 0).replace(",", "."));
  return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : 0) * 100));
}

export function addBillingMonths(firstDueDate: string, monthOffset: number): string {
  return recurringBillingDate(firstDueDate, monthOffset);
}

export function calculateExactInstallments(totalCents: number, count: number): number[] {
  const safeCount = Math.max(1, Math.min(24, Math.round(count || 1)));
  const safeTotal = Math.max(0, Math.round(totalCents || 0));
  const base = Math.floor(safeTotal / safeCount);
  return Array.from({ length: safeCount }, (_, index) =>
    index === safeCount - 1 ? base + (safeTotal - base * safeCount) : base,
  );
}

export function buildBillingAgreement(
  pkg: BillingPackageInput,
  options: {
    firstDueDate: string;
    installmentCount?: number | null;
    billingDurationType?: BillingDurationType | null;
    contractMonths?: number | null;
  },
): BillingAgreementTerms {
  const billingModel = billingModelFromPackage(pkg);
  const priceCents = reaisToCents(pkg.price);
  const firstDueDate = options.firstDueDate;
  if (!isValidBillingDate(firstDueDate)) throw new Error("Primeiro vencimento obrigatório e inválido.");

  if (billingModel === "monthly") {
    const billingDurationType = normalizeDurationType(options.billingDurationType || pkg.billingDurationType);
    const requestedContractMonths = options.contractMonths ?? pkg.contractMonths;
    if (billingDurationType === "fixed" && (!requestedContractMonths || requestedContractMonths < 1)) {
      throw new Error("Informe a duração do contrato em meses.");
    }
    const contractMonths = billingDurationType === "fixed" ? Math.round(requestedContractMonths as number) : null;
    return {
      billingModel,
      billingDurationType,
      contractMonths,
      monthlyAmountCents: priceCents,
      expectedTotalCents: contractMonths ? priceCents * contractMonths : 0,
      totalAmountCents: null,
      installmentCount: null,
      installmentAmountCents: null,
      firstDueDate,
      lastDueDate: contractMonths ? addBillingMonths(firstDueDate, contractMonths - 1) : null,
    };
  }

  if (billingModel === "one_time") {
    return {
      billingModel,
      billingDurationType: null,
      contractMonths: null,
      monthlyAmountCents: null,
      expectedTotalCents: priceCents,
      totalAmountCents: priceCents,
      installmentCount: null,
      installmentAmountCents: null,
      firstDueDate,
      lastDueDate: firstDueDate,
    };
  }

  const requestedInstallmentCount = options.installmentCount ?? pkg.defaultInstallmentCount;
  if (!requestedInstallmentCount || requestedInstallmentCount < 1) {
    throw new Error("Informe o número de parcelas.");
  }
  const installmentCount = Math.max(1, Math.min(24, Math.round(requestedInstallmentCount)));
  const schedule = calculateExactInstallments(priceCents, installmentCount);
  return {
    billingModel,
    billingDurationType: null,
    contractMonths: null,
    monthlyAmountCents: null,
    expectedTotalCents: priceCents,
    totalAmountCents: priceCents,
    installmentCount,
    installmentAmountCents: schedule[0] || priceCents,
    firstDueDate,
    lastDueDate: addBillingMonths(firstDueDate, installmentCount - 1),
  };
}

export function getChargeKind(model: BillingModel): ChargeKind {
  if (model === "installment_total") return "installment";
  if (model === "one_time") return "one_time";
  return "monthly_charge";
}

/** Values accepted by invoices.charge_kind. */
export type InvoiceChargeKind = "monthly" | "installment" | "one_time";

export interface AgreementChargeDraft {
  chargeKind: InvoiceChargeKind;
  sequenceNumber: number;
  sequenceCount: number | null;
  dueDate: string;
  amountCents: number;
}

export interface AgreementChargeSource {
  id?: string | null;
  billing_model?: string | null;
  billing_duration_type?: string | null;
  contract_duration_months?: number | null;
  monthly_amount_cents?: number | null;
  total_amount_cents?: number | null;
  installment_count?: number | null;
  first_due_date?: string | null;
  due_day?: number | null;
}

/** Maps stored charge_kind values (including the earlier "monthly_charge" spelling) to the canonical set. */
export function normalizeInvoiceChargeKind(value?: string | null): InvoiceChargeKind | null {
  if (value === "monthly" || value === "monthly_charge") return "monthly";
  if (value === "installment") return "installment";
  if (value === "one_time") return "one_time";
  return null;
}

/** Idempotency key for a receivable generated from a contract. */
export function agreementChargeKey(studentPackageId: string, kind: InvoiceChargeKind, sequenceNumber: number): string {
  return `${studentPackageId}|${kind}|${sequenceNumber}`;
}

/**
 * Receivables that must exist as soon as a canonical contract is created.
 * Legacy contracts (billing_model NULL) return [] — they are never reinterpreted.
 * Monthly continuous contracts only get their first charge here.
 */
export function buildAgreementChargeDrafts(sp: AgreementChargeSource): AgreementChargeDraft[] {
  if (!sp.billing_model) return [];
  const model = normalizeBillingModel(sp.billing_model);
  const firstDueDate = sp.first_due_date;
  const dueDay = normalizeDueDay(sp.due_day);
  if (!isValidBillingDate(firstDueDate) || !dueDay) {
    throw new Error("Contrato sem vencimento válido: não foi possível gerar as cobranças.");
  }

  if (model === "monthly") {
    const amount = sp.monthly_amount_cents;
    if (!amount || amount < 1) throw new Error("Contrato mensal sem valor mensal definido.");
    if (normalizeDurationType(sp.billing_duration_type) === "fixed") {
      const months = sp.contract_duration_months;
      if (!months || months < 1) throw new Error("Contrato mensal fixo sem duração em meses.");
      const count = Math.round(months);
      return Array.from({ length: count }, (_, index) => ({
        chargeKind: "monthly" as const,
        sequenceNumber: index + 1,
        sequenceCount: count,
        dueDate: recurringBillingDate(firstDueDate, index, dueDay),
        amountCents: amount,
      }));
    }
    return [{ chargeKind: "monthly", sequenceNumber: 1, sequenceCount: null, dueDate: firstDueDate, amountCents: amount }];
  }

  if (model === "one_time") {
    const amount = sp.total_amount_cents;
    if (!amount || amount < 1) throw new Error("Contrato de pagamento único sem valor definido.");
    return [{ chargeKind: "one_time", sequenceNumber: 1, sequenceCount: 1, dueDate: firstDueDate, amountCents: amount }];
  }

  const count = sp.installment_count ? Math.round(sp.installment_count) : 0;
  if (count < 1 || count > 24) throw new Error("Contrato parcelado com número de parcelas inválido.");
  const total = sp.total_amount_cents;
  if (!total || total < 1) throw new Error("Contrato parcelado sem valor total definido.");
  const schedule = calculateExactInstallments(total, count);
  return schedule.map((amountCents, index) => ({
    chargeKind: "installment" as const,
    sequenceNumber: index + 1,
    sequenceCount: count,
    dueDate: recurringBillingDate(firstDueDate, index, dueDay),
    amountCents,
  }));
}

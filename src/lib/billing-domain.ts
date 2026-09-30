export type BillingModel = "monthly" | "installment_total" | "one_time";
export type BillingDurationType = "fixed" | "continuous";
export type ChargeKind = "monthly_charge" | "installment" | "one_time";

export interface BillingPackageInput {
  price: number | string | null | undefined;
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

export function normalizeDurationType(value?: string | null): BillingDurationType {
  return String(value || "").toLowerCase() === "fixed" ? "fixed" : "continuous";
}

export function reaisToCents(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number(String(value || 0).replace(",", "."));
  return Math.max(0, Math.round((Number.isFinite(parsed) ? parsed : 0) * 100));
}

export function addBillingMonths(firstDueDate: string, monthOffset: number): string {
  const [year, month, day] = firstDueDate.split("-").map(Number);
  const safeDate = new Date(year || 1970, (month || 1) - 1 + monthOffset, 1);
  const daysInMonth = new Date(safeDate.getFullYear(), safeDate.getMonth() + 1, 0).getDate();
  const actualDay = Math.min(Math.max(day || 1, 1), daysInMonth);
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, "0")}-${String(actualDay).padStart(2, "0")}`;
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

  if (billingModel === "monthly") {
    const billingDurationType = normalizeDurationType(options.billingDurationType || pkg.billingDurationType);
    const contractMonths = billingDurationType === "fixed"
      ? Math.max(1, Math.round(options.contractMonths || pkg.contractMonths || 1))
      : null;
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

  const installmentCount = Math.max(1, Math.min(24, Math.round(
    options.installmentCount || pkg.defaultInstallmentCount || 1,
  )));
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

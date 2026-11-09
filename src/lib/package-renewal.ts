import type { BillingDurationType } from "@/lib/billing-domain";

/** Commercial terms of the active agreement, as read by `getStudentFinancialSummary`. */
export interface RenewalAgreementSource {
  hasActiveAgreement: boolean;
  packageId?: string;
  isInstallment: boolean;
  totalAmountCents: number;
  installmentAmountCents: number;
  installmentCount: number;
  billingModel?: "monthly" | "installment_total" | "one_time";
  billingDurationType?: BillingDurationType | null;
  contractMonths?: number | null;
}

export interface SamePackageRenewalTerms {
  packageId: string;
  /** Amount in the unit the renewal form edits: monthly fee for monthly plans, total otherwise. */
  amountCents: number;
  installmentCount: number;
  billingDurationType: BillingDurationType;
  contractMonths: number;
}

/**
 * "Mesmo pacote" keeps the contracted package and its own agreed value — never a
 * catalog price or a look-alike package. Returns null when there is no identifiable
 * active agreement, so callers must ask the teacher instead of guessing.
 */
export function samePackageRenewalTerms(source: RenewalAgreementSource | null | undefined): SamePackageRenewalTerms | null {
  if (!source?.hasActiveAgreement || !source.packageId) return null;
  const model = source.billingModel ?? (source.isInstallment ? "installment_total" : "monthly");
  const amountCents = model === "monthly"
    ? source.installmentAmountCents || source.totalAmountCents
    : source.totalAmountCents;
  return {
    packageId: source.packageId,
    amountCents: Math.max(0, amountCents || 0),
    installmentCount: model === "installment_total" ? Math.max(1, source.installmentCount || 1) : 0,
    billingDurationType: source.billingDurationType === "fixed" ? "fixed" : "continuous",
    contractMonths: source.billingDurationType === "fixed" ? Math.max(0, source.contractMonths || 0) : 0,
  };
}

/**
 * The package duration only suggests the end date. Once the teacher edits it, the
 * suggestion never overwrites their value; clearing the field resumes the suggestion.
 */
export function resolveRenewalEndDate(current: { value: string; customized: boolean }, suggested: string | null): string {
  return current.customized && current.value ? current.value : suggested || "";
}

/** End date is optional (continuous plans), but when present it must follow the start. */
export function isRenewalEndDateValid(startDate: string, endDate: string | null | undefined): boolean {
  if (!endDate) return true;
  return Boolean(startDate) && endDate > startDate;
}

/**
 * Continuous monthly plans have no end, so renewal alerts skip them — unless the
 * teacher explicitly set an end date. Only canonical agreements (explicit
 * billing_model) qualify; their continuous terms never derive last_due_date, so a
 * value there is teacher-entered. Legacy rows keep their previous behavior.
 */
export function teacherSetContinuousEndDate(sp: {
  billing_model?: string | null;
  billing_duration_type?: string | null;
  last_due_date?: string | null;
}): string | null {
  if (sp.billing_model !== "monthly" || sp.billing_duration_type === "fixed") return null;
  return sp.last_due_date ? String(sp.last_due_date).slice(0, 10) : null;
}

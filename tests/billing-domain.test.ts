import { describe, expect, it } from "bun:test";
import {
  billingDateForMonth,
  buildBillingAgreement,
  calculateExactInstallments,
  nextAgreementDueDate,
  normalizeBillingModel,
  recurringBillingDate,
} from "../src/lib/billing-domain";

describe("billing domain", () => {
  it("normalizes legacy billing labels", () => {
    expect(normalizeBillingModel("Monthly")).toBe("monthly");
    expect(normalizeBillingModel("total")).toBe("installment_total");
    expect(normalizeBillingModel("One-time")).toBe("one_time");
  });

  it("keeps a fixed monthly fee intact across the contract period", () => {
    const terms = buildBillingAgreement({ price: 250, billingModel: "monthly" }, {
      firstDueDate: "2026-10-06", billingDurationType: "fixed", contractMonths: 6,
    });
    expect(terms.monthlyAmountCents).toBe(25000);
    expect(terms.expectedTotalCents).toBe(150000);
    expect(terms.installmentCount).toBeNull();
    expect(terms.lastDueDate).toBe("2027-03-06");
  });

  it("leaves continuous monthly agreements open-ended", () => {
    const terms = buildBillingAgreement({ price: 250 }, {
      firstDueDate: "2026-10-06", billingDurationType: "continuous",
    });
    expect(terms.monthlyAmountCents).toBe(25000);
    expect(terms.expectedTotalCents).toBe(0);
    expect(terms.lastDueDate).toBeNull();
  });

  it("splits only total-value contracts and preserves cents", () => {
    const schedule = calculateExactInstallments(100000, 3);
    expect(schedule).toEqual([33333, 33333, 33334]);
    expect(schedule.reduce((sum, amount) => sum + amount, 0)).toBe(100000);
  });

  it("creates one-time agreements without installment semantics", () => {
    const terms = buildBillingAgreement({ price: 1500, billingModel: "one_time" }, { firstDueDate: "2026-10-06" });
    expect(terms.totalAmountCents).toBe(150000);
    expect(terms.installmentCount).toBeNull();
    expect(terms.lastDueDate).toBe("2026-10-06");
  });

  it("preserves day 10 for recurring monthly charges", () => {
    expect(recurringBillingDate("2026-10-10", 1, 10)).toBe("2026-11-10");
  });

  it("uses day 31 whenever possible and clamps only shorter months", () => {
    expect(recurringBillingDate("2026-01-31", 1, 31)).toBe("2026-02-28");
    expect(recurringBillingDate("2027-01-31", 1, 31)).toBe("2027-02-28");
    expect(recurringBillingDate("2028-01-31", 1, 31)).toBe("2028-02-29");
    expect(recurringBillingDate("2026-03-31", 1, 31)).toBe("2026-04-30");
    expect(recurringBillingDate("2026-04-30", 1, 31)).toBe("2026-05-31");
    expect(billingDateForMonth(2026, 9, 31)).toBe("2026-10-31");
  });

  it("isolates the next due date to the active agreement schedule", () => {
    expect(nextAgreementDueDate({
      firstDueDate: "2026-10-10",
      dueDay: 10,
      billingModel: "monthly",
      afterDate: "2026-11-01",
    })).toBe("2026-11-10");
  });

  it("preserves monthly, installment and one-time schedule limits", () => {
    expect(nextAgreementDueDate({ firstDueDate: "2026-10-31", dueDay: 31, billingModel: "one_time", afterDate: "2026-11-01" })).toBeNull();
    expect(nextAgreementDueDate({ firstDueDate: "2026-10-31", dueDay: 31, billingModel: "installment_total", installmentCount: 2, afterDate: "2026-11-01" })).toBe("2026-11-30");
    expect(nextAgreementDueDate({ firstDueDate: "2026-10-31", dueDay: 31, billingModel: "monthly", contractMonths: 2, afterDate: "2026-12-01" })).toBeNull();
  });
});

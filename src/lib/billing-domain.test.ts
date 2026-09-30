import { describe, expect, it } from "vitest";
import { buildBillingAgreement, calculateExactInstallments, normalizeBillingModel } from "./billing-domain";

describe("billing domain", () => {
  it("normalizes legacy billing labels", () => {
    expect(normalizeBillingModel("Monthly")).toBe("monthly");
    expect(normalizeBillingModel("total")).toBe("installment_total");
    expect(normalizeBillingModel("One-time")).toBe("one_time");
  });

  it("keeps a fixed monthly fee intact across the contract period", () => {
    expect(buildBillingAgreement(
      { price: 250, billingModel: "monthly" },
      { firstDueDate: "2026-10-06", billingDurationType: "fixed", contractMonths: 6 },
    )).toEqual({
      billingModel: "monthly",
      billingDurationType: "fixed",
      contractMonths: 6,
      monthlyAmountCents: 25000,
      expectedTotalCents: 150000,
      totalAmountCents: null,
      installmentCount: null,
      installmentAmountCents: null,
      firstDueDate: "2026-10-06",
      lastDueDate: "2027-03-06",
    });
  });

  it("leaves continuous monthly agreements open-ended", () => {
    const terms = buildBillingAgreement(
      { price: 250, billingModel: "monthly" },
      { firstDueDate: "2026-10-06", billingDurationType: "continuous" },
    );
    expect(terms.monthlyAmountCents).toBe(25000);
    expect(terms.expectedTotalCents).toBe(0);
    expect(terms.lastDueDate).toBeNull();
    expect(terms.installmentCount).toBeNull();
  });

  it("splits only total-value contracts and preserves cents", () => {
    const schedule = calculateExactInstallments(100000, 3);
    expect(schedule).toEqual([33333, 33333, 33334]);
    expect(schedule.reduce((sum, amount) => sum + amount, 0)).toBe(100000);
  });

  it("creates one-time agreements without installment semantics", () => {
    const terms = buildBillingAgreement(
      { price: 1500, billingModel: "one_time" },
      { firstDueDate: "2026-10-06" },
    );
    expect(terms.totalAmountCents).toBe(150000);
    expect(terms.installmentCount).toBeNull();
    expect(terms.lastDueDate).toBe("2026-10-06");
  });
});

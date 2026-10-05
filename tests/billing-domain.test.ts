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

import { buildAgreementChargeDrafts, agreementChargeKey } from "../src/lib/billing-domain";

describe("buildAgreementChargeDrafts", () => {
  const base = { id: "sp1", first_due_date: "2026-01-31", due_day: 31 };
  it("monthly fixed generates every month with sequence", () => {
    const d = buildAgreementChargeDrafts({ ...base, billing_model: "monthly", billing_duration_type: "fixed", contract_duration_months: 3, monthly_amount_cents: 50000 });
    expect(d.map((x) => x.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(d.every((x) => x.chargeKind === "monthly" && x.sequenceCount === 3 && x.amountCents === 50000)).toBe(true);
  });
  it("monthly continuous generates only the first charge", () => {
    const d = buildAgreementChargeDrafts({ ...base, first_due_date: "2026-11-03", due_day: 3, billing_model: "monthly", billing_duration_type: "continuous", monthly_amount_cents: 50000 });
    expect(d).toEqual([{ chargeKind: "monthly", sequenceNumber: 1, sequenceCount: null, dueDate: "2026-11-03", amountCents: 50000 }]);
  });
  it("installment_total supports up to 24 installments", () => {
    const d = buildAgreementChargeDrafts({ ...base, billing_model: "installment_total", installment_count: 18, total_amount_cents: 100000 });
    expect(d).toHaveLength(18);
    expect(d.reduce((s, x) => s + x.amountCents, 0)).toBe(100000);
    expect(d[17].sequenceCount).toBe(18);
  });
  it("one_time generates a single charge", () => {
    const d = buildAgreementChargeDrafts({ ...base, billing_model: "one_time", total_amount_cents: 9000 });
    expect(d).toEqual([{ chargeKind: "one_time", sequenceNumber: 1, sequenceCount: 1, dueDate: "2026-01-31", amountCents: 9000 }]);
  });
  it("legacy contracts are not reinterpreted", () => {
    expect(buildAgreementChargeDrafts({ ...base, billing_model: null })).toEqual([]);
  });
  it("idempotency key is stable", () => {
    expect(agreementChargeKey("sp1", "monthly", 2)).toBe("sp1|monthly|2");
  });
});

import { isInvoiceVisibleInLedger } from "../src/lib/billing-domain";

describe("isInvoiceVisibleInLedger", () => {
  const now = new Date(2026, 0, 15); // January 2026, local timezone
  it("shows a pending charge due this month", () => {
    expect(isInvoiceVisibleInLedger({ dueDate: "2026-01-10", status: "pending" }, now)).toBe(true);
  });
  it("keeps an unpaid charge from a previous month visible", () => {
    expect(isInvoiceVisibleInLedger({ dueDate: "2025-12-10", status: "overdue" }, now)).toBe(true);
  });
  it("hides a charge due in a future month", () => {
    expect(isInvoiceVisibleInLedger({ dueDate: "2026-02-10", status: "pending" }, now)).toBe(false);
    expect(isInvoiceVisibleInLedger({ dueDate: "2027-01-01", status: "pending" }, now)).toBe(false);
  });
  it("hides paid charges from the main list", () => {
    expect(isInvoiceVisibleInLedger({ dueDate: "2025-12-10", status: "paid" }, now)).toBe(false);
    expect(isInvoiceVisibleInLedger({ dueDate: "2026-01-10", status: "paid" }, now)).toBe(false);
  });
  it("never hides a charge with an unreadable due date", () => {
    expect(isInvoiceVisibleInLedger({ dueDate: "", status: "pending" }, now)).toBe(true);
  });
});

import {
  isPriorOrCurrentMonthOpenCharge,
  localDateString,
  paymentDateFromTimestamp,
  paymentDateToTimestamp,
  statusAfterDueDateChange,
  unpaidStatusForDueDate,
} from "../src/lib/billing-domain";

describe("charge management", () => {
  it("keeps the chosen payment day in any timezone", () => {
    const ts = paymentDateToTimestamp("2026-06-30");
    expect(ts).toBe("2026-06-30T12:00:00.000Z");
    expect(paymentDateFromTimestamp(ts)).toBe("2026-06-30");
    // noon UTC is still the same calendar day from UTC-11 to UTC+11
    const d = new Date(ts);
    expect(new Date(d.getTime() - 11 * 3600e3).toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(new Date(d.getTime() + 11 * 3600e3).toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(() => paymentDateToTimestamp("2026-02-30")).toThrow();
  });

  it("recomputes unpaid status from the due date when undoing a payment", () => {
    expect(unpaidStatusForDueDate("2026-09-10", "2026-10-05")).toBe("overdue");
    expect(unpaidStatusForDueDate("2026-10-05", "2026-10-05")).toBe("pending");
    expect(unpaidStatusForDueDate("2026-11-03", "2026-10-05")).toBe("pending");
  });

  it("editing a due date keeps paid as paid and moves overdue to pending when in the future", () => {
    expect(statusAfterDueDateChange("paid", "2026-01-01", "2026-10-05")).toBe("paid");
    expect(statusAfterDueDateChange("overdue", "2026-12-01", "2026-10-05")).toBe("pending");
    expect(statusAfterDueDateChange("pending", "2026-09-01", "2026-10-05")).toBe("overdue");
    expect(statusAfterDueDateChange("cancelled", "2026-12-01", "2026-10-05")).toBe("cancelled");
  });

  it("asks only about unpaid charges due this month or earlier", () => {
    const now = new Date(2026, 9, 5);
    expect(isPriorOrCurrentMonthOpenCharge({ dueDate: "2026-06-06", status: "overdue" }, now)).toBe(true);
    expect(isPriorOrCurrentMonthOpenCharge({ dueDate: "2026-10-28", status: "pending" }, now)).toBe(true);
    expect(isPriorOrCurrentMonthOpenCharge({ dueDate: "2026-11-06", status: "pending" }, now)).toBe(false);
    expect(isPriorOrCurrentMonthOpenCharge({ dueDate: "2026-06-06", status: "paid" }, now)).toBe(false);
  });

  it("uses the local calendar date for today", () => {
    expect(localDateString(new Date(2026, 0, 31, 23, 59))).toBe("2026-01-31");
  });
});

import { buildAgreementChargeDrafts as drafts6 } from "../src/lib/billing-domain";

describe("contract already running (6 months, 4th month)", () => {
  it("offers 1/6..4/6 in the popup and keeps all 6 for management", () => {
    const all = drafts6({
      id: "sp1", billing_model: "monthly", billing_duration_type: "fixed", contract_duration_months: 6,
      monthly_amount_cents: 50000, first_due_date: "2026-07-05", due_day: 5,
    });
    expect(all.map((d) => `${d.sequenceNumber}/${d.sequenceCount}`)).toEqual(["1/6", "2/6", "3/6", "4/6", "5/6", "6/6"]);
    const now = new Date(2026, 9, 5);
    const eligible = all.filter((d) => isPriorOrCurrentMonthOpenCharge({ dueDate: d.dueDate, status: "pending" }, now));
    expect(eligible.map((d) => d.sequenceNumber)).toEqual([1, 2, 3, 4]);
  });
});

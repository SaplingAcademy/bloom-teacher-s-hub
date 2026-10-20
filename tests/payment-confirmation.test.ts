import { describe, it, expect } from "vitest";
import { paymentDateFromPaidAt } from "@/components/bloom/PaymentConfirmationDialog";
import { localDateString } from "@/lib/billing-domain";

describe("paymentDateFromPaidAt", () => {
  it("extracts the date part from a timestamptz value", () => {
    expect(paymentDateFromPaidAt("2026-08-15T12:34:56+00:00")).toBe("2026-08-15");
  });

  it("keeps a date-only value unchanged", () => {
    expect(paymentDateFromPaidAt("2026-08-15")).toBe("2026-08-15");
  });

  it("falls back to today when there is no payment date", () => {
    expect(paymentDateFromPaidAt(null)).toBe(localDateString());
    expect(paymentDateFromPaidAt(undefined)).toBe(localDateString());
    expect(paymentDateFromPaidAt("")).toBe(localDateString());
  });

  it("falls back to today for malformed values", () => {
    expect(paymentDateFromPaidAt("15/08/2026")).toBe(localDateString());
  });
});

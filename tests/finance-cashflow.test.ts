import { describe, it, expect } from "vitest";
import { buildMonthlyCashFlow, filterReceivables } from "@/lib/finance-cashflow";
import { isInvoiceVisibleInLedger } from "@/lib/billing-domain";

const now = new Date(2026, 9, 20);
describe("monthly cash flow", () => {
  it("attributes income to payments.received_at, not later corrections", () => {
    const rows = buildMonthlyCashFlow(
      [{ status: "paid", receivedAt: "2026-08-15T12:00:00.000Z", paidAt: "2026-10-02T12:00:00.000Z", amountCents: 30000 }],
      [], 6, now);
    expect(rows.find((r) => r.month === "2026-08")?.incomeCents).toBe(30000);
    expect(rows.find((r) => r.month === "2026-10")?.incomeCents).toBe(0);
  });
  it("ignores unpaid invoices and attributes expenses by date", () => {
    const rows = buildMonthlyCashFlow(
      [{ status: "pending", receivedAt: null, paidAt: null, amountCents: 5000 }],
      [{ date: "2026-09-03", amount: 12.5 }], 12, now);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + r.incomeCents, 0)).toBe(0);
    expect(rows.find((r) => r.month === "2026-09")?.expenseCents).toBe(1250);
  });
  it("filters receivables by student, status and due month", () => {
    const list = [
      { targetName: "Ana", status: "overdue" as const, dueDate: "2026-09-10" },
      { targetName: "Bruno", status: "paid" as const, dueDate: "2026-10-10" },
    ];
    expect(filterReceivables(list, { search: "an", status: "all", month: null })).toHaveLength(1);
    expect(filterReceivables(list, { search: "", status: "overdue", month: null })[0].targetName).toBe("Ana");
    expect(filterReceivables(list, { search: "", status: "all", month: "2026-10" })[0].targetName).toBe("Bruno");
  });
  it("full year includes January through December of 2026, but no other year or undated charge", () => {
    const list = [
      { targetName: "Previous", status: "pending" as const, dueDate: "2025-12-31" },
      { targetName: "January", status: "paid" as const, dueDate: "2026-01-01" },
      { targetName: "October", status: "overdue" as const, dueDate: "2026-10-20" },
      { targetName: "December", status: "pending" as const, dueDate: "2026-12-31" },
      { targetName: "Next", status: "pending" as const, dueDate: "2027-01-01" },
      { targetName: "Undated", status: "pending" as const, dueDate: "" },
    ];
    expect(filterReceivables(list, { search: "", status: "all", month: null, year: "2026" }).map((inv) => inv.targetName))
      .toEqual(["January", "October", "December"]);
  });
  it("retains student search and status filters with a full-year selection", () => {
    const list = [
      { targetName: "Ana", status: "overdue" as const, dueDate: "2026-01-10" },
      { targetName: "Ana", status: "paid" as const, dueDate: "2026-10-10" },
      { targetName: "Ana", status: "overdue" as const, dueDate: "2025-10-10" },
      { targetName: "Bruno", status: "overdue" as const, dueDate: "2026-10-10" },
    ];
    expect(filterReceivables(list, { search: "ana", status: "overdue", month: null, year: "2026" }))
      .toEqual([list[0]]);
  });
  it("keeps the existing current/open view separate from an explicitly selected month", () => {
    const list = [
      { targetName: "Past open", status: "overdue" as const, dueDate: "2026-09-10" },
      { targetName: "Current paid", status: "paid" as const, dueDate: "2026-10-10" },
      { targetName: "Current open", status: "pending" as const, dueDate: "2026-10-20" },
      { targetName: "Future", status: "pending" as const, dueDate: "2026-11-10" },
    ];
    expect(filterReceivables(list.filter((inv) => isInvoiceVisibleInLedger(inv, now)), { search: "", status: "all", month: null }).map((inv) => inv.targetName))
      .toEqual(["Past open", "Current open"]);
    expect(filterReceivables(list, { search: "", status: "all", month: "2026-10" }).map((inv) => inv.targetName))
      .toEqual(["Current paid", "Current open"]);
  });
});

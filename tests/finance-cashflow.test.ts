import { describe, it, expect } from "vitest";
import { buildMonthlyCashFlow, filterReceivables } from "@/lib/finance-cashflow";

const now = new Date(2026, 9, 20);
describe("monthly cash flow", () => {
  it("attributes income to payments.received_at, not later corrections", () => {
    const rows = buildMonthlyCashFlow(
      [{ status: "paid", receivedAt: "2026-08-15T12:00:00.000Z", paidAt: "2026-10-02T12:00:00.000Z", amountCents: 30000 }],
      [], 6, now);
    expect(rows.find((r) => r.month === "2026-08")!.incomeCents).toBe(30000);
    expect(rows.find((r) => r.month === "2026-10")!.incomeCents).toBe(0);
  });
  it("ignores unpaid invoices and attributes expenses by date", () => {
    const rows = buildMonthlyCashFlow(
      [{ status: "pending", receivedAt: null, paidAt: null, amountCents: 5000 }],
      [{ date: "2026-09-03", amount: 12.5 }], 12, now);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + r.incomeCents, 0)).toBe(0);
    expect(rows.find((r) => r.month === "2026-09")!.expenseCents).toBe(1250);
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
});

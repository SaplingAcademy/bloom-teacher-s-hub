import type { RealInvoice, Expense } from "@/lib/finance-engine";

/** Local YYYY-MM of a date or timestamp. */
export function monthKeyOf(value?: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Month an invoice's money actually entered: payments.received_at (paid_at only when no payment row). */
export function receivedMonthOf(inv: Pick<RealInvoice, "status" | "receivedAt" | "paidAt">): string | null {
  if (inv.status !== "paid") return null;
  return monthKeyOf(inv.receivedAt ?? inv.paidAt);
}

export function lastMonthKeys(count: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return keys;
}

export type CashFlowMonth = { month: string; incomeCents: number; expenseCents: number };

export function buildMonthlyCashFlow(
  invoices: Pick<RealInvoice, "status" | "receivedAt" | "paidAt" | "amountCents">[],
  expenses: Pick<Expense, "date" | "amount">[],
  months: number,
  now = new Date(),
): CashFlowMonth[] {
  const rows = new Map(lastMonthKeys(months, now).map((m) => [m, { month: m, incomeCents: 0, expenseCents: 0 }]));
  for (const inv of invoices) {
    const row = rows.get(receivedMonthOf(inv) || "");
    if (row) row.incomeCents += inv.amountCents;
  }
  for (const e of expenses) {
    const row = rows.get(monthKeyOf(e.date) || "");
    if (row) row.expenseCents += Math.round(e.amount * 100);
  }
  return [...rows.values()];
}

export type ReceivableStatusFilter = "all" | "pending" | "paid" | "overdue";

export function filterReceivables<T extends Pick<RealInvoice, "targetName" | "status" | "dueDate">>(
  invoices: T[],
  { search, status, month }: { search: string; status: ReceivableStatusFilter; month: string | null },
): T[] {
  const q = search.trim().toLocaleLowerCase();
  return invoices.filter((inv) =>
    (!q || inv.targetName.toLocaleLowerCase().includes(q)) &&
    (status === "all" || inv.status === status) &&
    (!month || (inv.dueDate || "").slice(0, 7) === month),
  );
}

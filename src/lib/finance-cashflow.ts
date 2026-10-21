import type { RealInvoice, Expense } from "@/lib/finance-engine";

export type ReceivedRevenueInvoice = Pick<RealInvoice, "id" | "status" | "amountCents" | "receivedAt" | "paidAt">;

/** Keep Finance's existing payment selection and paid_at fallback inputs identical across reads. */
export function invoiceReceiptFields(invoice: {
  amount_cents: number | null;
  paid_at?: string | null;
  payments?: { received_at?: string | null }[] | null;
}): Pick<RealInvoice, "amountCents" | "receivedAt" | "paidAt"> {
  return {
    amountCents: invoice.amount_cents || 0,
    paidAt: invoice.paid_at,
    receivedAt: invoice.payments?.[0]?.received_at ?? null,
  };
}

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

/** Canonical received revenue: each paid invoice's amount once in its actual received month. */
export function calculateReceivedCentsForMonth(invoices: ReceivedRevenueInvoice[], monthKey: string): number {
  const counted = new Set<string>();
  let total = 0;
  for (const invoice of invoices) {
    if (counted.has(invoice.id) || receivedMonthOf(invoice) !== monthKey) continue;
    counted.add(invoice.id);
    total += invoice.amountCents;
  }
  return total;
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

/**
 * Alphabetical receivable ordering: student name A→Z (locale-aware, case- and accent-friendly),
 * installments of the same student kept together and ordered by due date, oldest to newest.
 */
const receivableNameCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

export function sortReceivables<T extends Pick<RealInvoice, "targetName" | "dueDate">>(invoices: T[]): T[] {
  return [...invoices].sort((a, b) => {
    const byName = receivableNameCollator.compare(a.targetName ?? "", b.targetName ?? "");
    if (byName !== 0) return byName;
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
}

export type ReceivableStatusFilter = "all" | "pending" | "paid" | "overdue";

export function filterReceivables<T extends Pick<RealInvoice, "targetName" | "status" | "dueDate">>(
  invoices: T[],
  { search, status, month, year }: { search: string; status: ReceivableStatusFilter; month: string | null; year?: string | null },
): T[] {
  const q = search.trim().toLocaleLowerCase();
  return invoices.filter((inv) =>
    (!q || inv.targetName.toLocaleLowerCase().includes(q)) &&
    (status === "all" || inv.status === status) &&
    (!month || (inv.dueDate || "").slice(0, 7) === month) &&
    (!year || (inv.dueDate || "").slice(0, 4) === year),
  );
}

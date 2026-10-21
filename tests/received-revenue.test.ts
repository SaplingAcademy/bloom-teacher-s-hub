import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { store, client } = vi.hoisted(() => {
  const store = {
    rows: [] as Record<string, any>[],
    invoiceError: null as unknown,
    reads: [] as { table: string; columns: string; filters: [string, unknown][] }[],
  };
  const client = {
    from: vi.fn((table: string) => {
      const read = { table, columns: "", filters: [] as [string, unknown][] };
      store.reads.push(read);
      const query = {
        select: (columns: string) => { read.columns = columns; return query; },
        eq: (key: string, value: unknown) => { read.filters.push([key, value]); return query; },
        in: () => query,
        neq: () => query,
        gte: () => query,
        order: () => query,
        then: (resolve: (result: unknown) => unknown) => resolve({
          data: table === "invoices" ? store.rows.filter(row => read.filters.every(([key, value]) => row[key] === value)) : [],
          error: table === "invoices" ? store.invoiceError : null,
        }),
      };
      return query;
    }),
  };
  return { store, client };
});
vi.mock("@/lib/supabase", () => ({ supabase: client }));

import { calculateReceivedCentsForMonth, invoiceReceiptFields, receivedMonthOf, type ReceivedRevenueInvoice } from "@/lib/finance-cashflow";
import { fetchTeacherReceivedInvoices, syncTeacherReceivablesDetailed } from "@/lib/finance-engine";
import { fetchDashboardMetrics } from "@/lib/dashboard-metrics";

const invoice = (id: string, extras: Record<string, unknown> = {}) => ({
  id, teacher_id: "teacher", status: "paid", amount_cents: 30000,
  paid_at: "2026-10-10T12:00:00Z", payments: [{ received_at: "2026-10-10T12:00:00Z" }], ...extras,
});
const receipt = (id: string, extras: Partial<ReceivedRevenueInvoice> = {}): ReceivedRevenueInvoice => ({
  id, status: "paid", amountCents: 30000, receivedAt: "2026-10-10T12:00:00Z", paidAt: "2026-10-15T12:00:00Z", ...extras,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 14));
  store.rows = []; store.invoiceError = null; store.reads = [];
  client.from.mockClear();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("canonical monthly received revenue", () => {
  it("counts each invoice once even when an invoice is repeated", () => {
    const paid = receipt("one");
    expect(calculateReceivedCentsForMonth([paid, { ...paid }, receipt("two", { amountCents: 12500 })], "2026-10")).toBe(42500);
  });
  it("excludes cancelled, pending and overdue invoices", () => {
    expect(calculateReceivedCentsForMonth([
      receipt("paid"), receipt("cancelled", { status: "cancelled" }),
      receipt("pending", { status: "pending" }), receipt("overdue", { status: "overdue" }),
    ], "2026-10")).toBe(30000);
  });
  it("uses the actual received month instead of a later paid_at correction", () => {
    const paid = receipt("august", { receivedAt: "2026-08-15T12:00:00Z" });
    expect(calculateReceivedCentsForMonth([paid], "2026-08")).toBe(30000);
    expect(calculateReceivedCentsForMonth([paid], "2026-10")).toBe(0);
  });
  it("preserves Finance's paid_at fallback when there is no received timestamp", () => {
    const rows = [receipt("legacy", { receivedAt: null, paidAt: "2026-09-03" }), receipt("undated", { receivedAt: null, paidAt: null })];
    expect(calculateReceivedCentsForMonth(rows, "2026-09")).toBe(30000);
    expect(calculateReceivedCentsForMonth(rows, "2026-10")).toBe(0);
  });
  it("preserves the first nested payment selection, including its null fallback", () => {
    const fields = invoiceReceiptFields(invoice("old", { payments: [{ received_at: null }, { received_at: "2026-09-01" }] }));
    expect(fields.receivedAt).toBeNull();
    expect(receivedMonthOf({ status: "paid", ...fields })).toBe("2026-10");
  });
  it("keeps receivedMonthOf's local timestamp month at a month boundary", () => {
    const timestamp = new Date(2026, 8, 30, 23, 30).toISOString();
    expect(calculateReceivedCentsForMonth([receipt("boundary", { receivedAt: timestamp })], "2026-09")).toBe(30000);
    expect(calculateReceivedCentsForMonth([receipt("boundary", { receivedAt: timestamp })], "2026-10")).toBe(0);
  });
  it("matches Finance's previously validated aggregation for every month", () => {
    const rows = [receipt("a"), receipt("b", { amountCents: 513820 }), receipt("c", { receivedAt: "2026-09-10", amountCents: 250000 }), receipt("d", { status: "cancelled" })];
    for (const month of ["2026-08", "2026-09", "2026-10", "2026-11"]) {
      const before = rows.filter(row => receivedMonthOf(row) === month).reduce((sum, row) => sum + row.amountCents, 0);
      expect(calculateReceivedCentsForMonth(rows, month)).toBe(before);
    }
    expect(calculateReceivedCentsForMonth(rows, "2026-10")).toBe(543820);
  });
});

describe("Today's read-only canonical invoice source and trend", () => {
  it("maps the same existing paid invoices as Finance without changing its validated total", async () => {
    store.rows = [
      invoice("current", { amount_cents: 543820, due_date: "2026-08-01", payments: [
        { received_at: "2026-10-10", amount_cents: 543820 },
        { received_at: "2026-09-10", amount_cents: 233940 },
      ] }),
      invoice("previous", { amount_cents: 250000, due_date: "2026-09-01", paid_at: "2026-09-10", payments: [] }),
    ];
    const finance = await syncTeacherReceivablesDetailed("teacher");
    const today = await fetchTeacherReceivedInvoices("teacher");
    for (const month of ["2026-09", "2026-10"]) {
      const originalFinanceTotal = finance.invoices.filter(row => receivedMonthOf(row) === month).reduce((sum, row) => sum + row.amountCents, 0);
      expect(calculateReceivedCentsForMonth(finance.invoices, month)).toBe(originalFinanceTotal);
      expect(calculateReceivedCentsForMonth(today, month)).toBe(originalFinanceTotal);
    }
    expect(calculateReceivedCentsForMonth(finance.invoices, "2026-10")).toBe(543820);
    expect(calculateReceivedCentsForMonth(today, "2026-09")).toBe(250000);
  });
  it("reads only teacher-owned paid invoices, without Finance synchronization or standalone payments reads", async () => {
    store.rows = [invoice("ours"), invoice("other", { teacher_id: "other-teacher" }), invoice("pending", { status: "pending" }), invoice("cancelled", { status: "cancelled" })];
    const rows = await fetchTeacherReceivedInvoices("teacher");
    expect(rows.map(row => row.id)).toEqual(["ours"]);
    expect(store.reads).toEqual([{
      table: "invoices", columns: "id, status, amount_cents, paid_at, payments(id, amount_cents, received_at, method)",
      filters: [["teacher_id", "teacher"], ["status", "paid"]],
    }]);
  });
  it("nested duplicate payment rows do not inflate Today and canonical months drive its trend", async () => {
    store.rows = [
      invoice("current", { amount_cents: 543820, payments: [
        { received_at: "2026-10-10T12:00:00Z", amount_cents: 543820 },
        { received_at: "2026-10-10T12:00:00Z", amount_cents: 233940 },
      ] }),
      invoice("previous", { amount_cents: 250000, payments: [{ received_at: "2026-09-10T12:00:00Z", amount_cents: 250000 }] }),
      invoice("unpaid", { status: "pending", amount_cents: 100000 }),
      invoice("cancelled", { status: "cancelled", amount_cents: 100000 }),
    ];
    const metrics = await fetchDashboardMetrics("teacher");
    expect(metrics.monthRevenueCents).toBe(543820);
    expect(metrics.monthRevenueCents).not.toBe(777760);
    expect(metrics.monthRevenueTrend).toEqual({ value: "+118%", positive: true });
    expect(metrics.hasRevenueSource).toBe(true);
    expect(store.reads.map(read => read.table)).toEqual(["calendar_events", "students", "leads", "invoices"]);
  });
  it("calculates the previous month across a year boundary with the paid_at fallback", async () => {
    vi.setSystemTime(new Date(2027, 0, 20, 14));
    store.rows = [invoice("jan", { amount_cents: 60000, payments: [{ received_at: "2027-01-10" }] }), invoice("dec", { amount_cents: 30000, paid_at: "2026-12-10", payments: [] })];
    expect(await fetchDashboardMetrics("teacher")).toMatchObject({ monthRevenueCents: 60000, monthRevenueTrend: { value: "+100%", positive: true } });
  });
  it("keeps the existing no-trend convention for a zero previous month", async () => {
    store.rows = [invoice("current")];
    expect(await fetchDashboardMetrics("teacher")).toMatchObject({ monthRevenueCents: 30000, monthRevenueTrend: null });
  });
  it("keeps the existing no-trend convention for equal monthly revenue", async () => {
    store.rows = [invoice("current"), invoice("previous", { payments: [{ received_at: "2026-09-10" }] })];
    expect((await fetchDashboardMetrics("teacher")).monthRevenueTrend).toBeNull();
  });
  it("shows a negative trend from the same canonical monthly amounts", async () => {
    store.rows = [invoice("current", { amount_cents: 15000 }), invoice("previous", { payments: [{ received_at: "2026-09-10" }] })];
    expect((await fetchDashboardMetrics("teacher")).monthRevenueTrend).toEqual({ value: "-50%", positive: false });
  });
  it("does not represent an invoice read failure as successfully loaded zero revenue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    store.invoiceError = { message: "read failed" };
    expect(await fetchDashboardMetrics("teacher")).toMatchObject({ hasRevenueSource: false, monthRevenueTrend: null });
  });
});
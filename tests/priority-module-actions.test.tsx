// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  calls: [] as string[],
  invoiceRow: {
    id: "inv1", student_id: "s1", amount_cents: 35000, due_date: "2026-11-05", status: "overdue", paid_at: null,
    charge_kind: "installment", sequence_number: 2, sequence_count: 6, student: { full_name: "Diego" }, payments: [],
  },
  leadRow: { id: "L1", teacher_id: "t-1", full_name: "Mario Maria", stage: "new" },
  recordInvoicePayment: vi.fn(),
  advance: vi.fn(),
  navigate: vi.fn(),
  priorities: { items: [] as any[], failed: [] as string[] },
  sheetProps: null as any,
  interactionProps: null as any,
  renewalProps: null as any,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {};
      for (const m of ["select", "eq", "update", "insert", "upsert", "delete"]) chain[m] = (...a: unknown[]) => { mocks.calls.push(`${table}.${m}`); return chain; };
      chain.single = async () => ({ data: table === "invoices" ? mocks.invoiceRow : mocks.leadRow, error: null });
      chain.then = (r: any) => Promise.resolve({ data: [{ id: "p1", name: "Intensivo" }], error: null }).then(r);
      return chain;
    },
  },
}));
vi.mock("@/lib/finance-engine", async (orig) => ({
  ...(await orig<typeof import("../src/lib/finance-engine")>()),
  recordInvoicePayment: mocks.recordInvoicePayment,
}));
vi.mock("@/lib/lead-interactions", async (orig) => ({
  ...(await orig<typeof import("../src/lib/lead-interactions")>()),
  advanceLeadStageAfterInteraction: mocks.advance,
}));
vi.mock("@/components/bloom/LeadDetailSheet", () => ({ LeadDetailSheet: (p: any) => { mocks.sheetProps = p; return null; } }));
vi.mock("@/components/bloom/LeadInteractionDialog", () => ({ LeadInteractionDialog: (p: any) => { mocks.interactionProps = p; return null; } }));
vi.mock("@/components/bloom/PackageRenewalModal", () => ({ PackageRenewalModal: (p: any) => { mocks.renewalProps = p; return null; } }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-daily-priorities-query", () => ({
  useDailyPrioritiesQuery: () => ({ data: mocks.priorities, isLoading: false, isError: false }),
}));

import { loadPriorityInvoice } from "../src/lib/priority-resolution";
import { moduleActionFor } from "../src/components/bloom/PriorityModuleActions";
import { DailyPrioritiesCard } from "../src/components/bloom/DailyPrioritiesCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  mocks.calls.length = 0;
  mocks.sheetProps = mocks.interactionProps = mocks.renewalProps = null;
  vi.clearAllMocks();
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const item = (category: string, ref: Record<string, string>, title = "Aluno") => ({
  id: `${category}:1`, category, urgency: "critical", reason: category === "payment" ? "payment_overdue" : category === "contract" ? "contract_ending_30d" : "lead_task_overdue",
  title, params: { amountCents: 35000, dueDate: "2026-11-05", daysLate: 4, packageName: "Intensivo", daysRemaining: 20 }, date: "2026-11-05", ref, action: { route: "/x" },
});

function renderCard(items: any[]) {
  mocks.priorities = { items, failed: [] };
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  act(() => mounted.render(createElement(QueryClientProvider, { client }, createElement(DailyPrioritiesCard, { teacherId: "t-1" }))));
  return invalidate;
}
const clickRow = (title: string) => act(() => (Array.from(document.querySelectorAll("[role=button]")).find((b) => b.textContent?.includes(title)) as HTMLElement).click());
const refreshedPriorities = (spy: ReturnType<typeof vi.fn>) => spy.mock.calls.some(([arg]: any[]) => JSON.stringify(arg?.queryKey) === JSON.stringify(["daily-priorities", "t-1"]));

describe("module actions from Today priorities", () => {
  it("maps each category to its existing module flow by real references", () => {
    expect(moduleActionFor(item("lead", { leadId: "L1", taskId: "T1" }) as any)).toEqual({ kind: "lead", leadId: "L1" });
    expect(moduleActionFor(item("contract", { studentId: "s1" }, "Ana") as any)).toEqual({ kind: "contract", studentId: "s1", studentName: "Ana" });
    expect(moduleActionFor(item("payment", { invoiceId: "inv1" }) as any)).toEqual({ kind: "payment", invoiceId: "inv1" });
    expect(moduleActionFor(item("payment", {}) as any)).toBeNull();
  });

  it("loads the charge read-only: no writes, no receivable generation", async () => {
    const invoice = await loadPriorityInvoice("t-1", "inv1");
    expect(invoice).toMatchObject({ id: "inv1", targetName: "Diego", dueDate: "2026-11-05", currentInstallmentLabel: "Parcela 2 de 6" });
    expect(invoice.amountFormatted).toMatch(/R\$\s350,00/);
    expect(mocks.calls.every((c) => c.endsWith(".select") || c.endsWith(".eq"))).toBe(true);
    expect(mocks.calls.some((c) => c.startsWith("invoices."))).toBe(true);
  });

  it("payment: confirms through recordInvoicePayment and re-reads priorities; a failure keeps the dialog open", async () => {
    const invalidate = renderCard([item("payment", { invoiceId: "inv1", studentId: "s1" }, "Diego")]);
    clickRow("Diego");
    await flush();
    const confirm = () => Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("today.resolve.payConfirm")) as HTMLElement;
    mocks.recordInvoicePayment.mockRejectedValueOnce(new Error("network"));
    act(() => confirm().click());
    await flush();
    expect(confirm()).toBeTruthy(); // still open, inputs preserved
    expect(refreshedPriorities(invalidate)).toBe(false);
    mocks.recordInvoicePayment.mockResolvedValueOnce(undefined);
    act(() => confirm().click());
    await flush();
    expect(mocks.recordInvoicePayment).toHaveBeenLastCalledWith("inv1", "t-1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), "Pix");
    expect(refreshedPriorities(invalidate)).toBe(true);
  });

  it("contract: opens PackageRenewalModal for the student and re-reads priorities only after a completed renewal", async () => {
    const invalidate = renderCard([item("contract", { studentId: "s1", studentPackageId: "sp1" }, "Ana")]);
    clickRow("Ana");
    await flush();
    expect(mocks.renewalProps).toMatchObject({ isOpen: true, teacherId: "t-1", studentId: "s1", studentName: "Ana" });
    expect(refreshedPriorities(invalidate)).toBe(false);
    act(() => mocks.renewalProps.onRenewalCompleted());
    expect(refreshedPriorities(invalidate)).toBe(true);
  });

  it("lead: tasks and interactions resolve in place; trial/proposal/conversion open the Leads page on that lead", async () => {
    const invalidate = renderCard([item("lead", { leadId: "L1", taskId: "T1" }, "Mario Maria")]);
    clickRow("Mario Maria");
    await flush();
    expect(mocks.sheetProps.lead).toMatchObject({ id: "L1", stage: "Novo contato" });

    act(() => mocks.sheetProps.onTasksChanged());
    expect(refreshedPriorities(invalidate)).toBe(true);

    invalidate.mockClear();
    act(() => mocks.sheetProps.onRegisterInteraction(mocks.sheetProps.lead));
    expect(mocks.interactionProps.open).toBe(true);
    await act(async () => { await mocks.interactionProps.onSaved({ type: "whatsapp" }); });
    expect(mocks.advance).toHaveBeenCalledWith("t-1", "L1");
    expect(refreshedPriorities(invalidate)).toBe(true);

    act(() => mocks.sheetProps.onScheduleTrial(mocks.sheetProps.lead));
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/leads", search: { leadId: "L1" } });
  });
});

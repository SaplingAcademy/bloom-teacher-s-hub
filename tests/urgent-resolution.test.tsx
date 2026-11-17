// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AttentionItem } from "../src/lib/attention-queue";

const m = vi.hoisted(() => ({
  fetch: vi.fn(), navigate: vi.fn(), complete: vi.fn(), retry: vi.fn(), financeInvalidate: vi.fn(),
  success: vi.fn(), error: vi.fn(), panelSaved: null as null | (() => Promise<void>), moduleSaved: null as null | ((k: string) => void),
}));
vi.mock("@/lib/attention-queue", () => ({ fetchAttentionQueue: m.fetch }));
vi.mock("@/lib/inactive-lead-automation", () => ({ runInactiveLeadCheckOnLoad: async () => ({ processedCount: 0 }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => m.navigate }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: m.error } }));
vi.mock("@/lib/lead-tasks", () => ({ completeTeacherTask: m.complete }));
vi.mock("@/lib/automation-engine", () => ({ retryFailedAutomation: m.retry }));
vi.mock("@/hooks/use-finance-query", () => ({ useInvalidateFinanceData: () => m.financeInvalidate }));
vi.mock("@/components/bloom/PriorityResolutionPanel", () => ({
  PriorityResolutionPanel: (p: { item: { ref: Record<string, string> }; onSaved: () => Promise<void> }) => { m.panelSaved = p.onSaved; return createElement("div", { "data-testid": "attendance-panel" }, JSON.stringify(p.item.ref)); },
}));
vi.mock("@/components/bloom/PriorityModuleActions", () => ({
  PriorityModuleActions: (p: { action: unknown; onSaved: (k: string) => void }) => { m.moduleSaved = p.onSaved; return createElement("div", { "data-testid": "module" }, JSON.stringify(p.action)); },
}));
import { UrgentWidget } from "../src/components/bloom/UrgentWidget";
import { urgentResolution } from "../src/lib/urgent-resolution";

const base = { title: "T", reason: "R", recommendedAction: "", urgency: "high" as const, targetUrl: "/x" };
const items: Record<string, AttentionItem> = {
  attendance: { ...base, id: "att", category: "attendance_pending", title: "Presença pendente — Ana", studentId: "s1", eventId: "e1", classId: "c1", dueDate: "2026-11-10" },
  renewal: { ...base, id: "ren", category: "package_renewal", title: "Renovação necessária: Bia", studentId: "s2", studentName: "Bia" },
  leadTask: { ...base, id: "lt", category: "overdue_followup", title: "Follow-up", leadId: "L1", taskId: "t1" },
  task: { ...base, id: "tk", category: "overdue_followup", title: "Ligar para escola", taskId: "t2" },
  hot: { ...base, id: "hot", category: "hot_no_action", title: "Lead ativo", leadId: "L2" },
  automation: { ...base, id: "auto", category: "failed_automation", title: "Falha", automationEventId: "a1" },
  trial: { ...base, id: "trial", category: "trial_soon", title: "Experimental", eventId: "e9", targetUrl: "/calendar?eventId=e9" },
};

describe("which Urgent items resolve here and which navigate (real categories)", () => {
  it("maps every high-urgency category to its existing flow", () => {
    expect(urgentResolution(items.attendance)).toMatchObject({ type: "attendance", item: { reason: "attendance_missing", ref: { eventId: "e1", studentId: "s1", classId: "c1" } } });
    expect(urgentResolution(items.renewal)).toEqual({ type: "module", action: { kind: "contract", studentId: "s2", studentName: "Bia" } });
    expect(urgentResolution(items.leadTask)).toEqual({ type: "module", action: { kind: "lead", leadId: "L1" } });
    expect(urgentResolution(items.hot)).toEqual({ type: "module", action: { kind: "lead", leadId: "L2" } });
    expect(urgentResolution(items.task)).toEqual({ type: "complete_task", taskId: "t2" });
    expect(urgentResolution(items.automation)).toEqual({ type: "retry", automationEventId: "a1" });
    expect(urgentResolution(items.trial)).toEqual({ type: "navigate", url: "/calendar?eventId=e9" });
  });
});

let root: Root;
let client: QueryClient;
let invalidate: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.values(m).forEach((v) => typeof v === "function" && (v as ReturnType<typeof vi.fn>).mockReset?.());
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  invalidate = vi.spyOn(client, "invalidateQueries");
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(list: AttentionItem[]) {
  m.fetch.mockResolvedValue(list);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(UrgentWidget, { teacherId: "t-1" }))));
  await settle();
}
const row = (category: string) => document.querySelector<HTMLElement>(`[data-urgent-item="${category}"]`)!;
const resolveButton = (category: string) => row(category).querySelector<HTMLButtonElement>("button")!;
const refreshedBoth = () => {
  const keys = invalidate.mock.calls.map(([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey));
  return keys.includes(JSON.stringify(["attention-queue", "t-1"])) && keys.includes(JSON.stringify(["daily-priorities", "t-1"]));
};

describe("Urgent block", () => {
  it("clean list: count badge, soft dividers, red only on the severity marker, discreet Resolver", async () => {
    await mount([items.task, items.trial]);
    expect(document.querySelector("[data-testid=urgent-count]")!.textContent).toBe("2");
    const list = document.querySelector("[data-testid=urgent-list]")!;
    expect(list.className).toContain("divide-stone-200/60");
    expect(list.innerHTML).not.toMatch(/border-rose|bg-rose-600/);
    expect(resolveButton("overdue_followup").className).toContain("text-primary");
  });
  it("attendance is recorded inline; after saving, Urgent and Today's priorities are re-read", async () => {
    await mount([items.attendance]);
    await act(async () => resolveButton("attendance_pending").click());
    expect(document.querySelector("[data-testid=attendance-panel]")!.textContent).toContain("e1");
    m.fetch.mockResolvedValue([]); // the source no longer lists it
    await act(async () => { await m.panelSaved!(); });
    await settle();
    expect(refreshedBoth()).toBe(true);
    expect(document.querySelector("[data-testid=urgent-widget]")).toBeNull(); // gone, from the source
  });
  it("renewal opens the existing renewal modal; a completed renewal refreshes finance and both queues", async () => {
    await mount([items.renewal]);
    await act(async () => resolveButton("package_renewal").click());
    expect(document.querySelector("[data-testid=module]")!.textContent).toContain('"kind":"contract"');
    await act(async () => { m.moduleSaved!("contract"); });
    expect(m.financeInvalidate).toHaveBeenCalled();
    expect(refreshedBoth()).toBe(true);
  });
  it("lead items open the existing lead sheet", async () => {
    await mount([items.leadTask]);
    await act(async () => resolveButton("overdue_followup").click());
    expect(document.querySelector("[data-testid=module]")!.textContent).toContain('"leadId":"L1"');
  });
  it("a task without a lead is completed here only after confirmation; the count follows the source", async () => {
    await mount([items.task, items.trial]);
    await act(async () => resolveButton("overdue_followup").click());
    expect(m.complete).not.toHaveBeenCalled(); // asks first
    m.complete.mockResolvedValue(undefined);
    m.fetch.mockResolvedValue([items.trial]);
    await act(async () => ([...document.querySelectorAll<HTMLButtonElement>("[data-testid=urgent-confirm] button")].find((b) => b.textContent === "today.urgentCompleteTask")!).click());
    await settle();
    expect(m.complete).toHaveBeenCalledWith("t-1", "t2");
    expect(refreshedBoth()).toBe(true);
    expect(document.querySelector("[data-testid=urgent-count]")!.textContent).toBe("1");
    expect(row("overdue_followup")).toBeNull();
  });
  it("a failed completion keeps the item visible with a message and does not refresh", async () => {
    await mount([items.task]);
    await act(async () => resolveButton("overdue_followup").click());
    m.complete.mockRejectedValue(new Error("rls"));
    await act(async () => ([...document.querySelectorAll<HTMLButtonElement>("[data-testid=urgent-confirm] button")].find((b) => b.textContent === "today.urgentCompleteTask")!).click());
    await settle();
    expect(m.error).toHaveBeenCalledWith("today.urgentResolveError");
    expect(row("overdue_followup")).not.toBeNull();
    expect(refreshedBoth()).toBe(false);
  });
  it("a failed automation is retried here; a failed retry keeps it with a message", async () => {
    await mount([items.automation]);
    m.retry.mockResolvedValueOnce({ success: false, error: "still failing" });
    await act(async () => resolveButton("failed_automation").click());
    await settle();
    expect(m.retry).toHaveBeenCalledWith("a1");
    expect(m.error).toHaveBeenCalledWith("today.urgentResolveError");
    expect(row("failed_automation")).not.toBeNull();
    m.retry.mockResolvedValueOnce({ success: true });
    m.fetch.mockResolvedValue([]);
    await act(async () => resolveButton("failed_automation").click());
    await settle();
    expect(refreshedBoth()).toBe(true);
  });
  it("a trial-lesson notice opens that lesson in the Agenda", async () => {
    await mount([items.trial]);
    await act(async () => resolveButton("trial_soon").click());
    expect(m.navigate).toHaveBeenCalledWith({ to: "/calendar?eventId=e9" });
  });
});

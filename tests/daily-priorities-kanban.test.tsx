// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const m = vi.hoisted(() => ({ priorities: { items: [] as any[], failed: [] as string[] }, moduleAction: null as unknown }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/use-language", async () => {
  const { t } = await import("../src/lib/i18n");
  return { useLanguage: () => ({ lang: "pt", t: (k: string, f?: string) => t(k, "pt", f) }) };
});
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-daily-priorities-query", () => ({ useDailyPrioritiesQuery: () => ({ data: m.priorities, isLoading: false, isError: false }) }));
vi.mock("@/components/bloom/PriorityModuleActions", async (original) => ({
  ...(await original<object>()),
  PriorityModuleActions: (p: { action: unknown }) => { m.moduleAction = p.action; return createElement("div", { "data-testid": "module-flow" }); },
}));
import { DailyPrioritiesCard } from "../src/components/bloom/DailyPrioritiesCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; m.moduleAction = null; });

const it_ = (id: string, category: string, urgency: string, reason: string, date: string | null, params: Record<string, unknown> = {}, ref: Record<string, string> = {}) =>
  ({ id, category, urgency, reason, title: `Título ${id}`, params, date, ref, action: { route: "/x" } });
const data = () => [
  it_("p1", "payment", "critical", "payment_overdue", "2026-11-05", { amountCents: 1000, daysLate: 3, dueDate: "2026-11-05" }, { invoiceId: "inv1" }),
  it_("l1", "lead", "critical", "lead_task_overdue", "2026-11-10", { dueDate: "2026-11-10" }, { leadId: "L1", taskId: "T1" }),
  it_("l2", "lead", "today", "lead_task_due_today", "2026-11-18", { dueDate: "2026-11-18" }, { leadId: "L2", taskId: "T2" }),
  it_("k1", "contract", "upcoming", "contract_ending_30d", "2026-12-10", { packageName: "Intensivo", daysRemaining: 22 }, { studentId: "s1" }),
  it_("s1", "lead", "stale", "lead_stale", "2026-10-01", { since: "2026-10-01", days: 48 }, { leadId: "L3" }),
];
const client = new QueryClient();
function render() {
  if (!root) root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(createElement(QueryClientProvider, { client }, createElement(DailyPrioritiesCard, { teacherId: "t-1" }))));
}
const kanban = () => document.querySelector<HTMLElement>("[data-testid=priorities-kanban]");
const column = (key: string) => kanban()!.querySelector<HTMLElement>(`[data-kanban-column="${key}"]`)!;
const titles = (el: HTMLElement) => [...el.querySelectorAll("li h4")].map((h) => h.textContent);
const openKanban = () => act(() => (document.querySelector('button[aria-label="Expandir prioridades"]') as HTMLButtonElement).click());

describe("Today's priorities: compact panel + Kanban", () => {
  it("compact panel keeps every item reachable by internal scrolling, filters and counts, and has an expand button", () => {
    m.priorities = { items: data(), failed: [] };
    render();
    const scroll = document.querySelector<HTMLElement>("[data-testid=priorities-scroll]")!;
    expect(scroll.className).toContain("overflow-y-auto");
    expect(scroll.className).toContain("max-h-[22rem]"); // a bit shorter than before
    expect(scroll.querySelectorAll("li[data-priority-item]")).toHaveLength(5); // nothing is cut
    expect(document.querySelector("[data-testid=priorities-filters-dark]")!.textContent).toContain("5");
  });
  it("opens a Kanban with Overdue / Today / Upcoming and their counts, undated items in their own section; closes with Esc", () => {
    m.priorities = { items: data(), failed: [] };
    render();
    openKanban();
    expect(kanban()).not.toBeNull();
    expect(titles(column("critical"))).toEqual(["Título p1", "Título l1"]);
    expect(titles(column("today"))).toEqual(["Título l2"]);
    expect(titles(column("upcoming"))).toEqual(["Título k1"]);
    expect(titles(column("stale"))).toEqual(["Título s1"]);
    expect([...kanban()!.querySelectorAll("[data-kanban-count]")].map((c) => c.textContent)).toEqual(["2", "1", "1", "1"]);
    expect(column("critical").querySelector("h3")!.textContent).toBe("Atrasadas");
    // Larger cards with category, date, title and description.
    const card = column("critical").querySelector("li")!;
    expect(card.className).toContain("rounded-lg border");
    expect(card.textContent).toContain("Pagamentos");
    expect(card.textContent).toMatch(/R\$\s?10,00/);
    // No drag and drop.
    expect(kanban()!.querySelector("[draggable=true]")).toBeNull();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(kanban()).toBeNull();
  });
  it("category filters work inside the Kanban too (shared with the compact panel)", () => {
    m.priorities = { items: data(), failed: [] };
    render();
    openKanban();
    const leads = [...kanban()!.querySelectorAll<HTMLButtonElement>("[data-testid=priorities-filters-light] button")].find((b) => b.textContent!.includes("Leads"))!;
    act(() => leads.click());
    expect(titles(column("critical"))).toEqual(["Título l1"]);
    expect(titles(column("upcoming"))).toEqual([]);
    expect(column("upcoming").textContent).toContain("Nada por aqui.");
    expect(titles(column("stale"))).toEqual(["Título s1"]);
    // The compact panel follows the same filter.
    expect([...document.querySelectorAll<HTMLElement>("[data-testid=priorities-scroll] li h4")].map((h) => h.textContent)).toEqual(["Título l1", "Título l2", "Título s1"]);
  });
  it("Resolver in the Kanban uses the existing flows", () => {
    m.priorities = { items: data(), failed: [] };
    render();
    openKanban();
    act(() => (column("critical").querySelectorAll<HTMLElement>("[role=button]")[1]).click());
    expect(m.moduleAction).toEqual({ kind: "lead", leadId: "L1" });
  });
  it("after a confirmed resolution both views show the new state from the same data", () => {
    m.priorities = { items: data(), failed: [] };
    render();
    openKanban();
    m.priorities = { items: data().filter((i) => i.id !== "l1"), failed: [] }; // the source no longer lists it
    render();
    expect(titles(column("critical"))).toEqual(["Título p1"]);
    expect(kanban()!.querySelector("[data-kanban-count]")!.textContent).toBe("1");
    expect(document.querySelector("[data-testid=priorities-scroll]")!.textContent).not.toContain("Título l1");
  });
  it("mobile: columns scroll horizontally (snap); desktop: three columns", () => {
    m.priorities = { items: data(), failed: [] };
    render();
    openKanban();
    const track = column("critical").parentElement!;
    expect(track.className).toContain("overflow-x-auto");
    expect(track.className).toContain("snap-x");
    expect(track.className).toContain("md:grid-cols-3");
    expect(column("critical").className).toContain("w-[85%]");
    expect(column("critical").querySelector("ul")!.className).toContain("overflow-y-auto"); // independent scroll
  });
});

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ priorities: { items: [] as any[], failed: [] as string[] } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/use-language", async () => {
  const { t } = await import("../src/lib/i18n");
  return { useLanguage: () => ({ lang: "pt", t: (k: string, f?: string) => t(k, "pt", f) }) };
});
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-daily-priorities-query", () => ({
  useDailyPrioritiesQuery: () => ({ data: mocks.priorities, isLoading: false, isError: false }),
}));
import { DailyPrioritiesCard } from "../src/components/bloom/DailyPrioritiesCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

const item = (id: string, category: string, urgency: string, reason: string, date: string | null, params: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, category, urgency, reason, title: `Título ${id}`, params, date, ref: {}, action: { route: "/x" }, ...extra });
function render(items: any[]) {
  mocks.priorities = { items, failed: [] };
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(DailyPrioritiesCard, { teacherId: "t-1" }))));
}
const row = (title: string) => [...document.querySelectorAll("li")].find((li) => li.textContent!.includes(title))!;
const dateLabel = (ymd: string) => { const [y, m, d] = ymd.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); };

describe("Today priorities: visual cleanup", () => {
  const items = [
    item("p", "payment", "critical", "payment_overdue", "2026-11-05", { amountCents: 35000, dueDate: "2026-11-05", daysLate: 12 }),
    item("a", "attendance", "critical", "attendance_missing", "2026-11-10", { date: "2026-11-10", time: "14:00", daysLate: 7 }, { time: "14:00:00" }),
    item("t", "task", "today", "task_due_today", "2026-11-17", { dueDate: "2026-11-17" }),
  ];
  it("no 'Crítico / Atrasado' heading; other urgency headings and order are kept", () => {
    render(items);
    const text = document.body.textContent!;
    expect(text).not.toContain("Crítico / Atrasado");
    expect(text).toContain("Hoje");
    expect([...document.querySelectorAll("li h4")].map((h) => h.textContent)).toEqual(["Título p", "Título a", "Título t"]);
  });
  it("each date appears only once, next to the category; the rest of the description is kept", () => {
    render(items);
    const payment = row("Título p");
    const date = dateLabel("2026-11-05");
    expect(payment.textContent!.split(date).length - 1).toBe(1);
    const description = payment.querySelector("p")!.textContent!;
    expect(description).not.toContain(date);
    expect(description).toMatch(/R\$\s?350,00/);
    expect(description).toContain("12d de atraso");
    const attendance = row("Título a");
    expect(attendance.textContent!.split(dateLabel("2026-11-10")).length - 1).toBe(1);
    expect(attendance.textContent!.split("14:00").length - 1).toBe(1); // time shown once too
    expect(attendance.querySelector("p")!.textContent).toBe("Aula sem presença registrada (7d de atraso)");
  });
  it("reasons without a date in their text are unchanged", () => {
    render([...items, item("k", "contract", "upcoming", "contract_ending_30d", "2026-12-07", { packageName: "Intensivo", daysRemaining: 20, endDate: "2026-12-07" })]);
    expect(row("Título k").querySelector("p")!.textContent).toBe("Contrato Intensivo termina em 20 dias");
  });
  it("soft divider between actions starting at the text column, no individual cards", () => {
    render(items);
    const rows = [...document.querySelectorAll<HTMLElement>("ul[data-priority-list] > li")];
    expect(rows.length).toBeGreaterThan(1);
    // The line is drawn above every item but the first, offset past the icon column.
    expect(rows.every((li) => li.className.includes("not-first:before:bg-stone-200/60"))).toBe(true);
    expect(rows.every((li) => li.className.includes("not-first:before:left-9"))).toBe(true);
    expect(rows.some((li) => /\bborder\b|rounded-lg/.test(li.className))).toBe(false);
    expect(document.querySelector("ul.divide-y")).toBeNull(); // no full-width lines across the icons
  });
  it("category as coloured text only, with the neutral grey icon in its own column next to the title", () => {
    render(items);
    const attendance = row("Título a");
    const label = attendance.querySelector<HTMLElement>("[data-priority-category]")!;
    expect(label.textContent).toBe("Presença");
    expect(label.className).toContain("text-sky-700");
    expect(label.className).not.toMatch(/\bbg-|border|rounded|px-/);
    expect(label.querySelector("svg")).toBeNull(); // no icon inside the category
    const icons = [...document.querySelectorAll<SVGElement>("[data-priority-icon]")];
    expect(icons.length).toBeGreaterThan(1);
    expect(icons.every((icon) => icon.getAttribute("class")!.includes("text-stone-400"))).toBe(true);
    // Same grid row as the title (not the category line).
    const icon = attendance.querySelector("[data-priority-icon]")!;
    expect(icon.getAttribute("class")).toContain("row-start-2");
    expect(icon.getAttribute("class")).toContain("col-start-1");
    expect(attendance.querySelector("h4")!.className).toContain("row-start-2");
  });

  describe("redundant 'vence hoje' under the Hoje heading", () => {
    const todayItems = [
      item("f", "lead", "today", "lead_task_due_today", "2026-11-17", { dueDate: "2026-11-17" }),
      item("c", "payment", "today", "payment_due_today", "2026-11-17", { amountCents: 12000, dueDate: "2026-11-17" }),
      item("t", "task", "today", "task_due_today", "2026-11-17", { dueDate: "2026-11-17" }),
    ];
    it("drops the line that only repeats the group, keeps title and date, keeps the amount", () => {
      render(todayItems);
      expect(row("Título f").querySelector("p")).toBeNull();
      expect(row("Título t").querySelector("p")).toBeNull();
      expect(row("Título f").querySelector("h4")!.textContent).toBe("Título f");
      expect(row("Título f").textContent).toContain(dateLabel("2026-11-17"));
      expect(row("Título c").querySelector("p")!.textContent).toMatch(/^Cobrança de R\$\s?120,00$/);
    });
    it("keeps the full wording where no Hoje heading is shown (category filter)", () => {
      render(todayItems);
      act(() => ([...document.querySelectorAll("button")].find((b) => b.textContent!.includes("Leads")) as HTMLButtonElement).click());
      expect(row("Título f").querySelector("p")!.textContent).toBe("Follow-up vence hoje");
    });
  });

  describe("dividers between groups", () => {
    const grouped = [
      item("p", "payment", "critical", "payment_overdue", "2026-11-05", { amountCents: 35000, dueDate: "2026-11-05", daysLate: 12 }),
      item("q", "payment", "critical", "payment_overdue", "2026-11-06", { amountCents: 1000, dueDate: "2026-11-06", daysLate: 11 }),
      item("t", "task", "today", "task_due_today", "2026-11-17", { dueDate: "2026-11-17" }),
      item("s", "lead", "stale", "lead_stale", "2026-10-01", { since: "2026-10-01", days: 47 }),
    ];
    const sections = () => [...document.querySelectorAll<HTMLElement>("[data-urgency-section]")];
    it("a soft line before each heading that has content above; none before the first group", () => {
      render(grouped);
      expect(sections().map((el) => [el.dataset.urgencySection, el.className.includes("before:h-px")])).toEqual([
        ["critical", false], ["today", true], ["stale", true],
      ]);
      // The group line also starts at the text column (none across the icon column).
      expect(sections()[1].className).toContain("before:bg-stone-200/60");
      expect(sections()[1].className).toContain("before:left-9");
    });
    it("no leading line when the list starts with a headed group", () => {
      render(grouped.filter((i) => i.urgency !== "critical"));
      expect(sections()[0].className).not.toContain("before:h-px");
    });
    it("item dividers stay inside each group (no doubled line at the group boundary)", () => {
      render(grouped);
      const lists = sections().map((el) => el.querySelector("ul")!);
      expect(lists.every((ul) => ul.hasAttribute("data-priority-list"))).toBe(true);
      // Lines are drawn only above items after the first, so the last item of a group adds none.
      expect(lists[0].querySelectorAll("li")).toHaveLength(2);
    });
  });
});

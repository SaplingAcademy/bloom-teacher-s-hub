// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ priorities: { items: [] as any[], failed: [] as string[] } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-daily-priorities-query", () => ({
  useDailyPrioritiesQuery: () => ({ data: mocks.priorities, isLoading: false, isError: false }),
}));
import { DailyPrioritiesCard } from "../src/components/bloom/DailyPrioritiesCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

const task = { id: "task:1", category: "task", urgency: "critical", reason: "task_overdue", title: "Planejar aula", params: {}, date: "2026-11-16", ref: {}, action: { route: "/x" } };
function render(items: any[], failed: string[]) {
  mocks.priorities = { items, failed };
  root = createRoot(document.body.appendChild(document.createElement("div")));
  act(() => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(DailyPrioritiesCard, { teacherId: "t-1" }))));
}
const notice = () => document.body.textContent!.includes("today.categoryLoadError");
const clickChip = (label: string) => act(() => ([...document.querySelectorAll("button")].find((b) => b.textContent?.includes(label)) as HTMLElement).click());

describe("Today priorities: Leads load failure", () => {
  it("shows no notice for Leads and never claims everything is up to date", () => {
    render([], ["lead"]);
    expect(notice()).toBe(false);
    expect(document.body.textContent).not.toContain("today.emptyAllCaughtUp");
    clickChip("today.filterLeads");
    expect(document.body.textContent).not.toContain("today.noCategoryItems");
  });
  it("keeps the other categories' items and their failure notice", () => {
    render([task], ["lead", "payment"]);
    expect(document.body.textContent).toContain("Planejar aula");
    expect(notice()).toBe(true);
  });
  it("still shows 'all caught up' when nothing failed", () => {
    render([], []);
    expect(document.body.textContent).toContain("today.emptyAllCaughtUp");
  });
});

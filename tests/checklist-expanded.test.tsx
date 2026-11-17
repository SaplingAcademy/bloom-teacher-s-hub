// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherChecklistItem } from "../src/lib/teacher-checklist";

// One shared source, like the React Query cache behind useTeacherChecklist in both views.
const m = vi.hoisted(() => ({ items: [] as TeacherChecklistItem[], execute: vi.fn(), refetch: vi.fn() }));
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), { selectedScrollSnap: () => 0, scrollTo: vi.fn(), on: vi.fn(), off: vi.fn() }] }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));
vi.mock("@/hooks/use-teacher-checklist", () => ({ useTeacherChecklist: () => ({
  items: m.items, isLoading: false, error: null, isFetching: false, pending: false, isItemPending: () => false, execute: m.execute, refetch: m.refetch,
}) }));
import { ChecklistCard } from "../src/components/bloom/ChecklistCard";

const row = (id: string, completed = false): TeacherChecklistItem => ({
  id, teacher_id: "t", title: `Tarefa ${id}`, completed, deadline_type: "none", due_date: null,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
} as TeacherChecklistItem);

let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); m.execute.mockReset(); root = createRoot(document.body.appendChild(document.createElement("div"))); });
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });
const renderBoth = (onExpand = vi.fn()) => act(async () => root.render(createElement("div", null,
  createElement(ChecklistCard, { onExpand }), createElement(ChecklistCard, { expanded: true }))));
const view = (name: string) => document.querySelector<HTMLElement>(`[data-checklist-view="${name}"]`)!;

describe("Checklist compact + expanded", () => {
  it("the compact view has the expand button; the expanded view shows every task without the compact height cap", async () => {
    m.items = Array.from({ length: 12 }, (_, i) => row(String(i)));
    const onExpand = vi.fn();
    await renderBoth(onExpand);
    const button = view("compact").querySelector<HTMLButtonElement>("[data-testid=expand-panel]")!;
    expect(view("expanded").querySelector("[data-testid=expand-panel]")).toBeNull();
    await act(async () => button.click());
    expect(onExpand).toHaveBeenCalled();
    expect(view("expanded").querySelectorAll("li input[type=checkbox], li button[role=checkbox]").length).toBe(12);
    expect(view("expanded").querySelector("[data-no-carousel-drag]")!.className).not.toContain("max-h-64");
    expect(view("compact").querySelector("[data-no-carousel-drag]")!.className).toContain("max-h-64");
  });
  it("both views use the same operations and ids stay unique when mounted together", async () => {
    m.items = [row("a")];
    await renderBoth();
    const del = view("expanded").querySelector<HTMLButtonElement>('button[aria-label="checklist.delete: Tarefa a"]')!;
    await act(async () => del.click());
    expect(m.execute).toHaveBeenCalledWith({ type: "delete", id: "a" });
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("a change in the shared data shows in both views at once", async () => {
    m.items = [row("a")];
    await renderBoth();
    m.items = [row("a"), row("b")];
    await renderBoth();
    expect(view("compact").textContent).toContain("Tarefa b");
    expect(view("expanded").textContent).toContain("Tarefa b");
  });
});

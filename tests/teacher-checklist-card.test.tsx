// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherChecklistItem } from "../src/lib/teacher-checklist";

const mocks = vi.hoisted(() => {
  const listeners = new Map<string, () => void>();
  return {
    slide: 0,
    listeners,
    api: {
      selectedScrollSnap: vi.fn(() => mocks.slide),
      scrollTo: vi.fn((index: number) => { mocks.slide = index; mocks.listeners.get("select")?.(); }),
      on: vi.fn((event: string, callback: () => void) => { mocks.listeners.set(event, callback); }),
      off: vi.fn((event: string) => { mocks.listeners.delete(event); }),
    },
    execute: vi.fn(), refetch: vi.fn(),
  };
});
vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), mocks.api] }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "en", t: (key: string) => ({
  "checklist.pending": "{count} pending", "checklist.overdueCount": "{count} overdue", "checklist.originalDue": "Original deadline: {date}",
  "checklist.recoverDescription": "Choose a new deadline. The original deadline was {date}.",
}[key] ?? key) }) }));
vi.mock("@/hooks/use-teacher-checklist", () => ({ useTeacherChecklist: () => ({
  items: mocks.items, isLoading: false, error: null, isFetching: false, pending: false,
  isItemPending: () => false, execute: mocks.execute, refetch: mocks.refetch,
}) }));
import { ChecklistCard } from "../src/components/bloom/ChecklistCard";

const NONE = { deadline_type: "none", due_date: null } as const;
const row = (id: string, deadline = NONE, completed = false): TeacherChecklistItem => ({
  id, teacher_id: "teacher", title: id, completed, ...deadline,
  created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
});
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); mocks.slide = 0; mocks.listeners.clear(); mocks.execute.mockResolvedValue(true);
  mocks.items = [row("Current"), row("Overdue", { deadline_type: "specific", due_date: "2000-01-02" }), row("Completed", NONE, true)];
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
async function mount() { await act(async () => { root.render(createElement(ChecklistCard)); }); }
function button(name: string) { return Array.from(document.querySelectorAll("button")).find((element) => element.getAttribute("aria-label") === name); }

describe("Checklist carousel and recovery UI", () => {
  it("navigates with both indicator dots and updates the active screen", async () => {
    await mount();
    const historyDot = button("checklist.showHistory");
    expect(historyDot).toBeDefined();
    await act(async () => { historyDot?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(mocks.api.scrollTo).toHaveBeenCalledWith(1);
    expect(historyDot?.getAttribute("aria-current")).toBe("page");
    expect(container.textContent).toContain("checklist.historyEmptyDescription");
    expect(container.textContent).toContain("1 overdue");
    await act(async () => { button("checklist.showChecklist")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(mocks.api.scrollTo).toHaveBeenLastCalledWith(0);
  });
  it("supports Arrow, Home and End keyboard navigation without changing task data", async () => {
    await mount();
    const carousel = container.querySelector("[aria-roledescription='carousel']");
    for (const key of ["ArrowRight", "ArrowLeft", "End", "Home"]) {
      await act(async () => { carousel?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); });
    }
    expect(mocks.api.scrollTo.mock.calls.map(([index]) => index)).toEqual([1, 0, 1, 0]);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("recovers the same overdue ID through the deadline dialog", async () => {
    await mount();
    await act(async () => { button("checklist.showHistory")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(container.textContent).toContain("Original deadline: Jan 02, 2000");
    await act(async () => { button("checklist.recover: Overdue")?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(document.body.textContent).toContain("checklist.recoverTitle");
    const confirm = Array.from(document.querySelectorAll("button")).find((element) => element.textContent?.includes("checklist.confirmRecover"));
    await act(async () => { confirm?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(mocks.execute).toHaveBeenCalledWith({ type: "recover", id: "Overdue", deadline: NONE });
    expect(mocks.execute).not.toHaveBeenCalledWith(expect.objectContaining({ type: "create" }));
  });
});

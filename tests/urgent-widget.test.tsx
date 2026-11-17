// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AttentionItem } from "../src/lib/attention-queue";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  automate: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/attention-queue", () => ({ fetchAttentionQueue: mocks.fetch }));
vi.mock("@/lib/inactive-lead-automation", () => ({ runInactiveLeadCheckOnLoad: mocks.automate }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: "en",
    t: (key: string) => ({
      "today.urgentTitle": "Urgent",
      "today.urgentSubtitle": "Immediate attention",
      "today.urgentItemCount": "{count} item",
      "today.urgentItemCountPlural": "{count} items",
      "today.refreshUrgent": "Refresh urgent items",
      "today.resolveAction": "Resolve",
      "today.allClearTitle": "All clear",
      "today.allClearSubtitle": "No urgent issues",
      "today.allClearCardTitle": "All caught up!",
      "today.allClearCardHint": "No urgent items need your attention.",
      "today.urgentCardHint": "You have pending items that need your attention.",
    })[key] ?? key,
  }),
}));

import { UrgentWidget } from "../src/components/bloom/UrgentWidget";
import { urgentQueueRootKey } from "../src/hooks/use-urgent-queue-query";

function item(id: string, urgency: AttentionItem["urgency"] = "high"): AttentionItem {
  return {
    id,
    category: "overdue_followup",
    title: `Occurrence ${id}`,
    reason: `Reason ${id}`,
    recommendedAction: "Open",
    urgency,
    targetUrl: `/leads?leadId=${id}`,
  };
}

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.fetch.mockReset();
  mocks.automate.mockReset();
  mocks.automate.mockResolvedValue(undefined);
  // Same defaults as the app (src/router.tsx).
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false } } });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

// React Query delivers results on a later tick: let it flush.
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
async function mount(key = "a") {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(UrgentWidget, { key, teacherId: "teacher" })));
  });
  await settle();
}


const card = () => container.querySelector<HTMLButtonElement>("[data-testid=urgent-card]");
const count = () => container.querySelector("[data-testid=urgent-count]")?.textContent ?? null;
const dialog = () => document.querySelector<HTMLElement>("[data-testid=urgent-dialog]");
async function openDialog() { await act(async () => card()!.click()); }

describe("Urgent summary card", () => {
  it("shows a compact skeleton on first load, then the card with the real count of urgent items only", async () => {
    let resolveFetch!: (items: AttentionItem[]) => void;
    mocks.fetch.mockReturnValue(new Promise<AttentionItem[]>((resolve) => { resolveFetch = resolve; }));
    await mount();
    expect(container.querySelector("[data-testid=urgent-skeleton]")?.getAttribute("aria-busy")).toBe("true");
    await act(async () => { resolveFetch([item("urgent"), item("ordinary", "medium")]); });
    await settle();
    expect(container.querySelector("[data-testid=urgent-skeleton]")).toBeNull();
    expect(card()!.textContent).toContain("Urgent");
    expect(count()).toBe("1"); // only high urgency
    expect(card()!.dataset.urgentState).toBe("urgent");
    expect(card()!.className).toContain("bg-[#FCE8E1]");
    expect(card()!.textContent).toContain("You have pending items that need your attention.");
    expect(card()!.getAttribute("aria-haspopup")).toBe("dialog");
    expect(container.textContent).not.toContain("Occurrence urgent"); // the list lives in the modal
  });

  it("opens the full list in a modal, each item with a clear action; closes with Esc", async () => {
    mocks.fetch.mockResolvedValue([item("one"), item("two")]);
    await mount();
    await openDialog();
    expect(dialog()!.textContent).toContain("Occurrence one");
    expect(dialog()!.textContent).toContain("Occurrence two");
    const resolve = [...dialog()!.querySelectorAll("button")].find((button) => button.textContent?.includes("Resolve"))!;
    await act(async () => resolve.click());
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/leads?leadId=one" });
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(dialog()).toBeNull();
  });

  it("without urgent items shows the soft green all-caught-up card (no red counter)", async () => {
    mocks.fetch.mockResolvedValue([item("ordinary", "medium"), item("later", "low")]);
    await mount();
    expect(card()!.dataset.urgentState).toBe("clear");
    expect(card()!.className).toContain("bg-[#E8F5E9]");
    expect(card()!.textContent).toContain("All caught up!");
    expect(card()!.textContent).toContain("No urgent items need your attention.");
    expect(card()!.textContent).not.toContain("Urgent");
    expect(count()).toBeNull();
    expect(card()!.innerHTML).not.toContain("rose");
  });

  it("after a refresh confirms the resolution, the modal and the count update", async () => {
    mocks.fetch.mockResolvedValueOnce([item("resolved")]).mockResolvedValueOnce([]);
    await mount();
    expect(count()).toBe("1");
    await openDialog();
    const refresh = document.querySelector<HTMLButtonElement>("[data-testid=urgent-dialog] button[title='Refresh urgent items']")!;
    await act(async () => refresh.click());
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(count()).toBeNull();
    expect(dialog()!.textContent).not.toContain("Occurrence resolved");
  });

  it("reads the queue without waiting for the inactive-lead automation, which still runs once", async () => {
    let finishAutomation!: (v: { processedCount: number }) => void;
    mocks.automate.mockReturnValue(new Promise((resolve) => { finishAutomation = resolve; }));
    mocks.fetch.mockResolvedValue([item("urgent")]);
    await mount();
    await settle();
    expect(mocks.automate).toHaveBeenCalledTimes(1);
    expect(mocks.automate).toHaveBeenCalledWith("teacher");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(count()).toBe("1");
    await act(async () => { finishAutomation({ processedCount: 0 }); });
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("reads again when the automation processed something", async () => {
    mocks.automate.mockResolvedValue({ processedCount: 2 });
    mocks.fetch.mockResolvedValueOnce([item("before")]).mockResolvedValueOnce([item("after"), item("after-2")]);
    await mount();
    await settle();
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(count()).toBe("2");
  });

  it("returning to Today shows the cached count at once (no skeleton) and revalidates", async () => {
    mocks.fetch.mockResolvedValueOnce([item("cached")]);
    await mount("first");
    await settle();
    let resolveSecond!: (items: AttentionItem[]) => void;
    mocks.fetch.mockReturnValueOnce(new Promise<AttentionItem[]>((resolve) => { resolveSecond = resolve; }));
    await act(async () => root.render(createElement("div")));
    await mount("second");
    expect(container.querySelector("[data-testid=urgent-skeleton]")).toBeNull();
    expect(count()).toBe("1");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await act(async () => { resolveSecond([item("fresh"), item("fresh-2")]); });
    await settle();
    expect(count()).toBe("2");
  });

  it("updates when Priorities (or the Kanban) invalidates the Urgent cache after a change", async () => {
    mocks.fetch.mockResolvedValueOnce([item("pending")]).mockResolvedValueOnce([]);
    await mount();
    await settle();
    expect(count()).toBe("1");
    await act(async () => { await client.invalidateQueries({ queryKey: urgentQueueRootKey("teacher") }); });
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(count()).toBeNull();
  });
});

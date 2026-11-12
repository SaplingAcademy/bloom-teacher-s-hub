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

function refreshButton() {
  return container.querySelector<HTMLButtonElement>("button[title='Refresh urgent items']");
}

describe("Urgent dashboard visibility", () => {
  it("shows a stable skeleton on first load, then renders only the real urgent occurrence", async () => {
    let resolveFetch!: (items: AttentionItem[]) => void;
    mocks.fetch.mockReturnValue(new Promise<AttentionItem[]>((resolve) => { resolveFetch = resolve; }));
    await mount();
    const skeleton = container.querySelector("[data-testid=urgent-skeleton]");
    expect(skeleton?.getAttribute("aria-busy")).toBe("true");
    expect(skeleton?.querySelectorAll(".h-\\[58px\\]").length).toBe(2);

    await act(async () => { resolveFetch([item("urgent"), item("ordinary", "medium")]); });
    await settle();
    expect(container.querySelector("[data-testid=urgent-skeleton]")).toBeNull();
    expect(container.textContent).toContain("Urgent");
    expect(container.textContent).toContain("1 item");
    expect(container.textContent).toContain("Occurrence urgent");
    expect(container.textContent).not.toContain("Occurrence ordinary");

    const resolve = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Resolve"));
    await act(async () => { resolve?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/leads?leadId=urgent" });
  });

  it("renders every urgent occurrence once with a plural count", async () => {
    mocks.fetch.mockResolvedValue([item("one"), item("two")]);
    await mount();
    expect(container.textContent).toContain("2 items");
    expect(container.querySelectorAll("button").length).toBe(3);
    expect(container.textContent).toContain("Occurrence one");
    expect(container.textContent).toContain("Occurrence two");
  });

  it("renders nothing when there are no urgent occurrences, including no all-clear placeholder", async () => {
    mocks.fetch.mockResolvedValue([item("ordinary", "medium"), item("later", "low")]);
    await mount();
    expect(container.childElementCount).toBe(0);
    expect(container.textContent).not.toContain("All clear");
    expect(container.textContent).not.toContain("No urgent issues");
  });

  it("removes the card after a refresh confirms the urgent occurrence was resolved", async () => {
    mocks.fetch
      .mockResolvedValueOnce([item("resolved")])
      .mockResolvedValueOnce([]);
    await mount();
    expect(container.textContent).toContain("Occurrence resolved");

    await act(async () => {
      refreshButton()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(container.childElementCount).toBe(0);
  });

  it("reads the queue without waiting for the inactive-lead automation, which still runs once", async () => {
    let finishAutomation!: (v: { processedCount: number }) => void;
    mocks.automate.mockReturnValue(new Promise((resolve) => { finishAutomation = resolve; }));
    mocks.fetch.mockResolvedValue([item("urgent")]);
    await mount();
    await settle();
    expect(mocks.automate).toHaveBeenCalledTimes(1);
    expect(mocks.automate).toHaveBeenCalledWith("teacher");
    expect(mocks.fetch).toHaveBeenCalledTimes(1); // started before the automation finished
    expect(container.textContent).toContain("Occurrence urgent");

    // Nothing processed: no extra read.
    await act(async () => { finishAutomation({ processedCount: 0 }); });
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it("reads again when the automation processed something", async () => {
    mocks.automate.mockResolvedValue({ processedCount: 2 });
    mocks.fetch.mockResolvedValueOnce([item("before")]).mockResolvedValueOnce([item("after")]);
    await mount();
    await settle();
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Occurrence after");
  });

  it("returning to Today shows the cached items at once (no skeleton) and revalidates", async () => {
    mocks.fetch.mockResolvedValueOnce([item("cached")]);
    await mount("first");
    await settle();
    let resolveSecond!: (items: AttentionItem[]) => void;
    mocks.fetch.mockReturnValueOnce(new Promise<AttentionItem[]>((resolve) => { resolveSecond = resolve; }));
    await act(async () => root.render(createElement("div")));
    await mount("second");
    expect(container.querySelector("[data-testid=urgent-skeleton]")).toBeNull();
    expect(container.textContent).toContain("Occurrence cached");
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    await act(async () => { resolveSecond([item("fresh")]); });
    await settle();
    expect(container.textContent).toContain("Occurrence fresh");
  });

  it("refreshes when Priorities invalidates the Urgent cache after a change", async () => {
    mocks.fetch.mockResolvedValueOnce([item("pending")]).mockResolvedValueOnce([]);
    await mount();
    await settle();
    expect(container.textContent).toContain("Occurrence pending");
    await act(async () => { await client.invalidateQueries({ queryKey: urgentQueueRootKey("teacher") }); });
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(container.childElementCount).toBe(0);
  });
});

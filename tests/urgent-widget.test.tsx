// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  mocks.automate.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount() {
  await act(async () => {
    root.render(createElement(UrgentWidget, { teacherId: "teacher" }));
  });
}

function refreshButton() {
  return container.querySelector<HTMLButtonElement>("button[title='Refresh urgent items']");
}

describe("Urgent dashboard visibility", () => {
  it("reserves no space while loading, then renders only the real urgent occurrence", async () => {
    let resolveFetch!: (items: AttentionItem[]) => void;
    mocks.fetch.mockReturnValue(new Promise<AttentionItem[]>((resolve) => { resolveFetch = resolve; }));
    await mount();
    expect(container.childElementCount).toBe(0);

    await act(async () => { resolveFetch([item("urgent"), item("ordinary", "medium")]); });
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
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(container.childElementCount).toBe(0);
  });
});

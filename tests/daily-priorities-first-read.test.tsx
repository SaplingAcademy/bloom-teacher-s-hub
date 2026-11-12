// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), automate: vi.fn() }));
vi.mock("@/lib/daily-priorities", () => ({ fetchDailyPriorities: mocks.fetch }));
vi.mock("@/lib/inactive-lead-automation", () => ({ runInactiveLeadCheckOnLoad: mocks.automate }));

import { useDailyPrioritiesQuery } from "../src/hooks/use-daily-priorities-query";

type Result = { items: { id: string }[]; failed: string[] };
const result = (...ids: string[]): Result => ({ items: ids.map((id) => ({ id })), failed: [] });

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

function Probe() {
  const { data } = useDailyPrioritiesQuery("teacher");
  return createElement("p", null, data ? data.items.map((i) => i.id).join(",") || "empty" : "loading");
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.fetch.mockReset();
  mocks.automate.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
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
const mount = async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
  await settle();
};

describe("Daily priorities: automation finishing during the first read", () => {
  it("reads again after the first read when the automation processed something meanwhile", async () => {
    const first = deferred<Result>();
    mocks.fetch.mockReturnValueOnce(first.promise).mockResolvedValueOnce(result("p1", "follow-up"));
    mocks.automate.mockResolvedValue({ processedCount: 1 });
    await mount();
    // Automation already finished; the first read (started before its write) is still pending.
    expect(mocks.automate).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("loading");

    await act(async () => first.resolve(result("p1")));
    await settle();
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("p1,follow-up");
  });

  it("does not read again when the automation processed nothing", async () => {
    const first = deferred<Result>();
    mocks.fetch.mockReturnValueOnce(first.promise);
    mocks.automate.mockResolvedValue({ processedCount: 0 });
    await mount();
    await act(async () => first.resolve(result("p1")));
    await settle();
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(container.textContent).toBe("p1");
  });

  it("still refreshes at once when the automation finishes after the first read", async () => {
    const automation = deferred<{ processedCount: number }>();
    mocks.automate.mockReturnValue(automation.promise);
    mocks.fetch.mockResolvedValueOnce(result("p1")).mockResolvedValueOnce(result("p1", "follow-up"));
    await mount();
    expect(container.textContent).toBe("p1");
    await act(async () => automation.resolve({ processedCount: 2 }));
    await settle();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(container.textContent).toBe("p1,follow-up");
  });
});

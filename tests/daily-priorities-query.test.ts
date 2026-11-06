import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";

const { fetchPriorities } = vi.hoisted(() => ({ fetchPriorities: vi.fn() }));
vi.mock("@/lib/daily-priorities", () => ({ fetchDailyPriorities: fetchPriorities }));
vi.mock("@/lib/inactive-lead-automation", () => ({ runInactiveLeadCheckOnLoad: vi.fn() }));

import {
  dailyPrioritiesQueryKey,
  dailyPrioritiesQueryOptions,
} from "@/hooks/use-daily-priorities-query";

const first = { items: [{ id: "first" }], failed: [] };
const second = { items: [{ id: "first" }, { id: "second" }], failed: [] };

beforeEach(() => fetchPriorities.mockReset());

describe("Today priorities loading", () => {
  it("deduplicates simultaneous loads for the same teacher and day", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolve!: (value: typeof first) => void;
    fetchPriorities.mockReturnValue(new Promise((done) => { resolve = done; }));
    const options = dailyPrioritiesQueryOptions("teacher", "2026-11-06");

    const a = client.fetchQuery(options);
    const b = client.fetchQuery(options);
    expect(fetchPriorities).toHaveBeenCalledTimes(1);
    resolve(first);
    await Promise.all([a, b]);
    expect(client.getQueryData(dailyPrioritiesQueryKey("teacher", "2026-11-06"))).toEqual(first);
    client.clear();
  });

  it("keeps cached priorities visible while remount revalidation refreshes them", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const options = dailyPrioritiesQueryOptions("teacher", "2026-11-06");
    fetchPriorities.mockResolvedValueOnce(first);
    await client.fetchQuery(options);

    let resolve!: (value: typeof second) => void;
    fetchPriorities.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const observer = new QueryObserver(client, options);
    const unsubscribe = observer.subscribe(() => undefined);
    const duringRefresh = observer.getCurrentResult();
    expect(duringRefresh.data).toEqual(first);
    expect(duringRefresh.isLoading).toBe(false);
    expect(duringRefresh.isFetching).toBe(true);

    resolve(second);
    await vi.waitFor(() => expect(observer.getCurrentResult().data).toEqual(second));
    expect(fetchPriorities).toHaveBeenCalledTimes(2);
    unsubscribe();
    client.clear();
  });

  it("does not share cached priorities between teachers or local days", () => {
    expect(dailyPrioritiesQueryKey("teacher-a", "2026-11-06")).not.toEqual(
      dailyPrioritiesQueryKey("teacher-b", "2026-11-06"),
    );
    expect(dailyPrioritiesQueryKey("teacher-a", "2026-11-06")).not.toEqual(
      dailyPrioritiesQueryKey("teacher-a", "2026-11-07"),
    );
  });
});

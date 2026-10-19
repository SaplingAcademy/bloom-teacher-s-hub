import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryObserver, QueryClientProvider } from "@tanstack/react-query";

const { fetchMetrics } = vi.hoisted(() => ({ fetchMetrics: vi.fn() }));
vi.mock("@/lib/dashboard-metrics", () => ({
  fetchDashboardMetrics: fetchMetrics,
  EMPTY_DASHBOARD_METRICS: { todayEvents: [] },
}));
import { useDashboardMetricsQuery } from "@/hooks/use-dashboard-query";

describe("Today navigation refresh", () => {
  it("reads updated saved lessons when remounted even within the five-minute cache window", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function Page() { useDashboardMetricsQuery("teacher"); return null; }
    renderToString(createElement(QueryClientProvider, { client }, createElement(Page)));
    const query = client.getQueryCache().find({ queryKey: ["dashboard-metrics", "teacher"] });
    if (!query) throw new Error("Today query missing");
    fetchMetrics.mockResolvedValueOnce({ todayEvents: [{ id: "one" }] });
    await client.fetchQuery(query.options);
    expect(client.getQueryData(["dashboard-metrics", "teacher"])).toEqual({ todayEvents: [{ id: "one" }] });
    fetchMetrics.mockResolvedValueOnce({ todayEvents: [{ id: "one" }, { id: "two" }, { id: "three" }] });
    const observer = new QueryObserver(client, query.options);
    const refreshed = new Promise<void>(resolve => {
      const unsubscribe = observer.subscribe(result => {
        if (!result.isFetching && result.isSuccess) { unsubscribe(); resolve(); }
      });
    });
    await refreshed;
    expect(fetchMetrics).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(["dashboard-metrics", "teacher"])).toEqual({ todayEvents: [{ id: "one" }, { id: "two" }, { id: "three" }] });
    client.clear();
  });
});
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { fetchDashboardMetrics, DashboardMetrics, EMPTY_DASHBOARD_METRICS } from "@/lib/dashboard-metrics";

export const DASHBOARD_METRICS_QUERY_KEY = (teacherId: string | undefined) => ["dashboard-metrics", teacherId];

export function useDashboardMetricsQuery(teacherId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery<DashboardMetrics>({
    queryKey: DASHBOARD_METRICS_QUERY_KEY(teacherId),
    queryFn: async (): Promise<DashboardMetrics> => {
      if (!teacherId) return EMPTY_DASHBOARD_METRICS;
      return fetchDashboardMetrics(teacherId);
    },
    enabled: Boolean(teacherId),
    staleTime: 5 * 60 * 1000, // 5 minutes stale time
    refetchOnMount: "always", // Read saved Calendar changes on every return to Today.
    gcTime: 10 * 60 * 1000,    // 10 minutes cache retention
  });

  const invalidateMetrics = useCallback(() => {
    if (teacherId) {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_METRICS_QUERY_KEY(teacherId) });
    }
  }, [queryClient, teacherId]);

  return {
    metrics: query.data || EMPTY_DASHBOARD_METRICS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    invalidateMetrics,
  };
}

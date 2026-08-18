import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    gcTime: 10 * 60 * 1000,    // 10 minutes cache retention
  });

  const invalidateMetrics = () => {
    if (teacherId) {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_METRICS_QUERY_KEY(teacherId) });
    }
  };

  return {
    metrics: query.data || EMPTY_DASHBOARD_METRICS,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    invalidateMetrics,
  };
}

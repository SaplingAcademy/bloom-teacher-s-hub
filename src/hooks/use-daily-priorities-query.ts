import { useEffect } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDailyPriorities } from "@/lib/daily-priorities";
import { runInactiveLeadCheckOnLoad } from "@/lib/inactive-lead-automation";
import { invalidateAfterFirstRead } from "@/lib/query-refresh";
import { formatLocalDateStr } from "@/lib/time-off-engine";

export const dailyPrioritiesQueryKey = (teacherId: string, day: string) =>
  ["daily-priorities", teacherId, day] as const;

export const dailyPrioritiesQueryOptions = (
  teacherId: string,
  day = formatLocalDateStr(new Date()),
) =>
  queryOptions({
    queryKey: dailyPrioritiesQueryKey(teacherId, day),
    queryFn: () => fetchDailyPriorities(teacherId),
    enabled: Boolean(teacherId),
    // Today explicitly revalidates on return; cached content stays visible meanwhile.
    refetchOnMount: "always",
  });

export function useDailyPrioritiesQuery(teacherId: string) {
  const queryClient = useQueryClient();
  const day = formatLocalDateStr(new Date());
  const query = useQuery(dailyPrioritiesQueryOptions(teacherId, day));

  useEffect(() => {
    if (!teacherId) return;
    let active = true;

    // Automation is secondary work: priority reads must not wait for its writes.
    void runInactiveLeadCheckOnLoad(teacherId)
      .then((result) => {
        // A newly created follow-up is read back without discarding visible data — also when the
        // automation finishes during the first read, which would otherwise absorb the refresh.
        if (active && result.processedCount > 0) {
          invalidateAfterFirstRead(queryClient, dailyPrioritiesQueryKey(teacherId, day));
        }
      })
      .catch((error) => {
        console.warn("[DailyPrioritiesCard] Inactivity check failed:", error);
      });

    return () => {
      active = false;
    };
  }, [day, queryClient, teacherId]);

  return query;
}

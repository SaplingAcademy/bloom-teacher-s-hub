import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { fetchAttentionQueue, type AttentionItem } from "@/lib/attention-queue";
import { runInactiveLeadCheckOnLoad } from "@/lib/inactive-lead-automation";

/** Teacher-scoped root of the Urgent block's cache (all languages). */
export const urgentQueueRootKey = (teacherId: string) => ["attention-queue", teacherId] as const;
export const urgentQueueQueryKey = (teacherId: string, lang: string) => [...urgentQueueRootKey(teacherId), lang] as const;

const onlyHighUrgency = (items: AttentionItem[]) => items.filter((item) => item.urgency === "high");

/**
 * Invalidates the Urgent cache so it reflects what the automation just wrote. A first read still in
 * flight (no data yet) would absorb the invalidation without reading again, so wait for it to finish.
 */
function readAgainAfterFirstRead(queryClient: QueryClient, teacherId: string) {
  const cache = queryClient.getQueryCache();
  const rootKey = urgentQueueRootKey(teacherId);
  const firstReadInFlight = () =>
    cache.findAll({ queryKey: rootKey }).some((q) => q.state.fetchStatus === "fetching" && q.state.data === undefined);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: rootKey });
  if (!firstReadInFlight()) return invalidate();
  const unsubscribe = cache.subscribe(() => {
    if (firstReadInFlight()) return;
    unsubscribe();
    invalidate();
  });
}

/**
 * Urgent block data. Cached per teacher/language and revalidated whenever the block mounts (returning
 * to Today), keeping the cached items visible meanwhile. The inactive-lead automation runs in the
 * background — the read never waits for its writes — and it is deduplicated by
 * runInactiveLeadCheckOnLoad, so Priorities and Urgent share one execution. When the automation
 * processed something, the queue is read again.
 */
export function useUrgentQueueQuery(teacherId: string, lang: "pt" | "en") {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: urgentQueueQueryKey(teacherId, lang),
    queryFn: () => fetchAttentionQueue(teacherId, lang),
    enabled: Boolean(teacherId),
    refetchOnMount: "always",
    select: onlyHighUrgency,
  });

  useEffect(() => {
    if (!teacherId) return;
    let active = true;
    void runInactiveLeadCheckOnLoad(teacherId)
      .then((result) => {
        if (active && (result?.processedCount ?? 0) > 0) readAgainAfterFirstRead(queryClient, teacherId);
      })
      .catch((error) => {
        console.warn("[UrgentWidget] Inactivity check failed:", error);
      });
    return () => {
      active = false;
    };
  }, [queryClient, teacherId]);

  return query;
}

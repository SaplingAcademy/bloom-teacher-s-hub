import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAttentionQueue, type AttentionItem } from "@/lib/attention-queue";
import { runInactiveLeadCheckOnLoad } from "@/lib/inactive-lead-automation";
import { invalidateAfterFirstRead } from "@/lib/query-refresh";

/** Teacher-scoped root of the Urgent block's cache (all languages). */
export const urgentQueueRootKey = (teacherId: string) => ["attention-queue", teacherId] as const;
export const urgentQueueQueryKey = (teacherId: string, lang: string) => [...urgentQueueRootKey(teacherId), lang] as const;

const onlyHighUrgency = (items: AttentionItem[]) => items.filter((item) => item.urgency === "high");

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
        if (active && (result?.processedCount ?? 0) > 0) invalidateAfterFirstRead(queryClient, urgentQueueRootKey(teacherId));
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

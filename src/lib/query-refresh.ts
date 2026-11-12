import type { QueryClient, QueryKey } from "@tanstack/react-query";

/**
 * Invalidates `queryKey` so it reflects a background write (e.g. the inactive-lead automation).
 * A first read still in flight (no data yet) would absorb a plain invalidation without reading
 * again — React Query dedupes onto it — and it may have started before the write. In that case,
 * wait for that read to finish and invalidate afterwards.
 */
export function invalidateAfterFirstRead(queryClient: QueryClient, queryKey: QueryKey): void {
  const cache = queryClient.getQueryCache();
  const firstReadInFlight = () =>
    cache.findAll({ queryKey }).some((q) => q.state.fetchStatus === "fetching" && q.state.data === undefined);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey });
  if (!firstReadInFlight()) return invalidate();
  const unsubscribe = cache.subscribe(() => {
    if (firstReadInFlight()) return;
    unsubscribe();
    invalidate();
  });
}

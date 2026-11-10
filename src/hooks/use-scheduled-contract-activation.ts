import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { activateDueScheduledContracts } from "@/lib/finance-engine";

/**
 * App-open fallback for scheduled contract renewals. Uses the same transactional RPC as
 * the automatic schedule; when something was activated, every cached read is refreshed
 * so Finance, Today and Growth see the agreement now in force.
 */
export function useScheduledContractActivation(teacherId: string | undefined) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!teacherId) return;
    let active = true;
    void activateDueScheduledContracts().then((count) => {
      if (active && count > 0) void queryClient.invalidateQueries();
    });
    return () => {
      active = false;
    };
  }, [teacherId, queryClient]);
}

import { useEffect, useRef, useState } from "react";
import { rescheduleOccurrence, type RescheduleResult, type RescheduleWarning } from "@/lib/reschedule-occurrence";

/** Both Calendar entry points confirm the same occurrence-specific validation warnings. */
export function useRescheduleConfirmation() {
  const [warnings, setWarnings] = useState<RescheduleWarning[]>([]);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);
  const busy = useRef(false);
  useEffect(() => () => { answer.current?.(false); }, []);

  const respond = (confirmed: boolean) => {
    const resolve = answer.current;
    answer.current = null;
    setWarnings([]);
    resolve?.(confirmed);
  };

  const request = async (eventId: string, date: string, startTime: string): Promise<RescheduleResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    try {
      const confirmedWarnings: RescheduleWarning[] = [];
      let result = await rescheduleOccurrence(eventId, date, startTime);
      while (!result.ok && result.warnings?.length) {
        const currentWarnings = result.warnings;
        const confirmed = await new Promise<boolean>((resolve) => {
          answer.current = resolve;
          setWarnings(currentWarnings);
        });
        if (!confirmed) return null;
        confirmedWarnings.push(...currentWarnings);
        // Re-read the occurrence and revalidate: locked statuses always remain blocks.
        result = await rescheduleOccurrence(eventId, date, startTime, { confirmedWarnings });
      }
      return result;
    } finally {
      busy.current = false;
    }
  };

  return { warnings, respond, request };
}
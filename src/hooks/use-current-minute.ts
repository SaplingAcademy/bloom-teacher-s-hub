import { useEffect, useState } from "react";

/** The current time, refreshed at every minute boundary (no page reload needed). */
export function useCurrentMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const tick = () => setNow(new Date());
    // Align to the next minute, then tick every minute.
    const timeout = setTimeout(() => { tick(); interval = setInterval(tick, 60_000); }, 60_000 - (Date.now() % 60_000));
    return () => { clearTimeout(timeout); if (interval) clearInterval(interval); };
  }, []);
  return now;
}

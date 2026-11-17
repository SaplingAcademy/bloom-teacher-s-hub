import { cn } from "@/lib/utils";

/**
 * Current-time indicator: a thin Bloom-green line with a small dot at its left end, placed at
 * `fraction` (0–1) of its hour row. Purely visual: it never catches clicks, drags or menus.
 */
export function CalendarNowLine({ fraction, className }: { fraction: number; className?: string }) {
  return (
    <div aria-hidden="true" data-calendar-now="" className={cn("pointer-events-none absolute z-[3] flex items-center", className)}
      style={{ top: `${fraction * 100}%` }}>
      <span data-calendar-now-dot="" className="-ml-1 h-2 w-2 shrink-0 -translate-y-1/2 rounded-full bg-primary" />
      <span className="h-0.5 flex-1 -translate-y-1/2 bg-primary" />
    </div>
  );
}

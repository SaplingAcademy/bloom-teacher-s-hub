import { useId, useState } from "react";
import { ArrowRight, CalendarClock, ChevronDown } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar-sync";
import { StatCard } from "@/components/bloom/StatCard";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

interface TodayLessonsCardProps {
  events: CalendarEvent[];
  loading: boolean;
  error: boolean;
  label: string;
  title: string;
  hint?: string;
  emptyLabel: string;
  errorLabel: string;
  calendarLabel: string;
  onOpenLesson: (eventId: string) => void;
  onOpenCalendar: () => void;
  compact?: boolean;
}

/**
 * "Aulas hoje" indicator. The whole card opens the Agenda. Today's lessons (the same
 * metrics.todayEvents used for the count, no extra reads) are shown in a floating panel:
 * on mouse hover/focus, and through the chevron button, which is the touch and keyboard path.
 * Both panels are portaled, so opening them never resizes the card or moves the layout.
 */
export function TodayLessonsCard({
  events, loading, error, label, title, hint, emptyLabel, errorLabel,
  calendarLabel, onOpenLesson, onOpenCalendar, compact = false,
}: TodayLessonsCardProps) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const titleId = useId();
  const hoverTitleId = useId();

  const list = (close: () => void) => (
    <ul aria-busy={loading} className="min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto overscroll-contain">
      {error ? (
        <li role="alert" className="px-4 py-5 text-sm text-destructive">{errorLabel}</li>
      ) : loading ? (
        <li role="status" aria-label={title} className="space-y-3 px-4 py-5">
          <span className="sr-only">{title}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Skeleton className="h-8 w-14 shrink-0" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            </div>
          ))}
        </li>
      ) : events.length === 0 ? (
        <li className="px-4 py-5 text-sm text-muted-foreground">{emptyLabel}</li>
      ) : events.map((event) => (
        <li key={event.id}>
          <Button
            type="button"
            variant="ghost"
            className="h-auto min-h-14 w-full justify-start gap-4 rounded-none px-4 py-2.5 text-left whitespace-normal hover:bg-secondary hover:text-secondary-foreground"
            onClick={() => {
              close();
              onOpenLesson(event.id);
            }}
          >
            <span className="flex w-14 shrink-0 flex-col gap-0.5 tabular-nums">
              <span className="font-display text-sm font-semibold">{event.startTime}</span>
              {(event.endTime || event.duration > 0) && (
                <span className="text-xs font-normal text-muted-foreground">
                  {event.endTime || `${event.duration}m`}
                </span>
              )}
            </span>
            <span className="min-w-0 flex-1 break-words text-sm font-semibold">{event.studentName}</span>
          </Button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative h-full min-w-0">
      <HoverCard open={hoverOpen && !listOpen} onOpenChange={setHoverOpen} openDelay={150} closeDelay={120}>
        <HoverCardTrigger asChild>
          <div className="h-full">
            <StatCard
              label={label}
              value={loading || error ? "—" : String(events.length)}
              icon={CalendarClock}
              tone="primary"
              hint={hint}
              compact={compact}
              onClick={onOpenCalendar}
            />
          </div>
        </HoverCardTrigger>
        <HoverCardContent
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={hoverTitleId}
          className="flex max-h-[min(22rem,var(--radix-hover-card-content-available-height))] w-80 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border-border p-0 shadow-[var(--shadow-lg)]"
        >
          <header className="shrink-0 border-b border-border px-4 py-2.5">
            <h2 id={hoverTitleId} className="font-display text-sm font-semibold">{title}</h2>
          </header>
          {list(() => setHoverOpen(false))}
        </HoverCardContent>
      </HoverCard>

      {/* Touch/keyboard path to the same list (hover is never required). */}
      <Popover open={listOpen} onOpenChange={setListOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={title}
            className="absolute right-2.5 top-2.5 grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 cursor-pointer"
          >
            <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${listOpen ? "rotate-180" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-labelledby={titleId}
          className="flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border-border p-0 shadow-[var(--shadow-lg)]"
        >
          <header className="shrink-0 border-b border-border px-4 py-3">
            <h2 id={titleId} className="font-display text-base font-semibold">{title}</h2>
          </header>
          {list(() => setListOpen(false))}
          <footer className="shrink-0 border-t border-border p-2">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between text-primary hover:bg-primary-soft hover:text-primary"
              onClick={() => {
                setListOpen(false);
                onOpenCalendar();
              }}
            >
              {calendarLabel}<ArrowRight aria-hidden="true" />
            </Button>
          </footer>
        </PopoverContent>
      </Popover>
    </div>
  );
}

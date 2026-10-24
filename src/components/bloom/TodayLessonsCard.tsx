import { useId, useState } from "react";
import { ArrowRight, CalendarClock, ChevronDown } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar-sync";
import { StatCard } from "@/components/bloom/StatCard";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
}

export function TodayLessonsCard({
  events, loading, error, label, title, hint, emptyLabel, errorLabel,
  calendarLabel, onOpenLesson, onOpenCalendar,
}: TodayLessonsCardProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="relative block h-full w-full rounded-2xl p-0 whitespace-normal text-left hover:bg-transparent [&_svg]:size-5 [&>div]:h-full [&>div]:transition-colors hover:[&>div]:bg-secondary/40"
        >
          <StatCard
            label={label}
            value={loading || error ? "—" : String(events.length)}
            icon={CalendarClock}
            tone="primary"
            hint={hint}
          />
          <ChevronDown aria-hidden="true" className={`absolute right-5 top-8 size-4! text-muted-foreground transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        aria-labelledby={titleId}
        className="flex max-h-[min(28rem,var(--radix-popover-content-available-height))] w-96 max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-xl border-border p-0 shadow-[var(--shadow-lg)]"
      >
        <header className="shrink-0 border-b border-border px-4 py-3">
          <h2 id={titleId} className="font-display text-base font-semibold">{title}</h2>
        </header>
        <ul aria-busy={loading} className="min-h-0 flex-1 divide-y divide-border/70 overflow-y-auto overscroll-contain">
          {error ? (
            <li role="alert" className="px-4 py-5 text-sm text-destructive">{errorLabel}</li>
          ) : loading ? (
            <li role="status" className="px-4 py-5 text-sm text-muted-foreground">…</li>
          ) : events.length === 0 ? (
            <li className="px-4 py-5 text-sm text-muted-foreground">{emptyLabel}</li>
          ) : events.map((event) => (
            <li key={event.id}>
              <Button
                type="button"
                variant="ghost"
                className="h-auto min-h-16 w-full justify-start gap-4 rounded-none px-4 py-3 text-left whitespace-normal hover:bg-secondary hover:text-secondary-foreground"
                onClick={() => {
                  setOpen(false);
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
        <footer className="shrink-0 border-t border-border p-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between text-primary hover:bg-primary-soft hover:text-primary"
            onClick={() => {
              setOpen(false);
              onOpenCalendar();
            }}
          >
            {calendarLabel}<ArrowRight aria-hidden="true" />
          </Button>
        </footer>
      </PopoverContent>
    </Popover>
  );
}
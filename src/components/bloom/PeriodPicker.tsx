import { useState } from "react";
import { CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { languageToLocale, t as translate, type Language } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface PeriodPickerProps {
  /** YYYY-MM for a month, YYYY for a full year, or current for the optional existing ledger view. */
  value: string;
  onChange: (value: string) => void;
  lang: Language;
  currentOptionLabel?: string;
}

export function PeriodPicker({ value, onChange, lang, currentOptionLabel }: PeriodPickerProps) {
  const now = new Date();
  const selectedYear = value === "current" ? now.getFullYear() : Number(value.slice(0, 4));
  const [year, setYear] = useState(selectedYear);
  const [open, setOpen] = useState(false);
  const t = (key: string) => translate(`financePeriod.${key}`, lang);
  const locale = languageToLocale(lang);
  const fullYear = value === String(year);
  const label = value === "current"
    ? currentOptionLabel
    : value.length === 4
      ? `${value} · ${t("fullYear")}`
      : new Date(selectedYear, Number(value.slice(5, 7)) - 1, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

  const select = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(next) => {
      if (next) setYear(selectedYear);
      setOpen(next);
    }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`${t("period")}: ${label}`}
          className="h-9 w-full justify-between rounded-xl text-xs font-medium shadow-none sm:w-60"
        >
          <CalendarDays className="text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left capitalize">{label}</span>
          <ChevronDown className="text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label={t("period")}
        className="w-72 max-w-[calc(100vw-2rem)] rounded-xl border-border p-3 shadow-[var(--shadow-lg)]"
      >
        <TooltipProvider delayDuration={250}>
          <div className="mb-3 flex items-center justify-between">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("previousYear")} onClick={() => setYear((previous) => previous - 1)}>
                  <ChevronLeft aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("previousYear")}</TooltipContent>
            </Tooltip>
            <span className="font-display text-base font-semibold tabular-nums" aria-live="polite">{year}</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label={t("nextYear")} onClick={() => setYear((previous) => previous + 1)}>
                  <ChevronRight aria-hidden="true" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("nextYear")}</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t("months")}>
          {Array.from({ length: 12 }, (_, month) => {
            const key = `${year}-${String(month + 1).padStart(2, "0")}`;
            const selected = value === key;
            const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
            const date = new Date(year, month, 1);
            return (
              <Button
                key={key}
                type="button"
                variant={selected ? "default" : "ghost"}
                aria-pressed={selected}
                aria-current={isCurrentMonth ? "date" : undefined}
                aria-label={date.toLocaleDateString(locale, { month: "long", year: "numeric" })}
                onClick={() => select(key)}
                className={cn("relative h-10 min-w-0 px-1 text-xs capitalize shadow-none", !selected && "text-foreground hover:bg-secondary hover:text-secondary-foreground")}
              >
                {date.toLocaleDateString(locale, { month: "short" }).replace(/\.$/, "")}
                {isCurrentMonth && !selected && <span aria-hidden="true" className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />}
              </Button>
            );
          })}
        </div>
        <div className="mt-3 space-y-1 border-t border-border pt-3">
          <Button
            type="button"
            variant={fullYear ? "secondary" : "ghost"}
            aria-pressed={fullYear}
            onClick={() => select(String(year))}
            className="h-9 w-full justify-start text-xs"
          >
            <CalendarRange className="text-muted-foreground" aria-hidden="true" />
            {t("fullYear")}
            {fullYear && <Check className="ml-auto text-primary" aria-hidden="true" />}
          </Button>
          {currentOptionLabel && (
            <Button
              type="button"
              variant={value === "current" ? "secondary" : "ghost"}
              aria-pressed={value === "current"}
              onClick={() => select("current")}
              className="h-9 w-full justify-start text-xs"
            >
              <CalendarDays className="text-muted-foreground" aria-hidden="true" />
              {currentOptionLabel}
              {value === "current" && <Check className="ml-auto text-primary" aria-hidden="true" />}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
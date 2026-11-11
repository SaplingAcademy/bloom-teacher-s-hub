import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { useCatalogOptions } from "@/hooks/use-catalog-options";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import { sortCatalogOptions, type CatalogCategory } from "@/lib/catalog-options";
import { LEAD_ACTIVITY_TYPES } from "@/lib/lead-tasks";
import {
  activeLeadFilterKeys,
  clearLeadFilter,
  countActiveLeadFilters,
  EMPTY_LEAD_FILTERS,
  isTaskFilterUnavailable,
  pendingContactAge,
  type LeadFilters,
} from "@/lib/lead-filters";
import type { Lead } from "@/lib/automation-engine";

const ALL = "__all__";
const SOURCES = [
  ["whatsapp", "sourceWhatsapp"],
  ["instagram", "sourceInstagram"],
  ["website", "sourceWebsite"],
  ["referral", "sourceReferral"],
  ["other", "sourceOther"],
] as const;

const LABEL_KEYS: Record<keyof LeadFilters, string> = {
  stage: "stage", contact: "contact", source: "source", campaign: "campaign", tag: "tag", language: "language",
  level: "level", focus: "focus", modality: "modality", createdFrom: "createdFrom", createdTo: "createdTo",
  valueMin: "valueMin", valueMax: "valueMax", tasks: "tasks", activityType: "activityType",
};

interface Props {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  stages: { id: string; labelKey: string }[];
  leads: Lead[];
  resultCount: number;
  hasSearch: boolean;
  onClearSearch: () => void;
  /** True when the pending-task read failed; task filters then show an explicit error instead of zero results. */
  tasksError: boolean;
  onRetryTasks: () => Promise<void> | void;
  /** Search input rendered at the start of the bar (name, e-mail, phone). */
  search: ReactNode;
  /** Kanban/Table switch rendered at the end of the bar. */
  viewToggle: ReactNode;
}

/**
 * Leads controls: search, a "Filtros" button that opens the grouped filter panel (floating, so the
 * Kanban never moves), the existing "no first contact" shortcut, results count and the view switch.
 * Below the bar only the active filters show, as removable chips. Filtering stays immediate and the
 * filter state lives in the page, so it survives switching between Kanban and Table.
 */
export function LeadFiltersBar({ filters, onChange, stages, leads, resultCount, hasSearch, onClearSearch, tasksError, onRetryTasks, search, viewToggle }: Props) {
  const { t, lang } = useLanguage();
  const { catalogOptions } = useCatalogOptions();
  const { languages, formatLanguageLabel } = useTeacherLanguages();
  const [open, setOpen] = useState(false);
  const F = (k: string) => t(`leadFilters.${k}`);
  const P = (k: string) => t(`leadPanel.${k}`);
  const set = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K]) => onChange({ ...filters, [k]: v });
  const active = countActiveLeadFilters(filters);

  const langs = Array.from(new Set([...languages, ...leads.map((l) => l.language_studied).filter((v): v is string => !!v)]));
  const sourceExtra = Array.from(new Set(leads.map((l) => l.source).filter((v): v is string => !!v && !SOURCES.some(([s]) => s === v))));
  const tags = Array.from(new Set(leads.flatMap((l) => l.tags ?? []))).sort((a, b) => a.localeCompare(b, lang));

  const stageItems = stages.map((s) => ({ value: s.id, label: t(s.labelKey) }));
  const sourceItems = [...SOURCES.map(([v, k]) => ({ value: v, label: P(k) })), ...sourceExtra.map((v) => ({ value: v, label: v }))];
  const tagItems = tags.map((v) => ({ value: v, label: v }));
  const languageItems = langs.map((v) => ({ value: v, label: formatLanguageLabel(v, lang) }));
  const catalogItems = (cat: CatalogCategory) =>
    catalogOptions ? sortCatalogOptions(catalogOptions[cat] as any[]).map((o: any) => ({ value: o.id, label: o.label })) : [];
  const activityItems = LEAD_ACTIVITY_TYPES.map((v) => ({ value: v, label: t(`leadTasks.types.${v}`) }));

  const pick = (id: string, key: keyof LeadFilters, items: { value: string; label: string }[], allLabel = F("all")) => (
    <Select value={(filters[key] as string) || ALL} onValueChange={(v) => set(key, (v === ALL ? EMPTY_LEAD_FILTERS[key] : v) as any)}>
      <SelectTrigger id={id} className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const taskResultsUnavailable = isTaskFilterUnavailable(tasksError, filters.tasks, filters.activityType);
  const [retryingTasks, setRetryingTasks] = useState(false);
  const handleRetryTasks = async () => {
    if (retryingTasks) return;
    setRetryingTasks(true);
    try {
      await onRetryTasks();
    } finally {
      setRetryingTasks(false);
    }
  };
  const retryTasksButton = (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
      onClick={handleRetryTasks}
      disabled={retryingTasks}
    >
      <RefreshCw className={`w-3 h-3 ${retryingTasks ? "animate-spin" : ""}`} /> {F("tasksRetry")}
    </Button>
  );
  const field = (id: string, label: string, control: ReactNode) => (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {control}
    </div>
  );
  const group = (title: string, children: ReactNode) => (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );

  // Human-readable value for an active-filter chip (same option labels as the panel).
  const labelOf = (items: { value: string; label: string }[], value: string) => items.find((i) => i.value === value)?.label ?? value;
  const fmtDate = (ymd: string) => {
    const [y, m, d] = ymd.split("-");
    return y && m && d ? (lang === "en" ? `${m}/${d}/${y}` : `${d}/${m}/${y}`) : ymd;
  };
  const chipValue = (key: keyof LeadFilters): string => {
    const v = filters[key] as string;
    switch (key) {
      case "stage": return labelOf(stageItems, v);
      case "contact": return v === "pending" ? P("contactPending") : P("contactDone");
      case "source": return labelOf(sourceItems, v);
      case "tag": return v;
      case "language": return labelOf(languageItems, v);
      case "level": return labelOf(catalogItems("levels"), v);
      case "focus": return labelOf(catalogItems("focuses"), v);
      case "modality": return labelOf(catalogItems("modalities"), v);
      case "createdFrom":
      case "createdTo": return fmtDate(v);
      case "tasks": return v === "overdue" ? F("tasksOverdue") : F("tasksPending");
      case "activityType": return labelOf(activityItems, v);
      default: return v;
    }
  };
  const activeKeys = activeLeadFilterKeys(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="w-full sm:w-80">{search}</div>
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" aria-haspopup="dialog">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> {F("filters")}
                  {active > 0 && <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px]">{active}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                sideOffset={8}
                collisionPadding={12}
                aria-label={F("filters")}
                className="flex max-h-[min(36rem,var(--radix-popover-content-available-height))] w-[min(46rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl p-0 shadow-[var(--shadow-lg)]"
              >
                <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <h2 className="font-display text-base font-semibold">{F("filters")}</h2>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={F("close")} onClick={() => setOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </header>
                <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4">
                  {group(F("groupFollowUp"), <>
                    {field("f-stage", F("stage"), pick("f-stage", "stage", stageItems))}
                    {field("f-contact", F("contact"), (
                      <Select value={filters.contact} onValueChange={(v) => set("contact", v as LeadFilters["contact"])}>
                        <SelectTrigger id="f-contact" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{F("all")}</SelectItem>
                          <SelectItem value="pending">{P("contactPending")}</SelectItem>
                          <SelectItem value="done">{P("contactDone")}</SelectItem>
                        </SelectContent>
                      </Select>
                    ))}
                    {field("f-tasks", F("tasks"), (
                      <>
                        <Select value={filters.tasks} onValueChange={(v) => set("tasks", v as LeadFilters["tasks"])}>
                          <SelectTrigger id="f-tasks" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">{F("all")}</SelectItem>
                            <SelectItem value="pending">{F("tasksPending")}</SelectItem>
                            <SelectItem value="overdue">{F("tasksOverdue")}</SelectItem>
                          </SelectContent>
                        </Select>
                        {tasksError && (
                          <div className="flex items-center gap-1 flex-wrap" role="alert">
                            <p className="text-[11px] text-destructive m-0">{F("tasksError")}</p>
                            {retryTasksButton}
                          </div>
                        )}
                      </>
                    ))}
                    {field("f-activity", F("activityType"), pick("f-activity", "activityType", activityItems))}
                  </>)}
                  {group(F("groupProfile"), <>
                    {field("f-source", F("source"), pick("f-source", "source", sourceItems))}
                    {field("f-campaign", F("campaign"), (
                      <Input id="f-campaign" className="h-9 text-sm" value={filters.campaign} onChange={(e) => set("campaign", e.target.value)} />
                    ))}
                    {field("f-tag", F("tag"), pick("f-tag", "tag", tagItems))}
                    {field("f-language", F("language"), pick("f-language", "language", languageItems))}
                    {field("f-level", F("level"), pick("f-level", "level", catalogItems("levels")))}
                    {field("f-focus", F("focus"), pick("f-focus", "focus", catalogItems("focuses")))}
                    {field("f-modality", F("modality"), pick("f-modality", "modality", catalogItems("modalities")))}
                  </>)}
                  {group(F("groupDatesValues"), <>
                    {field("f-from", F("createdFrom"), (
                      <Input id="f-from" type="date" className="h-9 text-sm" value={filters.createdFrom} onChange={(e) => set("createdFrom", e.target.value)} />
                    ))}
                    {field("f-to", F("createdTo"), (
                      <Input id="f-to" type="date" className="h-9 text-sm" value={filters.createdTo} onChange={(e) => set("createdTo", e.target.value)} />
                    ))}
                    {field("f-min", F("valueMin"), (
                      <Input id="f-min" inputMode="decimal" className="h-9 text-sm" value={filters.valueMin} onChange={(e) => set("valueMin", e.target.value)} />
                    ))}
                    {field("f-max", F("valueMax"), (
                      <Input id="f-max" inputMode="decimal" className="h-9 text-sm" value={filters.valueMax} onChange={(e) => set("valueMax", e.target.value)} />
                    ))}
                  </>)}
                </div>
                <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2.5">
                  <Button variant="ghost" size="sm" className="h-8 gap-1" disabled={active === 0} onClick={() => onChange(EMPTY_LEAD_FILTERS)}>
                    <X className="w-3.5 h-3.5" /> {F("clearFilters")}
                  </Button>
                  <Button variant="secondary" size="sm" className="h-8" onClick={() => setOpen(false)}>{F("close")}</Button>
                </footer>
              </PopoverContent>
            </Popover>
            <Button
              variant={filters.contact === "pending" ? "secondary" : "ghost"}
              size="sm"
              className="h-9 gap-1.5"
              aria-pressed={filters.contact === "pending"}
              onClick={() => set("contact", filters.contact === "pending" ? "all" : "pending")}
            >
              <Clock className="w-3.5 h-3.5" /> {F("onlyPending")}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {resultCount === 1 ? F("oneFound") : F("manyFound").replace("{count}", String(resultCount))}
          </span>
          {viewToggle}
        </div>
      </div>

      {(activeKeys.length > 0 || hasSearch) && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={F("activeFilters")}>
          {activeKeys.map((key) => {
            const label = `${F(LABEL_KEYS[key])}: ${chipValue(key)}`;
            return (
              <span key={key} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs text-foreground">
                <span className="truncate">{label}</span>
                <button
                  type="button"
                  aria-label={F("removeFilter").replace("{label}", label)}
                  onClick={() => onChange(clearLeadFilter(filters, key))}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => { onChange(EMPTY_LEAD_FILTERS); onClearSearch(); }}>
            <X className="w-3 h-3" /> {F("clearAll")}
          </Button>
        </div>
      )}

      {taskResultsUnavailable && (
        <div
          className="flex items-center justify-between gap-2 border border-destructive/30 bg-destructive/5 text-destructive rounded-lg px-3 py-2"
          role="alert"
        >
          <p className="text-xs m-0">{F("tasksErrorBanner")}</p>
          {retryTasksButton}
        </div>
      )}
    </div>
  );
}

/** Discreet "no first contact yet" indicator shared by Kanban and Table. */
export function PendingContactBadge({ lead, now }: { lead: Lead; now: Date }) {
  const { t } = useLanguage();
  const age = pendingContactAge(lead, now);
  if (!age && lead.contacted_at) return null;
  if (!lead.contacted_at && !age) {
    return <Badge variant="outline" className="text-[10px] gap-1 border-accent/40 text-accent-foreground"><Clock className="w-3 h-3" />{t("leadPanel.contactPending")}</Badge>;
  }
  const elapsed = age!.days >= 1
    ? t("leadFilters.daysAgo").replace("{count}", String(age!.days))
    : t("leadFilters.hoursAgo").replace("{count}", String(age!.hours));
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-accent/40 bg-accent/10 text-foreground">
      <Clock className="w-3 h-3" /> {t("leadPanel.contactPending")} · {elapsed}
    </Badge>
  );
}

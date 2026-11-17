import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  House,
  CreditCard,
  ExternalLink,
  FileClock,
  UserPlus,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type {
  DailyPriorityCategory,
  DailyPriorityItem,
  DailyPriorityUrgency,
} from "@/lib/daily-priorities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { refreshTodayQueues } from "@/hooks/use-urgent-queue-query";
import { InfoTooltip } from "@/components/bloom/InfoTooltip";
import { ExpandPanelButton } from "@/components/bloom/ExpandPanelButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDailyPrioritiesQuery } from "@/hooks/use-daily-priorities-query";
import { PriorityResolutionPanel, isInlineResolvable } from "@/components/bloom/PriorityResolutionPanel";
import { PriorityModuleActions, moduleActionFor, type PriorityModuleAction } from "@/components/bloom/PriorityModuleActions";
import { useInvalidateFinanceData } from "@/hooks/use-finance-query";

interface DailyPrioritiesCardProps {
  teacherId: string;
}

type CategoryFilter = "all" | DailyPriorityCategory;

const CATEGORY_META: Record<
  DailyPriorityCategory,
  { labelKey: string; icon: typeof CalendarCheck; badgeClass: string }
> = {
  attendance: {
    labelKey: "today.filterAttendance",
    icon: CalendarCheck,
    badgeClass: "bg-sky-100 text-sky-900 border-sky-200/80",
  },
  payment: {
    labelKey: "today.filterPayments",
    icon: CreditCard,
    badgeClass: "bg-amber-100 text-amber-900 border-amber-200/80",
  },
  contract: {
    labelKey: "today.filterContracts",
    icon: FileClock,
    badgeClass: "bg-rose-100 text-rose-900 border-rose-200/80",
  },
  task: {
    labelKey: "today.filterTasks",
    icon: House,
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200/80",
  },
  lead: {
    labelKey: "today.filterLeads",
    icon: UserPlus,
    badgeClass: "bg-purple-100 text-purple-900 border-purple-200/80",
  },
};

const CATEGORY_ORDER: DailyPriorityCategory[] = ["attendance", "payment", "contract", "task", "lead"];

/** Kanban columns (same urgency groups as the compact list); undated items get their own section. */
const KANBAN_COLUMNS: { key: DailyPriorityUrgency; labelKey: string }[] = [
  { key: "critical", labelKey: "today.kanbanOverdue" },
  { key: "today", labelKey: "today.kanbanToday" },
  { key: "upcoming", labelKey: "today.kanbanUpcoming" },
];

const URGENCY_SECTIONS: { key: DailyPriorityUrgency; labelKey: string }[] = [
  { key: "critical", labelKey: "today.urgencyCritical" },
  { key: "today", labelKey: "today.urgencyToday" },
  { key: "upcoming", labelKey: "today.urgencyUpcoming" },
  { key: "stale", labelKey: "today.urgencyStale" },
];

function fill(template: string, params: Record<string, string | number>): string {
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    template
  );
}

export function DailyPrioritiesCard({ teacherId }: DailyPrioritiesCardProps) {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const queryClient = useQueryClient();
  // After a successful inline save, re-read priorities from their sources; only items
  // whose condition is really resolved disappear, and counters follow automatically.
  // The Urgent block reads the same sources (attendance, tasks, leads, payments): one shared refresh.
  const refreshPriorities = () => refreshTodayQueues(queryClient, teacherId);
  // Leads, Contracts and Payments open their module's existing component in place.
  const [moduleAction, setModuleAction] = useState<PriorityModuleAction | null>(null);
  const invalidateFinanceData = useInvalidateFinanceData(teacherId);
  const handleModuleSaved = (kind: PriorityModuleAction["kind"]) => {
    if (kind !== "lead") invalidateFinanceData();
    void refreshPriorities();
  };
  const { data, isLoading: loading, isError } = useDailyPrioritiesQuery(teacherId);
  const items = data?.items ?? [];
  const failed = isError ? CATEGORY_ORDER : (data?.failed ?? []);

  const locale = lang === "pt" ? "pt-BR" : "en-US";

  const formatDate = (ymd: string | null | undefined): string => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    if (!y || !m || !d) return ymd;
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
    });
  };

  const formatAmount = (cents: number): string =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" }).format(cents / 100);

  // Reason codes + raw params -> localized, human-readable context line.
  const describeItem = (item: DailyPriorityItem, underTodayHeading = false): string => {
    const p = item.params;
    const date = formatDate(typeof p.date === "string" ? p.date : undefined);
    const dueDate = formatDate(typeof p.dueDate === "string" ? p.dueDate : undefined);
    const endDate = formatDate(typeof p.endDate === "string" ? p.endDate : undefined);
    const since = formatDate(typeof p.since === "string" ? p.since : undefined);
    const vars: Record<string, string | number> = {
      ...p,
      date,
      dueDate,
      endDate,
      since,
      time: p.time || "",
      amount: formatAmount(Number(p.amountCents || 0)),
    };
    // Under the "Hoje" heading, "vence hoje" only repeats the group: keep just the extra context.
    if (underTodayHeading) {
      const todayKey = `today.reasonUnderToday.${item.reason}`;
      const underToday = t(todayKey);
      if (underToday !== todayKey) return fill(underToday, vars);
    }
    // The date (and time) is already shown once, next to the category: use the dateless wording.
    const compactKey = `today.reasonCompact.${item.reason}`;
    const compact = item.date ? t(compactKey) : compactKey;
    return fill(compact !== compactKey ? compact : t(`today.reason.${item.reason}`), vars);
  };

  const counts = useMemo(() => {
    const map = new Map<DailyPriorityCategory, number>();
    for (const item of items) map.set(item.category, (map.get(item.category) || 0) + 1);
    return map;
  }, [items]);

  const visibleItems = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.category === filter)),
    [items, filter]
  );

  const grouped = useMemo(() => {
    const map = new Map<DailyPriorityUrgency, DailyPriorityItem[]>();
    for (const item of visibleItems) {
      const list = map.get(item.urgency) || [];
      list.push(item);
      map.set(item.urgency, list);
    }
    return map;
  }, [visibleItems]);

  const handleItemClick = (item: DailyPriorityItem) => {
    navigate({
      to: item.action.route as any,
      search: item.action.params as any,
    });
  };

  const renderRow = (item: DailyPriorityItem, underTodayHeading = false, card = false) => {
    const description = describeItem(item, underTodayHeading);
    const meta = CATEGORY_META[item.category];
    const Icon = meta.icon;
    const resolvable = isInlineResolvable(item);
    // The compact list and the Kanban expand independently (one inline panel at a time per view).
    const expandKey = card ? `kanban:${item.id}` : item.id;
    const expanded = resolvable && expandedId === expandKey;
    const moduleTarget = resolvable ? null : moduleActionFor(item);
    const activate = () => {
      if (resolvable) setExpandedId(expanded ? null : expandKey);
      else if (moduleTarget) setModuleAction(moduleTarget);
      else handleItemClick(item);
    };
    return (
      <li key={item.id} data-priority-item={item.id} className={card ? "rounded-lg border border-stone-200/80 bg-white" : "py-1 first:pt-0 last:pb-0"}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={resolvable ? expanded : undefined}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          activate();
        }}
        className={`group flex items-start gap-3 ${card ? "p-3 rounded-lg [&_h4]:text-sm" : "py-2 px-2 sm:px-3 rounded-xl"} hover:bg-stone-50 transition-all cursor-pointer border border-transparent hover:border-stone-200/60 select-none`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] py-0.5 px-2 font-bold rounded-md flex items-center gap-1.5 border ${meta.badgeClass}`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{t(meta.labelKey)}</span>
            </Badge>
            {item.date && (
              <span className="text-[11px] font-semibold text-stone-400">
                {formatDate(item.date)}
                {item.time ? ` · ${item.time.slice(0, 5)}` : ""}
              </span>
            )}
          </div>
          <h4 className="break-words text-xs sm:text-sm font-bold text-stone-900 group-hover:text-emerald-950 transition-colors leading-snug">
            {item.title}
          </h4>
          {description && (
            <p className="break-words text-[11px] font-medium text-stone-500 leading-snug">
              {description}
            </p>
          )}
        </div>
        <div className="shrink-0 text-stone-400 group-hover:text-stone-700 transition-colors pt-1">
          {resolvable ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold">
              <span className="hidden sm:inline">{expanded ? t("today.resolve.collapse") : t("today.resolve.expand")}</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </span>
          ) : moduleTarget ? (
            <span className="flex items-center text-[11px] font-semibold">{t("today.resolve.expand")}</span>
          ) : (
            <ExternalLink className="h-4 w-4" />
          )}
        </div>
      </div>
      {expanded && (
        <div className="mx-3 mb-3 space-y-3 rounded-xl border border-stone-200 bg-white p-3">
          <PriorityResolutionPanel
            teacherId={teacherId}
            item={item}
            onSaved={async () => {
              await refreshPriorities();
            }}
          />
          <button
            type="button"
            onClick={() => handleItemClick(item)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-800"
          >
            <ExternalLink className="h-3.5 w-3.5" /> {t("today.resolve.openModule")}
          </button>
        </div>
      )}
      </li>
    );
  };

  // A Leads load failure stays in the internal log (fetchDailyPriorities) but is not shown in the
  // notice; it still prevents "all caught up"/"no items" states that would claim leads were checked.
  const leadsFailed = failed.includes("lead");
  const noticeFailed = failed.filter((c) => c !== "lead");
  const isEmpty = !loading && items.length === 0 && !leadsFailed;

  // Category filter chips (local filtering, no refetch); the same filter drives the compact list and the Kanban.
  const renderFilters = (tone: "dark" | "light") => {
    const chip = tone === "dark"
      ? { active: "border-sidebar-accent-foreground bg-sidebar-accent-foreground text-sidebar hover:bg-sidebar-accent-foreground/90 hover:text-sidebar",
          idle: "border-sidebar-border bg-sidebar-accent/60 text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          badgeActive: "bg-sidebar/10 text-sidebar", badgeIdle: "bg-sidebar-foreground/10 text-sidebar-foreground" }
      : { active: "border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground",
          idle: "border-border/70 bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          badgeActive: "bg-primary-foreground/15 text-primary-foreground", badgeIdle: "bg-muted text-foreground" };
    return (
        <div className={`flex flex-wrap items-center gap-1.5 ${tone === "dark" ? "mt-3" : ""}`} data-testid={`priorities-filters-${tone}`}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            className={`h-auto gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-none ${
              filter === "all"
                ? chip.active
                : chip.idle
            }`}
          >
            {t("today.filterAll")}
            <span
              className={`text-[10px] font-extrabold rounded-full px-1.5 py-px ${
                filter === "all" ? chip.badgeActive : chip.badgeIdle
              }`}
            >
              {items.length}
            </span>
          </Button>
          {CATEGORY_ORDER.map((cat) => {
            const meta = CATEGORY_META[cat];
            const Icon = meta.icon;
            const isFailed = failed.includes(cat);
            const count = counts.get(cat) || 0;
            return (
              <Button
                key={cat}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={filter === cat}
                onClick={() => setFilter(cat)}
                className={`h-auto gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-none ${
                  filter === cat
                    ? chip.active
                    : chip.idle
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(meta.labelKey)}
                {isFailed ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={t("today.categoryLoadError").replace("{categories}", t(meta.labelKey))} />
                ) : (
                  <span
                    className={`text-[10px] font-extrabold rounded-full px-1.5 py-px ${
                      filter === cat ? chip.badgeActive : chip.badgeIdle
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
    );
  };

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white p-4 sm:p-5 shadow-sm font-figtree transition-all xl:h-full">
      {/* Forest header + filters area; priority content stays on the white card surface */}
      <div className="-mx-4 sm:-mx-5 -mt-4 sm:-mt-5 rounded-t-2xl border-b border-sidebar-border bg-sidebar px-4 sm:px-5 pt-4 sm:pt-5 pb-3 sm:pb-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 sm:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words font-outfit text-xl font-extrabold text-sidebar-accent-foreground">
              {t("today.prioritiesTitle")}
            </h2>
            {/* The former fixed subtitle now lives in this tooltip (hover, focus or tap). */}
            <InfoTooltip
              label={t("today.prioritiesInfoLabel")}
              text={t("today.prioritiesSubtitle")}
              className="-ml-1 text-sidebar-accent-foreground"
            />
          </div>
        </div>
        <ExpandPanelButton label={t("today.expandPriorities")} onClick={() => setKanbanOpen(true)}
          className="self-end text-sidebar-accent-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground sm:self-auto" />
      </div>

      {!loading && renderFilters("dark")}
      </div>

      {/* White list area below the tinted header */}
      <div className="mt-4 space-y-4">
      {/* Per-category failure notice (never shown as zero priorities) */}
      {noticeFailed.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px text-amber-600" />
          <p className="text-xs font-medium leading-relaxed">
            {t("today.categoryLoadError").replace(
              "{categories}",
              noticeFailed.map((c) => t(CATEGORY_META[c].labelKey)).join(", ")
            )}
          </p>
        </div>
      )}

      {/* Scrollable list area: grows with the content up to a fixed height, then scrolls inside the
          card while the forest header, filters and card borders stay in place. */}
      <div
        data-testid="priorities-scroll"
        className="-mx-1.5 max-h-[22rem] min-h-0 space-y-3 overflow-y-auto overscroll-contain px-1.5"
      >
      {/* Loading */}
      {loading && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-stone-100/80 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3.5 text-emerald-900 animate-in fade-in duration-300">
          <div className="h-10 w-10 rounded-xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center shrink-0 shadow-inner">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-outfit font-extrabold text-sm text-emerald-950">
              {t("today.emptyAllCaughtUp")}
            </h4>
            <p className="text-xs text-emerald-700 font-medium leading-relaxed">
              {t("today.emptyAllCaughtUpSubtitle")}
            </p>
          </div>
        </div>
      )}

      {/* Priority list: grouped by urgency in "Todas", flat sorted list per category */}
      {!loading && visibleItems.length > 0 && filter === "all" && (
        <div className="space-y-3">
          {URGENCY_SECTIONS.filter((section) => (grouped.get(section.key) || []).length > 0).map((section, index) => {
            const sectionItems = grouped.get(section.key) || [];
            return (
              // A soft line separates groups when something comes before; items keep their own dividers
              // and the last item of a group has none, so lines never double up.
              <div key={section.key} data-urgency-section={section.key} className={index > 0 ? "border-t border-stone-200/60 pt-3" : undefined}>
                {/* Critical items lead the list without a heading (urgency has its own classification). */}
                {section.key !== "critical" && (
                  <p className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider px-1 pb-1">
                    {t(section.labelKey)}
                  </p>
                )}
                <ul className="divide-y divide-stone-200/60">{sectionItems.map((item) => renderRow(item, section.key === "today"))}</ul>
              </div>
            );
          })}
        </div>
      )}
      {!loading && visibleItems.length > 0 && filter !== "all" && (
        <ul className="divide-y divide-stone-200/60">{visibleItems.map((item) => renderRow(item))}</ul>
      )}
      {!loading && visibleItems.length === 0 && !isEmpty && filter !== "all" && !(filter === "lead" && leadsFailed) && (
        <p className="text-xs font-medium text-stone-500 text-center py-2">
          {t("today.noCategoryItems")}
        </p>
      )}
      </div>
      </div>
      {/* Kanban: a larger view of the same items (same query, filter and resolution flows). No dragging. */}
      <Dialog open={kanbanOpen} onOpenChange={setKanbanOpen}>
        <DialogContent closeLabel={t("common.close")} data-testid="priorities-kanban"
          className="flex h-[min(88dvh,860px)] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-xl p-0">
          <DialogHeader className="space-y-3 border-b border-border px-4 py-4 text-left sm:px-5">
            <DialogTitle className="pr-8 font-outfit text-lg font-extrabold">{t("today.prioritiesTitle")}</DialogTitle>
            <DialogDescription className="sr-only">{t("today.prioritiesSubtitle")}</DialogDescription>
            {!loading && renderFilters("light")}
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
            <div className="flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-contain md:grid md:snap-none md:grid-cols-3 md:overflow-x-visible">
              {KANBAN_COLUMNS.map((column) => {
                const columnItems = grouped.get(column.key) || [];
                return (
                  <section key={column.key} data-kanban-column={column.key} aria-label={t(column.labelKey)}
                    className="flex min-h-0 w-[85%] shrink-0 snap-start flex-col rounded-lg border border-stone-200/80 bg-stone-50/60 md:w-auto">
                    <header className="flex items-center justify-between border-b border-stone-200/70 px-3 py-2.5">
                      <h3 className="text-sm font-bold text-foreground">{t(column.labelKey)}</h3>
                      <span data-kanban-count="" className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground">{columnItems.length}</span>
                    </header>
                    <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-2">
                      {columnItems.length === 0
                        ? <li className="px-1 py-6 text-center text-xs text-muted-foreground">{t("today.kanbanEmpty")}</li>
                        : columnItems.map((item) => renderRow(item, column.key === "today", true))}
                    </ul>
                  </section>
                );
              })}
            </div>
            {(grouped.get("stale") || []).length > 0 && (
              <section data-kanban-column="stale" aria-label={t("today.urgencyStale")} className="flex max-h-[30%] shrink-0 flex-col rounded-lg border border-stone-200/80 bg-stone-50/60">
                <header className="flex items-center justify-between border-b border-stone-200/70 px-3 py-2">
                  <h3 className="text-sm font-bold text-foreground">{t("today.urgencyStale")}</h3>
                  <span data-kanban-count="" className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold tabular-nums text-foreground">{(grouped.get("stale") || []).length}</span>
                </header>
                <ul className="grid min-h-0 gap-2 overflow-y-auto overscroll-contain p-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(grouped.get("stale") || []).map((item) => renderRow(item, false, true))}
                </ul>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {moduleAction && (
        <PriorityModuleActions
          key={JSON.stringify(moduleAction)}
          teacherId={teacherId}
          action={moduleAction}
          onClose={() => setModuleAction(null)}
          onSaved={handleModuleSaved}
        />
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  ExternalLink,
  FileClock,
  UserPlus,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import {
  DailyPriorityCategory,
  DailyPriorityItem,
  DailyPriorityUrgency,
  fetchDailyPriorities,
} from "@/lib/daily-priorities";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
    icon: ClipboardList,
    badgeClass: "bg-emerald-100 text-emerald-900 border-emerald-200/80",
  },
  lead: {
    labelKey: "today.filterLeads",
    icon: UserPlus,
    badgeClass: "bg-purple-100 text-purple-900 border-purple-200/80",
  },
};

const CATEGORY_ORDER: DailyPriorityCategory[] = ["attendance", "payment", "contract", "task", "lead"];

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
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DailyPriorityItem[]>([]);
  const [failed, setFailed] = useState<DailyPriorityCategory[]>([]);
  const [filter, setFilter] = useState<CategoryFilter>("all");

  const loadPriorities = async () => {
    if (!teacherId) return;
    try {
      const res = await fetchDailyPriorities(teacherId, new Date());
      setItems(res.items);
      setFailed(res.failed);
    } catch (err) {
      console.error("[DailyPrioritiesCard] Error loading priorities:", err);
      setFailed(CATEGORY_ORDER);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriorities();
  }, [teacherId]);

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
  const describeItem = (item: DailyPriorityItem): string => {
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
    return fill(t(`today.reason.${item.reason}`), vars);
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

  const renderRow = (item: DailyPriorityItem) => {
    const meta = CATEGORY_META[item.category];
    const Icon = meta.icon;
    return (
      <li
        key={item.id}
        onClick={() => handleItemClick(item)}
        className="group flex items-start gap-3.5 py-3 px-3 rounded-xl hover:bg-stone-50 transition-all cursor-pointer border border-transparent hover:border-stone-200/60 select-none"
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
          <h4 className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-emerald-950 transition-colors leading-snug">
            {item.title}
          </h4>
          <p className="text-[11px] font-medium text-stone-500 leading-tight">
            {describeItem(item)}
          </p>
        </div>
        <div className="shrink-0 text-stone-400 group-hover:text-stone-700 transition-colors pt-1">
          <ExternalLink className="h-4 w-4" />
        </div>
      </li>
    );
  };

  const isEmpty = !loading && items.length === 0;

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 sm:p-6 shadow-sm font-figtree transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-outfit text-xl font-extrabold text-[#163020]">
              {t("today.prioritiesTitle")}
            </h2>
            {!loading && items.length > 0 && (
              <Badge className="bg-stone-100 text-stone-700 border-stone-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {items.length === 1
                  ? t("today.priorityCountSingular").replace("{count}", "1")
                  : t("today.priorityCount").replace("{count}", String(items.length))}
              </Badge>
            )}
          </div>
          <p className="text-xs text-stone-500 font-medium mt-0.5">
            {t("today.prioritiesSubtitle")}
          </p>
        </div>
      </div>

      {/* Category filter chips (local filtering, no refetch) */}
      {!loading && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
            className={`h-auto gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-none ${
              filter === "all"
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground"
                : "bg-card text-muted-foreground border-border hover:bg-card hover:text-foreground"
            }`}
          >
            {t("today.filterAll")}
            <span
              className={`text-[10px] font-extrabold rounded-full px-1.5 py-px ${
                filter === "all" ? "bg-primary-foreground/10 text-primary-foreground" : "bg-muted text-muted-foreground"
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
                    ? "bg-primary text-primary-foreground border-primary hover:bg-primary hover:text-primary-foreground"
                    : "bg-card text-muted-foreground border-border hover:bg-card hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(meta.labelKey)}
                {isFailed ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={t("today.categoryLoadError").replace("{categories}", t(meta.labelKey))} />
                ) : (
                  <span
                    className={`text-[10px] font-extrabold rounded-full px-1.5 py-px ${
                      filter === cat ? "bg-primary-foreground/10 text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      )}

      {/* Per-category failure notice (never shown as zero priorities) */}
      {failed.length > 0 && (
        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3.5 py-2.5 text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-px text-amber-600" />
          <p className="text-xs font-medium leading-relaxed">
            {t("today.categoryLoadError").replace(
              "{categories}",
              failed.map((c) => t(CATEGORY_META[c].labelKey)).join(", ")
            )}
          </p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-5 space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-stone-100/80 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="mt-5 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3.5 text-emerald-900 animate-in fade-in duration-300">
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
        <div className="mt-4 space-y-4">
          {URGENCY_SECTIONS.map((section) => {
            const sectionItems = grouped.get(section.key) || [];
            if (sectionItems.length === 0) return null;
            return (
              <div key={section.key}>
                <p className="text-[11px] font-extrabold text-stone-400 uppercase tracking-wider px-1 pb-1">
                  {t(section.labelKey)}
                </p>
                <ul className="divide-y divide-stone-100">{sectionItems.map(renderRow)}</ul>
              </div>
            );
          })}
        </div>
      )}
      {!loading && visibleItems.length > 0 && filter !== "all" && (
        <ul className="mt-4 divide-y divide-stone-100">{visibleItems.map(renderRow)}</ul>
      )}
      {!loading && visibleItems.length === 0 && !isEmpty && filter !== "all" && (
        <p className="mt-5 text-xs font-medium text-stone-500 text-center py-4">
          {t("today.noCategoryItems")}
        </p>
      )}
    </div>
  );
}

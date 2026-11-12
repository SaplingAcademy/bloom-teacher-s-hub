import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/use-language";
import { useUrgentQueueQuery } from "@/hooks/use-urgent-queue-query";
import { ShieldAlert, AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";

interface UrgentWidgetProps {
  teacherId: string;
}

export function UrgentWidget({ teacherId }: UrgentWidgetProps) {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const { data, isPending, isFetching, refetch } = useUrgentQueueQuery(teacherId, lang);
  const urgentItems = data ?? [];
  const loading = isFetching;

  const handleAction = (targetUrl: string) => {
    if (targetUrl) {
      navigate({ to: targetUrl as any });
    }
  };

  // First load only (no cached data yet): a card-sized placeholder so the block does not pop in.
  if (teacherId && isPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={t("today.urgentTitle")}
        data-testid="urgent-skeleton"
        className="rounded-2xl border border-stone-200/80 bg-card p-5 sm:p-6 shadow-sm"
      >
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-[58px] w-full rounded-xl" />
          <Skeleton className="h-[58px] w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (urgentItems.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-card p-5 sm:p-6 shadow-sm select-none transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-outfit text-lg font-extrabold text-foreground tracking-tight">
                {t("today.urgentTitle")}
              </h2>
              <Badge
                variant="outline"
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  urgentItems.length > 0
                    ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                    : "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300"
                }`}
              >
                {urgentItems.length === 1
                  ? t("today.urgentItemCount").replace("{count}", "1")
                  : t("today.urgentItemCountPlural").replace("{count}", String(urgentItems.length))}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {t("today.urgentSubtitle")}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          disabled={loading}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          title={t("today.refreshUrgent")}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Content area */}
      <div className="mt-4">
        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
          {urgentItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 hover:border-rose-300 transition-all text-xs"
            >
              <div className="flex items-start gap-3 min-w-0 pr-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <span className="font-bold text-rose-950 dark:text-rose-200 truncate block text-xs">
                    {item.title}
                  </span>
                  <span className="text-[11px] text-rose-800/80 dark:text-rose-300/80 block truncate">
                    {item.reason}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => handleAction(item.targetUrl)}
                className="h-8 px-3 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shrink-0 gap-1 cursor-pointer"
              >
                <span>{t("today.resolveAction")}</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

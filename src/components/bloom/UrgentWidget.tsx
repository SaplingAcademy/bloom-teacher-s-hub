import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { refreshTodayQueues, useUrgentQueueQuery } from "@/hooks/use-urgent-queue-query";
import { useInvalidateFinanceData } from "@/hooks/use-finance-query";
import { ShieldAlert, AlertTriangle, ArrowUpRight, ChevronDown, RefreshCw } from "lucide-react";
import { InfoTooltip } from "@/components/bloom/InfoTooltip";
import { PriorityResolutionPanel } from "@/components/bloom/PriorityResolutionPanel";
import { PriorityModuleActions, type PriorityModuleAction } from "@/components/bloom/PriorityModuleActions";
import { urgentResolution } from "@/lib/urgent-resolution";
import { completeTeacherTask } from "@/lib/lead-tasks";
import { retryFailedAutomation } from "@/lib/automation-engine";
import type { AttentionItem } from "@/lib/attention-queue";
import { cn } from "@/lib/utils";

interface UrgentWidgetProps {
  teacherId: string;
  /** Optional layout wrapper (e.g. the dashboard grid that aligns the card with Priorities). */
  layoutClassName?: string;
}

/**
 * Urgent block: a clean list (soft dividers; red only on the severity marker) where each item is
 * resolved with the flow that fits it — inline attendance, the existing renewal / lead modals, a
 * confirmed task completion, an automation retry — or by opening its screen when that is the only
 * way. Every confirmed resolution re-reads Urgent and Today's priorities from their sources.
 */
export function UrgentWidget({ teacherId, layoutClassName }: UrgentWidgetProps) {
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const queryClient = useQueryClient();
  const invalidateFinanceData = useInvalidateFinanceData(teacherId);
  const { data, isPending, isFetching, refetch } = useUrgentQueueQuery(teacherId, lang);
  const urgentItems = data ?? [];
  const loading = isFetching;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [moduleAction, setModuleAction] = useState<PriorityModuleAction | null>(null);

  const refresh = () => refreshTodayQueues(queryClient, teacherId);

  /** Simple actions run here; on failure the item stays (no local hiding) with a message. */
  const runAction = async (item: AttentionItem, run: () => Promise<void>, success: string) => {
    setBusyId(item.id);
    try {
      await run();
      toast.success(success);
      setConfirmId(null);
      await refresh();
    } catch (error) {
      console.error("[UrgentWidget] Resolution failed:", error);
      toast.error(t("today.urgentResolveError"));
    } finally {
      setBusyId(null);
    }
  };

  const resolve = (item: AttentionItem) => {
    const resolution = urgentResolution(item);
    if (resolution.type === "attendance") setExpandedId(expandedId === item.id ? null : item.id);
    else if (resolution.type === "module") setModuleAction(resolution.action);
    else if (resolution.type === "complete_task") setConfirmId(item.id);
    else if (resolution.type === "retry") {
      void runAction(item, async () => {
        const result = await retryFailedAutomation(resolution.automationEventId);
        if (!result.success) throw new Error(result.error || "retry_failed");
      }, t("today.urgentRetried"));
    } else if (resolution.url) navigate({ to: resolution.url as any });
  };

  // First load only (no cached data yet): a card-sized placeholder so the block does not pop in.
  if (teacherId && isPending) {
    return (
      <div className={cn(layoutClassName)}>
        <div role="status" aria-busy="true" aria-label={t("today.urgentTitle")} data-testid="urgent-skeleton"
          className="rounded-2xl border border-stone-200/80 bg-card p-4 sm:p-5 shadow-sm">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-5 w-28" />
          </div>
          <div className="mt-3 space-y-2">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (urgentItems.length === 0) return null;

  return (
    <div className={cn(layoutClassName)}>
      <div className="rounded-2xl border border-stone-200/80 bg-card p-4 sm:p-5 shadow-sm transition-all" data-testid="urgent-widget">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <ShieldAlert className="h-4.5 w-4.5" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 items-center gap-1.5">
              <h2 className="font-outfit text-lg font-extrabold text-foreground tracking-tight">{t("today.urgentTitle")}</h2>
              <span data-testid="urgent-count" className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-700 dark:text-rose-300">
                {urgentItems.length}
              </span>
              <InfoTooltip label={`${t("globalUi.aboutPage")} ${t("today.urgentTitle")}`} text={t("today.urgentSubtitle")} className="text-muted-foreground" />
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()} disabled={loading}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer" title={t("today.refreshUrgent")}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <ul className="mt-3 max-h-60 divide-y divide-stone-200/60 overflow-y-auto pr-1" data-testid="urgent-list">
          {urgentItems.map((item) => {
            const resolution = urgentResolution(item);
            const expanded = resolution.type === "attendance" && expandedId === item.id;
            const confirming = confirmId === item.id;
            const busy = busyId === item.id;
            return (
              <li key={item.id} data-urgent-item={item.category} className="py-2.5 first:pt-1 last:pb-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    {/* Red/coral only marks the severity. */}
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                    <div className="min-w-0">
                      <span className="block truncate text-xs sm:text-sm font-semibold text-foreground">{item.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">{item.reason}</span>
                    </div>
                  </div>
                  {!confirming && (
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => resolve(item)}
                      aria-expanded={resolution.type === "attendance" ? expanded : undefined}
                      className="h-8 shrink-0 gap-1 rounded-lg px-2.5 text-xs font-semibold text-primary hover:bg-primary/10 hover:text-primary cursor-pointer">
                      <span>{resolution.type === "retry" ? t("today.urgentRetry") : t("today.resolveAction")}</span>
                      {resolution.type === "navigate" ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                        : resolution.type === "attendance" ? <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" /> : null}
                    </Button>
                  )}
                </div>
                {confirming && resolution.type === "complete_task" && (
                  <div role="group" data-testid="urgent-confirm" className="mt-2 flex flex-wrap items-center justify-end gap-2 text-xs">
                    <span className="mr-auto text-muted-foreground">{t("today.urgentConfirmComplete")}</span>
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" disabled={busy} onClick={() => setConfirmId(null)}>{t("common.cancel")}</Button>
                    <Button type="button" size="sm" className="h-8 text-xs" disabled={busy}
                      onClick={() => void runAction(item, () => completeTeacherTask(teacherId, resolution.taskId), t("globalUi.taskCompleted"))}>
                      {t("today.urgentCompleteTask")}
                    </Button>
                  </div>
                )}
                {expanded && resolution.type === "attendance" && (
                  <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 dark:bg-card">
                    <PriorityResolutionPanel teacherId={teacherId} item={resolution.item} onSaved={async () => { setExpandedId(null); await refresh(); }} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {moduleAction && (
        <PriorityModuleActions key={JSON.stringify(moduleAction)} teacherId={teacherId} action={moduleAction}
          onClose={() => setModuleAction(null)}
          onSaved={(kind) => { if (kind !== "lead") invalidateFinanceData(); void refresh(); }} />
      )}
    </div>
  );
}

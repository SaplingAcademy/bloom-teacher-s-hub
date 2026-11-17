import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { refreshTodayQueues, useUrgentQueueQuery } from "@/hooks/use-urgent-queue-query";
import { useInvalidateFinanceData } from "@/hooks/use-finance-query";
import { ShieldAlert, ShieldCheck, AlertTriangle, ArrowUpRight, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
 * The Urgent pending list with each item's resolution, reusing the existing flows — inline attendance,
 * the renewal / lead modals, a confirmed task completion, an automation retry — or opening its screen
 * when that is the only way. Every confirmed resolution re-reads Urgent and Today's priorities (incl.
 * the Kanban) from their sources; a failure keeps the item with a message.
 */
export function UrgentPendingList({ teacherId, items }: { teacherId: string; items: AttentionItem[] }) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const invalidateFinanceData = useInvalidateFinanceData(teacherId);
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

  return (
    <>
      <ul className="divide-y divide-stone-200/60" data-testid="urgent-list">
        {items.map((item) => {
          const resolution = urgentResolution(item);
          const expanded = resolution.type === "attendance" && expandedId === item.id;
          const confirming = confirmId === item.id;
          const busy = busyId === item.id;
          return (
            <li key={item.id} data-urgent-item={item.category} className="py-3 first:pt-1 last:pb-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {/* Red/coral only marks the severity. */}
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                  <div className="min-w-0">
                    <span className="block break-words text-sm font-semibold text-foreground">{item.title}</span>
                    <span className="block break-words text-xs text-muted-foreground">{item.reason}</span>
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
                <div className="mt-2 rounded-lg border border-stone-200 bg-white p-3 dark:bg-card">
                  <PriorityResolutionPanel teacherId={teacherId} item={resolution.item} onSaved={async () => { setExpandedId(null); await refresh(); }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {moduleAction && (
        <PriorityModuleActions key={JSON.stringify(moduleAction)} teacherId={teacherId} action={moduleAction}
          onClose={() => setModuleAction(null)}
          onSaved={(kind) => { if (kind !== "lead") invalidateFinanceData(); void refresh(); }} />
      )}
    </>
  );
}

/**
 * Urgent indicator on the home page: one summary card with the real count (red only as a detail when
 * there are items, neutral "all clear" otherwise). Clicking opens the full list in a modal where each
 * item is resolved with its existing flow.
 */
export function UrgentWidget({ teacherId, layoutClassName }: UrgentWidgetProps) {
  const { t, lang } = useLanguage();
  const { data, isPending, isError, isFetching, refetch } = useUrgentQueueQuery(teacherId, lang);
  const urgentItems = data ?? [];
  const [open, setOpen] = useState(false);
  const count = urgentItems.length;

  if (teacherId && isPending) {
    return (
      <div className={cn(layoutClassName)}>
        <div role="status" aria-busy="true" aria-label={t("today.urgentTitle")} data-testid="urgent-skeleton"
          className="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-card px-4 py-3 shadow-sm">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-24" /><Skeleton className="h-3 w-40" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(layoutClassName)}>
      <button type="button" data-testid="urgent-card" aria-haspopup="dialog" onClick={() => setOpen(true)}
        className="group flex w-full items-center gap-3 rounded-2xl border border-stone-200/80 bg-card px-4 py-3 text-left shadow-sm transition-colors hover:border-stone-300 hover:bg-stone-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", count > 0 ? "bg-rose-500/10 text-rose-600" : "bg-primary-soft text-primary")}>
          {count > 0 ? <ShieldAlert className="h-4.5 w-4.5" aria-hidden="true" /> : <ShieldCheck className="h-4.5 w-4.5" aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-outfit text-base font-extrabold text-foreground">{t("today.urgentTitle")}</span>
            {count > 0 && <span data-testid="urgent-count" className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-700 dark:text-rose-300">{count}</span>}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {isError ? t("today.urgentLoadError") : count > 0 ? t("today.urgentCardHint") : t("today.allClearTitle")}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("common.close")} data-testid="urgent-dialog"
          className="flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-xl p-0">
          <DialogHeader className="flex-row items-center gap-2 space-y-0 border-b border-border px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 font-outfit text-lg font-extrabold">
              <ShieldAlert className="h-5 w-5 text-rose-500" aria-hidden="true" />
              {t("today.urgentTitle")}
              {count > 0 && <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-rose-700">{count}</span>}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("today.urgentSubtitle")}</DialogDescription>
            <Button type="button" variant="ghost" size="sm" onClick={() => void refetch()} disabled={isFetching}
              className="ml-auto mr-8 h-8 px-2 text-xs text-muted-foreground hover:text-foreground" title={t("today.refreshUrgent")} aria-label={t("today.refreshUrgent")}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-2">
            {count > 0 ? <UrgentPendingList teacherId={teacherId} items={urgentItems} />
              : <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />{t("today.allClearSubtitle")}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

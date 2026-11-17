import { useState, type ReactNode } from "react";
import { UrgentWidget } from "@/components/bloom/UrgentWidget";
import { DailyPrioritiesCard } from "@/components/bloom/DailyPrioritiesCard";
import { ChecklistCard } from "@/components/bloom/ChecklistCard";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";

interface DashboardAttentionSectionsProps {
  teacherId: string;
  refreshKey: number;
}

/** Two-column dashboard grid (Priorities | right column). */
const ATTENTION_GRID = "grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";

/**
 * Compact Checklist plus its expanded modal. Both render the same ChecklistCard, i.e. the same hook,
 * query cache and operations, so adding/editing/completing in one view shows in the other at once.
 */
function ChecklistPanel({ teacherId }: { teacherId: string }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <div data-testid="checklist-slot" className="min-w-0 xl:h-[17rem]">
        <ChecklistCard key={`checklist-${teacherId}`} onExpand={() => setOpen(true)} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("common.close")} data-testid="checklist-dialog"
          className="flex h-[min(85dvh,760px)] w-[calc(100%-1.5rem)] max-w-xl flex-col gap-0 overflow-hidden rounded-xl p-0">
          <DialogTitle className="sr-only">{t("checklist.title")}</DialogTitle>
          <DialogDescription className="sr-only">{t("checklist.info")}</DialogDescription>
          {open && <ChecklistCard expanded />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Daily Priorities on the left. Right column, top to bottom: Checklist, the indicators (`aside`: lessons
 * today and month revenue, side by side) and the Urgent summary card across the column. Below xl
 * everything stacks in the same order.
 */
export function DashboardPrioritiesSection({ teacherId, refreshKey, aside }: DashboardAttentionSectionsProps & { aside?: ReactNode }) {
  return (
    <div className={ATTENTION_GRID}>
      <DailyPrioritiesCard key={`priorities-${refreshKey}`} teacherId={teacherId} />
      <div className="flex min-w-0 flex-col gap-4" data-testid="dashboard-right-column">
        <ChecklistPanel teacherId={teacherId} />
        {aside}
        <UrgentWidget key={`urgent-${refreshKey}`} teacherId={teacherId} />
      </div>
    </div>
  );
}

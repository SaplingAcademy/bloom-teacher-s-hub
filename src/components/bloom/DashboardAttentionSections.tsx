import { useRef, useState, type ReactNode } from "react";
import { useFitViewportHeight } from "@/hooks/use-fit-viewport-height";
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
function ChecklistPanel({ teacherId, fill }: { teacherId: string; fill: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Fitted desktop: takes the room the indicators and Urgent leave (tasks scroll inside);
          otherwise the 20rem slot validated before. */}
      <div data-testid="checklist-slot" className={fill ? "min-h-0 min-w-0 flex-1" : "min-w-0 xl:h-[20rem]"}>
        <ChecklistCard key={`checklist-${teacherId}`} onExpand={() => setOpen(true)} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t("common.close")} data-testid="checklist-dialog"
          // Start on the "add task" field: the default first focusable is the info icon, whose tooltip
          // opens on focus and would swallow the first Esc (the dialog then needed Esc twice).
          onOpenAutoFocus={(event) => {
            const input = document.querySelector<HTMLInputElement>('[data-testid="checklist-dialog"] input');
            if (input) { event.preventDefault(); input.focus(); }
          }}
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
  // Desktop: the blocks share the height left below the greeting, so Priorities, Checklist, the
  // indicators and Urgent are all visible without page scrolling. Null (small or very short screens):
  // natural heights and normal page scrolling.
  const gridRef = useRef<HTMLDivElement>(null);
  const fitHeight = useFitViewportHeight(gridRef);
  const fill = fitHeight !== null;
  return (
    <div ref={gridRef} className={ATTENTION_GRID} data-fit={fill || undefined} style={fill ? { height: fitHeight } : undefined}>
      <DailyPrioritiesCard key={`priorities-${refreshKey}`} teacherId={teacherId} fillHeight={fill} />
      <div className={fill ? "flex h-full min-h-0 min-w-0 flex-col gap-2" : "flex min-w-0 flex-col gap-2.5"} data-testid="dashboard-right-column">
        <ChecklistPanel teacherId={teacherId} fill={fill} />
        {aside}
        <UrgentWidget key={`urgent-${refreshKey}`} teacherId={teacherId} />
      </div>
    </div>
  );
}

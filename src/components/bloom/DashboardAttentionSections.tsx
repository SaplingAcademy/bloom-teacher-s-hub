import type { ReactNode } from "react";
import { UrgentWidget } from "@/components/bloom/UrgentWidget";
import { DailyPrioritiesCard } from "@/components/bloom/DailyPrioritiesCard";
import { ChecklistCard } from "@/components/bloom/ChecklistCard";

interface DashboardAttentionSectionsProps {
  teacherId: string;
  refreshKey: number;
}

/**
 * Daily Priorities on the left; on the right a shorter Checklist with `aside` (the Overview's
 * indicator cards) below it. The right column keeps its own height instead of stretching to the
 * priorities card. Below xl everything stacks: Priorities, Checklist, indicators.
 */
/** Two-column dashboard grid (Priorities | right column), shared so Urgent lines up with Priorities. */
const ATTENTION_GRID = "grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]";

export function DashboardPrioritiesSection({ teacherId, refreshKey, aside }: DashboardAttentionSectionsProps & { aside?: ReactNode }) {
  return (
    <div className={ATTENTION_GRID}>
      <DailyPrioritiesCard key={`priorities-${refreshKey}`} teacherId={teacherId} />
      <div className="flex min-w-0 flex-col gap-6">
        <div data-testid="checklist-slot" className="min-w-0 xl:h-[19rem]">
          <ChecklistCard key={`checklist-${teacherId}`} />
        </div>
        {aside}
      </div>
    </div>
  );
}

/**
 * Urgent section, rendered by the Overview after the indicators. Placed in the first column of the
 * same grid as Priorities, so both cards share width and horizontal edges at every breakpoint.
 */
export function DashboardUrgentSection({ teacherId, refreshKey }: DashboardAttentionSectionsProps) {
  return <UrgentWidget key={`urgent-${refreshKey}`} teacherId={teacherId} layoutClassName={ATTENTION_GRID} />;
}

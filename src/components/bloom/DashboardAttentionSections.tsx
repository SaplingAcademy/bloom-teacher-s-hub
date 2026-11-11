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
export function DashboardPrioritiesSection({ teacherId, refreshKey, aside }: DashboardAttentionSectionsProps & { aside?: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
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

/** Urgent section, rendered by the Overview after the indicators. */
export function DashboardUrgentSection({ teacherId, refreshKey }: DashboardAttentionSectionsProps) {
  return <UrgentWidget key={`urgent-${refreshKey}`} teacherId={teacherId} />;
}

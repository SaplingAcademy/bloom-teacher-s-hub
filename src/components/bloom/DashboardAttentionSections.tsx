import { UrgentWidget } from "@/components/bloom/UrgentWidget";
import { DailyPrioritiesCard } from "@/components/bloom/DailyPrioritiesCard";
import { ChecklistCard } from "@/components/bloom/ChecklistCard";

interface DashboardAttentionSectionsProps {
  teacherId: string;
  refreshKey: number;
}

/**
 * Daily Priorities with the Checklist beside it (stacked below xl). The Overview renders this
 * first, before the greeting, the indicators and the Urgent section.
 */
export function DashboardPrioritiesSection({ teacherId, refreshKey }: DashboardAttentionSectionsProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:relative xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-stretch">
      <DailyPrioritiesCard key={`priorities-${refreshKey}`} teacherId={teacherId} />
      <div className="min-w-0 xl:absolute xl:inset-y-0 xl:right-0 xl:w-[calc((100%-1.5rem)/3)]">
        <ChecklistCard key={`checklist-${teacherId}`} />
      </div>
    </div>
  );
}

/** Urgent section, rendered by the Overview after the indicators. */
export function DashboardUrgentSection({ teacherId, refreshKey }: DashboardAttentionSectionsProps) {
  return <UrgentWidget key={`urgent-${refreshKey}`} teacherId={teacherId} />;
}

import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Composed loading skeletons that mirror each area's real layout, so the
 * first paint already approximates the final content and avoids layout jumps.
 * Render them only for initial loads (no cached data); background
 * revalidations keep showing the existing content.
 */

function Status({ label, className, children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <div role="status" aria-label={label} aria-busy="true" className={className}>
      {label ? <span className="sr-only">{label}</span> : null}
      {children}
    </div>
  );
}

/** Indicator cards (e.g. Dashboard stats). */
export function StatCardsSkeleton({ label, count = 4, className }: { label?: string; count?: number; className?: string }) {
  return (
    <Status label={label} className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </Status>
  );
}

/** Table/list rows (e.g. Finance receivables, Lead table). */
export function ListRowsSkeleton({ label, rows = 5, className }: { label?: string; rows?: number; className?: string }) {
  return (
    <Status label={label} className={cn("divide-y divide-border/60 rounded-xl border border-border/60 bg-card", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5">
          <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </Status>
  );
}

/** Card grid (e.g. Students, Classes, Library resources). */
export function CardsGridSkeleton({ label, count = 6, className }: { label?: string; count?: number; className?: string }) {
  return (
    <Status label={label} className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-2/5" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </Status>
  );
}

/** Course/material cards with cover (e.g. Academy home). */
export function CourseCardsSkeleton({ label, count = 3, className }: { label?: string; count?: number; className?: string }) {
  return (
    <Status label={label} className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border bg-card">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </Status>
  );
}

/** Kanban columns (e.g. Leads pipeline). */
export function KanbanSkeleton({ label, columns = 6, className }: { label?: string; columns?: number; className?: string }) {
  return (
    <Status
      label={label}
      className={cn("grid grid-cols-1 gap-4 overflow-x-auto pb-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6", className)}
    >
      {Array.from({ length: columns }, (_, i) => (
        <div key={i} className="flex min-h-[400px] min-w-0 flex-col rounded-xl border border-border bg-card/50 p-3">
          <div className="mb-2 flex items-center justify-between border-b border-border pb-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-7 rounded-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: (i % 3) + 1 }, (_, j) => (
              <div key={j} className="space-y-2 rounded-lg border border-border/70 bg-card p-3">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Status>
  );
}

/** Calendar hour rows (week/day grids); day headers stay real. */
export function CalendarRowsSkeleton({
  label,
  rows = 6,
  columns = 7,
  className,
}: {
  label?: string;
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <Status label={label} className={cn("divide-y divide-border/60", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="grid min-h-[64px]" style={{ gridTemplateColumns: `80px repeat(${columns}, 1fr)` }}>
          <div className="flex items-start justify-end border-r border-border bg-secondary/5 p-2 pt-1">
            <Skeleton className="h-3 w-8" />
          </div>
          {Array.from({ length: columns }, (_, day) => (
            <div key={day} className="border-r border-border/60 p-1.5">
              {(i + day) % 3 === 0 ? <Skeleton className="h-10 w-full rounded-xl" /> : null}
            </div>
          ))}
        </div>
      ))}
    </Status>
  );
}

/** Month-view grid (35 day cells). */
export function MonthGridSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <Status label={label} className={cn("grid grid-cols-7 gap-1", className)}>
      {Array.from({ length: 35 }, (_, i) => (
        <div key={i} className="min-h-20 space-y-1.5 rounded-lg border border-border/50 p-1.5">
          <Skeleton className="h-3 w-5" />
          {i % 4 === 1 ? <Skeleton className="h-4 w-full rounded-md" /> : null}
        </div>
      ))}
    </Status>
  );
}

/** Generic panel card (e.g. Growth goal card). */
export function PanelSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <Status label={label} className={cn("rounded-2xl border border-border bg-card p-6 shadow-sm", className)}>
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-5 rounded-full" />
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="my-8 space-y-3">
        <Skeleton className="mx-auto h-8 w-2/3" />
        <Skeleton className="mx-auto h-3 w-1/2" />
      </div>
      <Skeleton className="h-3 w-2/5" />
    </Status>
  );
}

/** Academy learning pages (course, lesson player, video). */
export function LearningSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <Status label={label} className={cn("space-y-6 py-2", className)}>
      <Skeleton className="h-8 w-36" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Skeleton className="aspect-video w-full rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-7 w-2/3" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
        <div className="hidden space-y-4 rounded-xl border border-border bg-card p-4 lg:block">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        </div>
      </div>
    </Status>
  );
}

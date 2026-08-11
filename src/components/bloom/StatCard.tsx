import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "accent" | "lilac" | "warning";

const toneMap: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  accent: "bg-accent-soft text-accent",
  lilac: "bg-lilac-soft text-lilac",
  warning: "bg-secondary text-secondary-foreground",
};

type StatCardProps = {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: { value: string; positive?: boolean };
  hint?: string;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  trend,
  hint,
}: StatCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              trend.positive ? "bg-primary-soft text-primary" : "bg-accent-soft text-accent",
            )}
          >
            {trend.positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="font-display text-2xl font-bold text-card-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground/80">{hint}</p>}
      </div>
    </div>
  );
}

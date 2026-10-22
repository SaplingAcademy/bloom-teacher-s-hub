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
  appearance?: "light" | "forest";
  onClick?: () => void;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "primary",
  trend,
  hint,
  appearance = "light",
  onClick,
}: StatCardProps) {
  const forest = appearance === "forest";
  const shell = cn(
    "flex flex-col gap-3 rounded-2xl border p-5 shadow-[var(--shadow-sm)] text-left w-full",
    forest ? "border-sidebar-border bg-sidebar text-sidebar-accent-foreground" : "border-border bg-card",
    onClick && "cursor-pointer transition-colors hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
  );
  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className={cn("grid h-10 w-10 place-items-center rounded-xl", forest ? "bg-sidebar-accent text-sidebar-accent-foreground" : toneMap[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        {trend && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              forest ? "bg-sidebar-accent text-sidebar-accent-foreground" : trend.positive ? "bg-primary-soft text-primary" : "bg-accent-soft text-accent",
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
        <p className={cn("font-display text-2xl font-bold", forest ? "text-sidebar-accent-foreground" : "text-card-foreground")}>{value}</p>
        <p className={cn("text-sm", forest ? "text-sidebar-foreground" : "text-muted-foreground")}>{label}</p>
        {hint && <p className={cn("mt-1 text-xs", forest ? "text-sidebar-foreground" : "text-muted-foreground/80")}>{hint}</p>}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={shell}>
        {content}
      </button>
    );
  }
  return <div className={shell}>{content}</div>;
}

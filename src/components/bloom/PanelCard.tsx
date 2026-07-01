import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PanelCardProps = {
  title?: string;
  description?: string;
  action?: { label: string; to: string };
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function PanelCard({
  title,
  description,
  action,
  icon,
  children,
  className,
  contentClassName,
}: PanelCardProps) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]",
        className,
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-secondary text-secondary-foreground">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h3 className="truncate text-sm font-semibold text-card-foreground">{title}</h3>}
              {description && (
                <p className="truncate text-xs text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          {action && (
            <Link
              to={action.to}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft"
            >
              {action.label}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </header>
      )}
      <div className={cn("flex-1 p-5", contentClassName)}>{children}</div>
    </section>
  );
}
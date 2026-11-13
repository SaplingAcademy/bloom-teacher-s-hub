import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
  className?: string;
  /** Optional overrides (defaults unchanged for every other page). */
  titleClassName?: string;
  eyebrowClassName?: string;
  /** Optional element right after the title (e.g. an info tooltip icon). */
  titleAddon?: ReactNode;
};

export function PageHeader({ title, description, actions, eyebrow, className, titleClassName, eyebrowClassName, titleAddon }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className={cn("mb-1 text-xs font-semibold uppercase tracking-wide text-accent", eyebrowClassName)}>
            {eyebrow}
          </p>
        )}
        {titleAddon ? (
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className={cn("truncate font-display text-2xl font-bold text-foreground sm:text-[28px]", titleClassName)}>
              {title}
            </h1>
            {titleAddon}
          </div>
        ) : (
          <h1 className={cn("truncate font-display text-2xl font-bold text-foreground sm:text-[28px]", titleClassName)}>
            {title}
          </h1>
        )}
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

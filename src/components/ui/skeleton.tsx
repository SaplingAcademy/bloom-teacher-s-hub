import { cn } from "@/lib/utils";

/**
 * Loading placeholder with a soft shimmer sweep. The animation is
 * transform-based (cheap) and disabled under prefers-reduced-motion,
 * where the block renders as a static muted shape.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-primary/10", className)} {...props}>
      <div
        aria-hidden="true"
        className="skeleton-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
      />
    </div>
  );
}

export { Skeleton };

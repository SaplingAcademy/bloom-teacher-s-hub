import { cn } from "@/lib/utils";

export function BloomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("h-7 w-7", className)} aria-hidden>
      <path
        d="M16 4c2.4 0 4 2.2 4 4.6 2.2-1 4.9-.2 6 1.9 1.1 2 .3 4.5-1.7 5.9 2 1.4 2.8 3.9 1.7 5.9-1.1 2-3.8 2.8-6 1.9 0 2.4-1.6 4.6-4 4.6s-4-2.2-4-4.6c-2.2 1-4.9.1-6-1.9-1.1-2-.3-4.5 1.7-5.9-2-1.4-2.8-3.9-1.7-5.9 1.1-2 3.8-2.9 6-1.9C12 6.2 13.6 4 16 4Z"
        fill="currentColor"
        opacity="0.9"
      />
      <circle cx="16" cy="16" r="3.4" fill="var(--color-accent)" />
    </svg>
  );
}

export function BloomLogo({ className, showWord = true }: { className?: string; showWord?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BloomMark className="text-sidebar-primary" />
      {showWord && (
        <span className="font-display text-lg font-bold tracking-tight text-sidebar-foreground">
          Bloom
        </span>
      )}
    </div>
  );
}
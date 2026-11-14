import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectPage = 0 | 1;
const SLIDE_MS = 200;
const SWIPE_MIN = 60;

interface ProjectPagesProps {
  /** Page 1 (planning) is always rendered as it is today. */
  planning: ReactNode;
  /** Page 2 (board) is mounted only while it is shown, so it never loads or interferes with planning. */
  board: () => ReactNode;
  labels: { next: string; previous: string; position: (page: number) => string };
  initialPage?: ProjectPage;
}

/**
 * Exactly two pages per project, Jamboard-style: discreet arrows on the screen edges, a "1 / 2"
 * indicator and a ~200 ms horizontal slide. The project header stays above, only this content changes.
 */
export function ProjectPages({ planning, board, labels, initialPage = 0 }: ProjectPagesProps) {
  const [page, setPage] = useState<ProjectPage>(initialPage);
  const content = useRef<HTMLDivElement>(null);
  const direction = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const go = (next: ProjectPage) => {
    if (next === page) return;
    direction.current = next > page ? 1 : -1;
    setPage(next);
  };

  useEffect(() => {
    const el = content.current;
    if (!el || direction.current === 0 || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [{ transform: `translateX(${direction.current * 48}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }],
      { duration: SLIDE_MS, easing: "ease-out" },
    );
  }, [page]);

  // Touch swipe (phones/tablets); ignored inside form fields and dialogs.
  const onTouchStart = (event: TouchEvent) => {
    const target = event.target as HTMLElement;
    touch.current = target.closest("input, textarea, [contenteditable=true], [role=dialog]") ? null : { x: event.touches[0].clientX, y: event.touches[0].clientY };
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    go(dx < 0 ? 1 : 0);
  };

  // Phones: arrows sit beside the "1 / 2" indicator at the bottom (edges would cover content
  // controls); from sm up they are on the middle of the screen edges, hugging the border.
  const arrow = "fixed bottom-3 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card/85 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2";

  return (
    <div className="pb-14" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div ref={content} key={page} data-testid="project-page" data-page={page + 1}>
        {page === 0 ? planning : board()}
      </div>
      {page === 0 ? (
        <button type="button" className={cn(arrow, "right-[calc(50%-4.5rem)] sm:right-1")} onClick={() => go(1)} aria-label={labels.next} title={labels.next}>
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      ) : (
        <button type="button" className={cn(arrow, "left-[calc(50%-4.5rem)] sm:left-1")} onClick={() => go(0)} aria-label={labels.previous} title={labels.previous}>
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
      )}
      <p aria-live="polite" data-testid="project-page-indicator"
        className="pointer-events-none fixed bottom-3.5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border/70 bg-card/85 px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground shadow-sm backdrop-blur">
        <span aria-hidden>{page + 1} / 2</span><span className="sr-only">{labels.position(page + 1)}</span>
      </p>
    </div>
  );
}

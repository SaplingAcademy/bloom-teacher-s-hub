import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, Clock, LoaderCircle } from "lucide-react";
import type { WeekDropTarget, WeekLessonDragPreview as WeekLessonDragPreviewState } from "@/hooks/use-week-lesson-drag";

interface WeekLessonDragPreviewProps {
  preview: WeekLessonDragPreviewState | null;
  target: WeekDropTarget | null;
  duration?: number;
  previewRef: (element: HTMLElement | null) => void;
  destinationLabel: string;
  pendingLabel: string;
  savedLabel: string;
}

/** A temporary visual clone; it never owns event data or scheduling behavior. */
export function WeekLessonDragPreview({
  preview,
  target,
  duration,
  previewRef,
  destinationLabel,
  pendingLabel,
  savedLabel,
}: WeekLessonDragPreviewProps) {
  const cloneContainer = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = cloneContainer.current;
    if (!container || !preview) return;
    const clone = preview.source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.removeAttribute("data-calendar-event");
    clone.setAttribute("aria-hidden", "true");
    clone.tabIndex = -1;
    clone.classList.remove(
      "opacity-40", "opacity-60", "cursor-grab", "cursor-grabbing", "cursor-wait",
      "ring-2", "ring-primary", "transition-all", "hover:shadow-sm", "touch-none", "touch-auto",
    );
    clone.classList.add("pointer-events-none", "shadow-xl");
    clone.style.opacity = "1";
    clone.style.transform = "none";
    clone.style.transition = "none";
    clone.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
    container.replaceChildren(clone);
    return () => container.replaceChildren();
  }, [preview?.source]);

  if (!preview || typeof document === "undefined") return null;
  const accessibleStatus = preview.phase === "pending"
    ? pendingLabel
    : preview.phase === "settling"
      ? savedLabel
      : target
        ? `${destinationLabel}: ${target.date} ${target.startTime}`
        : "";

  return createPortal(
    <>
      <div
        ref={previewRef}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-40 select-none will-change-transform motion-reduce:will-change-auto"
        style={{ width: preview.origin.width }}
      >
        <div ref={cloneContainer} className="pointer-events-none" />
        {target && preview.phase !== "returning" && (
          <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-primary/25 bg-card px-2 py-1 text-[10px] font-semibold text-foreground shadow-lg">
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              <Clock className="h-3 w-3 shrink-0 text-primary" />
              <span className="truncate">{target.date} · {target.startTime}</span>
            </span>
            {duration ? <span className="shrink-0 text-muted-foreground">{duration} min</span> : null}
          </div>
        )}
        {preview.phase === "pending" && (
          <div role="presentation" className="mt-1 flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-[10px] font-medium text-foreground shadow-lg">
            <LoaderCircle className="h-3 w-3 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
            <span>{pendingLabel}</span>
          </div>
        )}
        {preview.phase === "settling" && (
          <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-primary/25 bg-card px-2 py-1.5 text-[10px] font-medium text-foreground shadow-lg">
            <Check className="h-3 w-3 shrink-0 text-primary" />
            <span>{savedLabel}</span>
          </div>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">{accessibleStatus}</span>
    </>,
    document.body,
  );
}

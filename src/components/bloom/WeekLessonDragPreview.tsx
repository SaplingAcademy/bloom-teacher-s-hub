import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check, LoaderCircle } from "lucide-react";
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

export function weekLessonPreviewTimeRange(startTime: string, duration?: number) {
  const start = startTime.slice(0, 5);
  const [hours, minutes] = start.split(":").map(Number);
  if (!duration || duration <= 0 || !Number.isFinite(duration) || !Number.isFinite(hours) || !Number.isFinite(minutes)) return start;
  const end = hours * 60 + minutes + Math.round(duration);
  if (end >= 24 * 60) return start;
  const endTime = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
  return `${start}–${endTime}`;
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
  const originalTime = useRef("");

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
    originalTime.current = clone.querySelector<HTMLElement>("[data-calendar-event-time]")?.textContent ?? "";
    container.replaceChildren(clone);
    return () => container.replaceChildren();
  }, [preview?.source]);

  useLayoutEffect(() => {
    const time = cloneContainer.current?.querySelector<HTMLElement>("[data-calendar-event-time]");
    if (!time || !preview) return;
    time.textContent = target && preview.phase !== "returning"
      ? weekLessonPreviewTimeRange(target.startTime, duration)
      : originalTime.current;
  }, [duration, preview, preview?.phase, preview?.source, target]);

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
        data-calendar-drag-preview=""
        data-drag-phase={preview.phase}
        aria-hidden="true"
        className="pointer-events-none fixed left-0 top-0 z-40 select-none will-change-transform motion-reduce:will-change-auto"
        style={{ width: preview.origin.width }}
      >
        <div ref={cloneContainer} className="pointer-events-none" />
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

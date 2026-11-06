import { useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { useWeekLessonDrag, type WeekDropPosition } from "@/hooks/use-week-lesson-drag";
import { WeekLessonDragPreview } from "@/components/bloom/WeekLessonDragPreview";
import "@/styles.css";

function Check() {
  const [answer, setAnswer] = useState<((success: boolean) => void) | null>(null);
  const [drops, setDrops] = useState<WeekDropPosition[]>([]);
  const onDrop = useCallback((_id: string, position: WeekDropPosition) => {
    setDrops((current) => [...current, position]);
    return new Promise<boolean>((resolve) => setAnswer(() => resolve));
  }, []);
  const drag = useWeekLessonDrag(onDrop);
  return (
    <main className="min-h-[1600px] bg-background p-6 text-foreground">
      <h1 className="font-display text-xl font-bold">Calendar drag interaction check</h1>
      <p id="drops" className="mt-2 text-sm">{drops.map((drop) => `${drop.date} ${drop.startTime}`).join(" | ") || "No drops"}</p>
      <div className="mt-6 flex gap-6">
        <div data-calendar-drop-cell="" data-date="2026-11-05" data-hour="09:00" className="h-24 w-52 border border-border bg-card p-2">
          <div
            id="lesson"
            data-calendar-event=""
            data-calendar-event-id="lesson-1"
            onPointerDown={(event) => drag.start(event, "lesson-1")}
            className={`touch-auto select-none rounded-xl border border-primary/20 bg-primary-soft p-3 transition-all ${drag.draggedId ? "opacity-40" : ""}`}
          >
            <div className="font-display text-sm font-bold">Julia · English</div>
            <div className="mt-1 text-xs">09:00–10:00</div>
            <div className="mt-1 text-[10px]">B2 · Conversation</div>
          </div>
        </div>
        <div id="target" data-calendar-drop-cell="" data-date="2026-11-06" data-hour="16:00" className="h-24 w-52 border border-border bg-card p-2">16:00</div>
      </div>
      <div className="mt-6 flex gap-2">
        <button id="fail" className="rounded border border-border px-3 py-2" onClick={() => answer?.(false)}>Cancel save</button>
        <button id="save" className="rounded bg-primary px-3 py-2 text-primary-foreground" onClick={() => answer?.(true)}>Confirm save</button>
      </div>
      <output id="phase" className="mt-4 block text-sm">{drag.preview?.phase || "idle"}</output>
      <WeekLessonDragPreview
        preview={drag.preview}
        target={drag.target}
        duration={60}
        previewRef={drag.previewRef}
        destinationLabel="New time"
        pendingLabel="Saving new time..."
        savedLabel="Time updated"
      />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Check />);

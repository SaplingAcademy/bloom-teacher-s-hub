import { useRef, useState } from "react";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  /** Accessible name of the info button (e.g. "Sobre as Prioridades de Hoje"). */
  label: string;
  /** Explanation shown in the tooltip. */
  text: string;
  className?: string;
}

/**
 * Discreet info icon with an explanatory tooltip (project Tooltip, rendered in a portal so the
 * card never clips it). Opens on mouse hover and keyboard focus (Esc closes); on touch screens a
 * tap toggles it, since Radix tooltips do not open on touch by themselves.
 */
export function InfoTooltip({ label, text, className }: Props) {
  const [open, setOpen] = useState(false);
  // State at pointerdown: on touch, the tap's focus event already opens the tooltip before the
  // click, so the click must decide from the state the tap started with (not toggle again).
  const openAtPointerDown = useRef(false);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onPointerDown={() => {
              openAtPointerDown.current = open;
            }}
            onClick={(event) => {
              // preventDefault keeps Radix from closing it again on click.
              event.preventDefault();
              // Pointer tap/click toggles from the state at pointerdown; keyboard (Enter/Space,
              // detail === 0) toggles the current state.
              if (event.detail === 0) setOpen((current) => !current);
              else setOpen(!openAtPointerDown.current);
            }}
            className={cn(
              "inline-grid h-6 w-6 shrink-0 place-items-center rounded-full opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer",
              className,
            )}
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" collisionPadding={12} className="max-w-[min(18rem,calc(100vw-1.5rem))] leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

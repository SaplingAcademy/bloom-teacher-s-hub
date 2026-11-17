import { Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Discreet header button that opens a panel in its expanded (modal) view. */
export function ExpandPanelButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <Button type="button" variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} aria-haspopup="dialog"
      data-testid="expand-panel" className={cn("h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground", className)}>
      <Maximize2 className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

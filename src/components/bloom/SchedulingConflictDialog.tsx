import { TeacherTimeOff } from "@/lib/time-off-engine";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Calendar, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface SchedulingConflictDialogProps {
  isOpen: boolean;
  onClose: () => void;
  timeOffBlock: TeacherTimeOff | null;
  targetDate: string; // YYYY-MM-DD
  onConfirmOverride: () => void;
}

export function SchedulingConflictDialog({
  isOpen,
  onClose,
  timeOffBlock,
  targetDate,
  onConfirmOverride,
}: SchedulingConflictDialogProps) {
  const { t } = useLanguage();
  if (!timeOffBlock) return null;

  const dateFormatted = targetDate.split("-").reverse().join("/");
  const rangeFormatted =
    timeOffBlock.startDate === timeOffBlock.endDate
      ? timeOffBlock.startDate.split("-").reverse().join("/")
      : `${timeOffBlock.startDate.split("-").reverse().join("/")} - ${timeOffBlock.endDate.split("-").reverse().join("/")}`;

  const blockType = timeOffBlock.type || "Férias";
  const blockTitle = timeOffBlock.title ? ` (${timeOffBlock.title})` : "";

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-border bg-card shadow-2xl">
        {/* Header Warning */}
        <div className="bg-amber-500/10 border-b border-amber-500/20 p-5 flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <DialogTitle className="text-base font-bold text-amber-900 dark:text-amber-200">
              {t("calendar.conflictTitle")}
            </DialogTitle>
            <DialogDescription className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              {t("calendar.conflictSubtitle")}
            </DialogDescription>
          </div>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-3 text-xs text-stone-700 dark:text-stone-300">
          <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 space-y-1">
            <p className="font-semibold text-stone-900 dark:text-stone-100">
              {t("calendar.conflictDayNotice").replace("{date}", dateFormatted).replace("{type}", blockType).replace("{title}", blockTitle)}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {t("calendar.conflictPeriod").replace("{period}", rangeFormatted)}
            </p>
          </div>

          <p className="text-muted-foreground leading-relaxed">
            {t("calendar.conflictQuestion")}
          </p>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 bg-muted/30 border-t border-border flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="w-full sm:w-auto text-xs font-semibold"
          >
            {t("calendar.cancel")}
          </Button>

          <Button
            type="button"
            onClick={() => {
              onConfirmOverride();
              onClose();
            }}
            className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold gap-1.5 cursor-pointer shadow-md"
          >
            <ShieldAlert className="w-4 h-4" />
            {t("calendar.confirmScheduleAnyway")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

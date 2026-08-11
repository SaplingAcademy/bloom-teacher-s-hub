import { useState } from "react";
import { markCalendarSetupSeen } from "@/lib/time-off-engine";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar, Sparkles, Clock, CalendarDays, ShieldCheck } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface FirstTimeCalendarSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherId: string;
  onOpenSetupFlow: () => void;
}

export function FirstTimeCalendarSetupModal({
  isOpen,
  onClose,
  teacherId,
  onOpenSetupFlow,
}: FirstTimeCalendarSetupModalProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handlePrimaryClick = async () => {
    setLoading(true);
    await markCalendarSetupSeen(teacherId);
    setLoading(false);
    onClose();
    onOpenSetupFlow();
  };

  const handleSecondaryClick = async () => {
    setLoading(true);
    await markCalendarSetupSeen(teacherId);
    setLoading(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleSecondaryClick()}>
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden border-border bg-card shadow-2xl">
        {/* Header decoration */}
        <div className="bg-[#163020] text-[#F4EBE1] p-6 space-y-2 text-center relative overflow-hidden">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-400 mb-2">
            <CalendarDays className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold text-[#F4EBE1] font-display">
            {t("calendar.firstTimeSetupTitle")}
          </DialogTitle>
          <DialogDescription className="text-xs text-[#F4EBE1]/80 leading-relaxed max-w-sm mx-auto">
            {t("calendar.firstTimeSetupSubtitle")}
          </DialogDescription>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 text-xs text-stone-700 dark:text-stone-300">
          <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-500/20 space-y-2">
            <p className="font-semibold text-stone-800 dark:text-stone-200 leading-relaxed">
              {t("calendar.firstTimeNotice")}
            </p>
          </div>

          <div className="flex items-start gap-2 text-muted-foreground text-[11px]">
            <Clock className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
            <p>
              {t("calendar.firstTimeLaterNotice")}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <DialogFooter className="p-4 bg-muted/30 border-t border-border flex flex-col sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={handleSecondaryClick}
            className="w-full sm:w-auto text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t("calendar.doLater")}
          </Button>

          <Button
            type="button"
            disabled={loading}
            onClick={handlePrimaryClick}
            className="w-full sm:w-auto bg-[#163020] text-[#F4EBE1] hover:bg-[#163020]/90 text-xs font-bold gap-1.5 cursor-pointer shadow-md"
          >
            <Sparkles className="w-4 h-4 text-emerald-400" />
            {t("calendar.setupNow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

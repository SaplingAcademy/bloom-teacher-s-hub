import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import type { RescheduleWarning } from "@/lib/reschedule-occurrence";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";

export function RescheduleWarningDialog({ warnings, onAnswer }: {
  warnings: RescheduleWarning[];
  onAnswer: (confirmed: boolean) => void;
}) {
  const { t } = useLanguage();
  const first = warnings[0];
  return (
    <AlertDialog open={warnings.length > 0} onOpenChange={(open) => { if (!open) onAnswer(false); }}>
      <AlertDialogContent className="max-w-md rounded-2xl border-border bg-card p-6">
        <AlertDialogHeader className="text-left">
          <AlertTriangle className="h-5 w-5 text-accent" />
          <AlertDialogTitle className="font-display">
            {t(`calendarUi.rescheduleWarningTitle_${first || "conflict"}`)}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm text-muted-foreground">
              {warnings.map((warning) => <p key={warning}>{t(`calendarUi.rescheduleWarning_${warning}`)}</p>)}
              <p>{t("calendarUi.rescheduleWarningQuestion")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:space-x-0">
          <AlertDialogCancel onClick={() => onAnswer(false)}>{t("calendarUi.rescheduleCancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => onAnswer(true)}>{t("calendarUi.rescheduleAnyway")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
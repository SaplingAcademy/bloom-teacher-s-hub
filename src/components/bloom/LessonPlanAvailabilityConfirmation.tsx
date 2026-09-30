import { Link } from "@tanstack/react-router";
import { CalendarCheck2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface LessonPlanAvailabilityConfirmationProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
}

export function LessonPlanAvailabilityConfirmation({
  isOpen,
  onOpenChange,
  onContinue,
}: LessonPlanAvailabilityConfirmationProps) {
  const { t } = useLanguage();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md rounded-2xl border-border bg-card p-6 shadow-xl">
        <AlertDialogHeader className="gap-2 text-left">
          <div className="mb-1 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
            <CalendarCheck2 className="h-5 w-5" />
          </div>
          <AlertDialogTitle className="font-display text-xl text-foreground">
            {t("students.availabilityConfirmationTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">
                {t("students.availabilityConfirmationLead")}
              </p>
              <p>{t("students.availabilityConfirmationDescription")}</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="mt-2 gap-2 sm:space-x-0">
          <AlertDialogCancel asChild>
            <Link
              to="/calendar"
              search={{ availability: "working_hours" }}
              className="w-full sm:w-auto"
            >
              {t("students.reviewCalendar")}
            </Link>
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onContinue}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 sm:w-auto"
          >
            {t("students.continueLessonPlanGeneration")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
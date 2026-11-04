import { useLanguage } from "@/hooks/use-language";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function UnsavedChangesDialog({ open, onKeepEditing, onLeave }: { open: boolean; onKeepEditing: () => void; onLeave: () => void }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) onKeepEditing(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("teachingOptions.unsavedTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("teachingOptions.unsavedBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onKeepEditing}>{t("teachingOptions.keepEditing")}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onLeave}>{t("teachingOptions.leaveWithoutSaving")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

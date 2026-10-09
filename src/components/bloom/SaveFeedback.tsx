import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage } from "@/hooks/use-language";
import type { SaveStatus } from "@/hooks/use-save-feedback";

/** Button label for routine saves: label → Salvando... → ✓ Alterações salvas. */
export function SaveButtonLabel({ status, label, icon }: { status: SaveStatus; label?: ReactNode; icon?: ReactNode }) {
  const { t } = useLanguage();
  if (status === "saving")
    return (<><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t("saveFeedback.saving")}</>);
  if (status === "saved")
    return (<><Check className="h-4 w-4" aria-hidden />{t("saveFeedback.saved")}</>);
  return (<>{icon}{label ?? t("saveFeedback.save")}</>);
}

/** Human-readable error shown next to the save action. */
export function SaveErrorMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}

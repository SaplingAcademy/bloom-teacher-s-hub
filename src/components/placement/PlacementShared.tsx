import { DatabaseZap } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";
import { PLACEMENT_NOT_DEPLOYED, isPlacementLocked, type TemplateStatus } from "@/lib/placement";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<TemplateStatus, string> = {
  draft: "border-amber-300/70 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  published: "border-primary/30 bg-primary/10 text-primary",
  archived: "border-border bg-muted text-muted-foreground",
};

export function PlacementStatusBadge({ status, className }: { status: TemplateStatus; className?: string }) {
  const { t } = useLanguage();
  return (
    <Badge variant="outline" data-placement-status={status} className={cn("shrink-0 font-semibold", STATUS_CLASS[status], className)}>
      {t(`placement.status.${status}`)}
    </Badge>
  );
}

/** Tables of the manual migration are not applied yet: explain, never simulate persistence. */
export function PlacementUnavailable() {
  const { t } = useLanguage();
  return (
    <section data-testid="placement-not-deployed" className="mx-auto max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
      <DatabaseZap className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-display text-lg font-bold">{t("placement.notDeployedTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("placement.notDeployedBody")}</p>
    </section>
  );
}

/** Teacher-facing message for a failed placement write; the real error stays in the console. */
export function placementErrorMessage(error: unknown, t: (key: string) => string): string {
  console.error("[placement] Action failed:", error);
  if (isPlacementLocked(error)) return t("placement.locked");
  if (error instanceof Error && error.message === PLACEMENT_NOT_DEPLOYED) return t("placement.notDeployedBody");
  return t("placement.actionError");
}

export function PlacementConfirm({
  open, title, body, destructive = false, busy, onCancel, onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  destructive?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next && !busy) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("placement.cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={busy}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={(event) => { event.preventDefault(); onConfirm(); }}>
            {t("placement.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

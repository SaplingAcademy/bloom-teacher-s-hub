import { useRef, useState } from "react";
import { CalendarX2, Pencil, RotateCcw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LessonPlanQuantity } from "@/lib/lesson-plan-quantity";

export function LessonPlanQuantityDialog({ quantity, onEdit, onRestart }: {
  quantity: LessonPlanQuantity | null; onEdit: () => void; onRestart: () => void;
}) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const edit = () => { setConfirming(false); onEdit(); };
  const body = t("lessonPlanGeneration.shortageBody").replace("{requested}", String(quantity?.requested))
    .replace("{possible}", String(quantity?.possible));
  return <Dialog open={Boolean(quantity)} onOpenChange={(open) => { if (!open) edit(); }}>
    <DialogContent closeLabel={t("common.close")} className="max-w-md w-[calc(100%-2rem)] max-h-[90dvh] overflow-y-auto rounded-2xl bg-card border-border"
      onOpenAutoFocus={(event) => { event.preventDefault(); editRef.current?.focus(); }}
      onCloseAutoFocus={(event) => event.preventDefault()}>
      <DialogHeader className="text-left gap-2">
        <CalendarX2 className="h-8 w-8 text-primary" />
        <DialogTitle className="font-display text-xl">{t(confirming ? "lessonPlanGeneration.restartTitle" : "lessonPlanGeneration.shortageTitle")}</DialogTitle>
        <DialogDescription>{confirming ? t("lessonPlanGeneration.restartBody") : body}</DialogDescription>
      </DialogHeader>
      {!confirming && quantity && <dl className="divide-y divide-border">
        {(["requested", "possible", "missing"] as const).map((key) => <div key={key} className="flex justify-between gap-4 py-3">
          <dt className="text-sm text-muted-foreground">{t(`lessonPlanGeneration.${key}`)}</dt>
          <dd className="font-display text-lg font-semibold tabular-nums text-foreground">{quantity[key]}</dd>
        </div>)}
      </dl>}
      <DialogFooter className="gap-2 sm:space-x-0">
        <Button ref={editRef} variant="outline" onClick={confirming ? () => setConfirming(false) : edit} className="gap-2">
          {!confirming && <Pencil className="h-4 w-4" />}{t(confirming ? "common.cancel" : "lessonPlanGeneration.edit")}
        </Button>
        <Button variant={confirming ? "destructive" : "secondary"} className="gap-2" onClick={() => {
          if (!confirming) { setConfirming(true); return; }
          setConfirming(false); onRestart();
        }}><RotateCcw className="h-4 w-4" />{t(confirming ? "lessonPlanGeneration.confirmRestart" : "lessonPlanGeneration.restart")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
import { useState } from "react";
import { Check, Circle, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { toDateTimeLocal } from "@/lib/lead-interactions";
import { validateConfirmationDate, type ConfirmationChoice, type PriorStep } from "@/lib/lead-stage-confirmation";
interface Props { steps: PriorStep[]; leadName: string; saving: boolean; started: boolean; error: string | null; onCancel: () => void; onConfirm: (choices: Partial<Record<PriorStep, ConfirmationChoice>>) => Promise<void> }
export function LeadStageConfirmationDialog({ steps, leadName, saving, started, error, onCancel, onConfirm }: Props) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0), [choices, setChoices] = useState<Partial<Record<PriorStep, ConfirmationChoice>>>({}), [dateError, setDateError] = useState<string | null>(null);
  const step = steps[index]; if (!step) return null;
  const choice = choices[step];
  const choose = (happened: boolean) => { setDateError(null); setChoices((prev) => ({ ...prev, [step]: happened ? { happened: true, occurredAt: prev[step]?.happened ? prev[step].occurredAt : "" } : { happened: false } })); };
  const next = async () => {
    if (!choice) return;
    if (choice.happened) { const issue = validateConfirmationDate(choice.occurredAt); if (issue) { setDateError(t(`leadStageConfirmation.${issue}`)); return; } }
    setDateError(null);
    if (index + 1 < steps.length) setIndex(index + 1); else await onConfirm(choices);
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !saving && !started) onCancel(); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md" onEscapeKeyDown={(e) => { if (saving || started) e.preventDefault(); }} onPointerDownOutside={(e) => { if (saving || started) e.preventDefault(); }}>
    <DialogHeader><DialogTitle>{t("leadStageConfirmation.title")}</DialogTitle><DialogDescription>{leadName} · {t("leadStageConfirmation.stepCount").replace("{current}", String(index + 1)).replace("{total}", String(steps.length))}</DialogDescription></DialogHeader>
    <p className="text-sm text-muted-foreground">{t("leadStageConfirmation.intro")}</p><h3 className="text-base font-semibold">{t(`leadStageConfirmation.questions.${step}`)}</h3>
    <div className="grid gap-2" role="group" aria-label={t(`leadStageConfirmation.questions.${step}`)}>
      <Button type="button" variant={choice?.happened ? "secondary" : "outline"} className="h-auto min-h-11 justify-start gap-2 whitespace-normal py-3 text-left" aria-pressed={choice?.happened === true} disabled={saving || started} onClick={() => choose(true)}><Check aria-hidden />{t("leadStageConfirmation.yes")}</Button>
      <Button type="button" variant={choice && !choice.happened ? "secondary" : "outline"} className="h-auto min-h-11 justify-start gap-2 whitespace-normal py-3 text-left" aria-pressed={choice?.happened === false} disabled={saving || started} onClick={() => choose(false)}><Circle aria-hidden />{t("leadStageConfirmation.no")}</Button>
    </div>
    {choice?.happened && <div className="space-y-2"><Label htmlFor="prior-step-date">{t("leadStageConfirmation.actualDate")}</Label><Input id="prior-step-date" type="datetime-local" className="min-w-0" value={choice.occurredAt} max={toDateTimeLocal(new Date())} disabled={saving || started} aria-invalid={Boolean(dateError)} onChange={(e) => { setChoices({ ...choices, [step]: { happened: true, occurredAt: e.target.value } }); setDateError(null); }} /><p className="text-xs text-muted-foreground">{t("leadStageConfirmation.dateHint")}</p></div>}
    {(dateError || error) && <p role="alert" className="text-sm text-destructive">{dateError || error}</p>}
    <DialogFooter className="flex-wrap gap-2"><Button type="button" variant="ghost" disabled={saving || started} onClick={onCancel}>{t("common.cancel")}</Button>{index > 0 && <Button type="button" variant="outline" disabled={saving || started} onClick={() => { setIndex(index - 1); setDateError(null); }}><ArrowLeft aria-hidden />{t("leadStageConfirmation.back")}</Button>}<Button type="button" disabled={!choice || saving} onClick={() => void next()}>{t(saving ? "leadStageConfirmation.saving" : error && started ? "leadStageConfirmation.retry" : index + 1 === steps.length ? "leadStageConfirmation.continue" : "leadStageConfirmation.next")}<ArrowRight aria-hidden /></Button></DialogFooter>
  </DialogContent></Dialog>;
}
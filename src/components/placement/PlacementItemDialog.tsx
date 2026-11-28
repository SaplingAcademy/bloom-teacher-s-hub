import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";
import {
  CEFR_LEVELS, EDITABLE_ITEM_TYPES, buildItemPayload, emptyItemDraft, itemDraftFrom, itemTypesForSkill,
  type ItemDraft, type ItemDraftError, type ItemDraftSource, type ItemPayload, type PlacementItemType, type PlacementSkill,
} from "@/lib/placement";
import { validateBankMeta, type BankMeta, type BankMetaError } from "@/lib/placement-bank";

/**
 * Create/edit one question of a draft section — or, with `bank`, a reusable Question Bank question
 * (adds topic/subskill; super_admin also chooses whether an official question is published). Only
 * formats that can be persisted and validated now are selectable; the payload is checked with the
 * same rules as the database before saving.
 */
export function PlacementItemDialog({
  open, skill, item, itemTimeLimits, busy, onClose, onSave, bank,
}: {
  open: boolean;
  skill: PlacementSkill;
  item: ItemDraftSource | null;
  /** Template timing mode is "per task": the item carries its own limit. */
  itemTimeLimits: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: ItemPayload, meta?: BankMeta) => void;
  /** Question Bank mode: initial topic/subskill and whether the publish switch is shown (official bank). */
  bank?: { initial: BankMeta; official: boolean };
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ItemDraft>(() => (item ? itemDraftFrom(item) : emptyItemDraft(skill)));
  const [errors, setErrors] = useState<ItemDraftError[]>([]);
  const [meta, setMeta] = useState<BankMeta>(() => bank?.initial ?? { topic: "", subskill: "", published: true });
  const [metaErrors, setMetaErrors] = useState<BankMetaError[]>([]);
  useEffect(() => {
    if (open) {
      setDraft(item ? itemDraftFrom(item) : emptyItemDraft(skill)); setErrors([]);
      setMeta(bank?.initial ?? { topic: "", subskill: "", published: true }); setMetaErrors([]);
    }
    // bank.initial is read only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, skill]);

  const set = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const types = itemTypesForSkill(skill);
  const manual = draft.item_type === "open_text" || draft.item_type === "oral_response";
  const err = (key: ItemDraftError) => errors.includes(key)
    ? <p role="alert" className="text-xs text-destructive">{t(`placement.item.errors.${key}`)}</p> : null;
  const skillLabel = t(`placement.skills.${skill}`);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const result = buildItemPayload(skill, draft, item?.metadata ?? {});
    const nextMetaErrors = bank ? validateBankMeta(meta.topic, meta.subskill) : [];
    setMetaErrors(nextMetaErrors);
    if (!result.ok) { setErrors(result.errors); return; }
    setErrors([]);
    if (nextMetaErrors.length) return;
    onSave(result.payload, bank ? meta : undefined);
  };
  const title = bank
    ? (item ? t("placement.bank.editTitle") : bank.official ? t("placement.bank.createOfficialTitle") : t("placement.bank.createTitle"))
    : (item ? t("placement.item.editTitle") : t("placement.item.createTitle"));

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" data-testid="placement-item-dialog">
        <DialogHeader>
          <DialogTitle>{title.replace("{skill}", skillLabel)}</DialogTitle>
          <DialogDescription className="sr-only">{skillLabel}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4" noValidate>
          {bank && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="placement-bank-topic">{t("placement.bank.topic")}</Label>
                <Input id="placement-bank-topic" maxLength={80} value={meta.topic} placeholder={t("placement.bank.topicPlaceholder")}
                  aria-invalid={metaErrors.includes("topic") || undefined} onChange={(e) => setMeta((m) => ({ ...m, topic: e.target.value }))} />
                {metaErrors.includes("topic") && <p role="alert" className="text-xs text-destructive">{t("placement.bank.errors.topic")}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="placement-bank-subskill">{t("placement.bank.subskill")}</Label>
                <Input id="placement-bank-subskill" maxLength={80} value={meta.subskill} placeholder={t("placement.bank.subskillPlaceholder")}
                  aria-invalid={metaErrors.includes("subskill") || undefined} onChange={(e) => setMeta((m) => ({ ...m, subskill: e.target.value }))} />
                {metaErrors.includes("subskill") && <p role="alert" className="text-xs text-destructive">{t("placement.bank.errors.subskill")}</p>}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("placement.item.type")}</Label>
              <Select value={draft.item_type} onValueChange={(v) => setDraft((d) => ({ ...emptyItemDraft(skill), text: d.text, level: d.level, item_type: v as PlacementItemType }))}>
                <SelectTrigger data-testid="placement-item-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {types.map((type) => {
                    const available = EDITABLE_ITEM_TYPES.includes(type);
                    return (
                      <SelectItem key={type} value={type} disabled={!available}>
                        {t(`placement.item.types.${type}`)}{available ? "" : ` · ${t("placement.item.unavailable")}`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {err("type")}
            </div>
            <div className="space-y-1.5">
              <Label>{t("placement.item.level")}</Label>
              <Select value={draft.level} onValueChange={(v) => set("level", v as ItemDraft["level"])}>
                <SelectTrigger data-testid="placement-item-level"><SelectValue /></SelectTrigger>
                <SelectContent>{CEFR_LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
              {err("level")}
            </div>
          </div>

          {skill === "reading" && (
            <div className="space-y-1.5">
              <Label htmlFor="placement-item-passage">{t("placement.item.passage")}</Label>
              <Textarea id="placement-item-passage" rows={4} maxLength={8000} value={draft.passage}
                placeholder={t("placement.item.passagePlaceholder")} onChange={(e) => set("passage", e.target.value)} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="placement-item-text">{t("placement.item.prompt")}</Label>
            <Textarea id="placement-item-text" rows={3} maxLength={4000} value={draft.text}
              placeholder={t("placement.item.promptPlaceholder")} onChange={(e) => set("text", e.target.value)} aria-invalid={errors.includes("text") || undefined} />
            {err("text")}
          </div>

          {(draft.item_type === "single_choice" || draft.item_type === "multiple_choice") && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("placement.item.options")}</legend>
              <p className="text-xs text-muted-foreground">{t(draft.item_type === "single_choice" ? "placement.item.correctOne" : "placement.item.correctMany")}</p>
              {draft.options.map((option, index) => {
                const checked = draft.correct.includes(index);
                const label = t("placement.item.option").replace("{n}", String(index + 1));
                return (
                  <div key={index} className="flex items-center gap-2" data-option-index={index}>
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox checked={checked} aria-label={`${label} — ${t("placement.item.markCorrect")}`}
                        onCheckedChange={(v) => set("correct", draft.item_type === "single_choice"
                          ? (v === true ? [index] : [])
                          : (v === true ? [...draft.correct, index] : draft.correct.filter((i) => i !== index)))} />
                      {t("placement.item.markCorrect")}
                    </label>
                    <Input value={option} maxLength={500} aria-label={label} placeholder={label}
                      onChange={(e) => set("options", draft.options.map((o, i) => (i === index ? e.target.value : o)))} />
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={draft.options.length <= 2}
                      aria-label={t("placement.item.removeOption").replace("{n}", String(index + 1))}
                      onClick={() => setDraft((d) => ({
                        ...d,
                        options: d.options.filter((_, i) => i !== index),
                        correct: d.correct.filter((i) => i !== index).map((i) => (i > index ? i - 1 : i)),
                      }))}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" disabled={draft.options.length >= 8}
                onClick={() => set("options", [...draft.options, ""])}>
                <Plus className="h-3.5 w-3.5" /> {t("placement.item.addOption")}
              </Button>
              {err("options")}{err("correct")}
            </fieldset>
          )}

          {draft.item_type === "true_false" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("placement.item.trueFalseAnswer")}</legend>
              <RadioGroup value={draft.trueFalse === null ? "" : String(draft.trueFalse)} onValueChange={(v) => set("trueFalse", v === "true")} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="true" />{t("placement.item.true")}</label>
                <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="false" />{t("placement.item.false")}</label>
              </RadioGroup>
              {err("trueFalse")}
            </fieldset>
          )}

          {draft.item_type === "gap_fill" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("placement.item.accepted")}</legend>
              <p className="text-xs text-muted-foreground">{t("placement.item.acceptedHint")}</p>
              {draft.accepted.map((answer, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={answer} maxLength={200} placeholder={t("placement.item.acceptedPlaceholder")} aria-label={`${t("placement.item.acceptedPlaceholder")} ${index + 1}`}
                    onChange={(e) => set("accepted", draft.accepted.map((a, i) => (i === index ? e.target.value : a)))} />
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={draft.accepted.length <= 1}
                    aria-label={t("placement.item.removeOption").replace("{n}", String(index + 1))}
                    onClick={() => set("accepted", draft.accepted.filter((_, i) => i !== index))}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 text-xs" disabled={draft.accepted.length >= 10}
                onClick={() => set("accepted", [...draft.accepted, ""])}>
                <Plus className="h-3.5 w-3.5" /> {t("placement.item.addAccepted")}
              </Button>
              {err("accepted")}
            </fieldset>
          )}

          {manual && (
            <div className="space-y-1.5">
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{t("placement.item.manualNote")}</p>
              <Label htmlFor="placement-item-rubric">{t("placement.item.rubric")}</Label>
              <Textarea id="placement-item-rubric" rows={2} maxLength={2000} value={draft.rubric}
                placeholder={t("placement.item.rubricPlaceholder")} onChange={(e) => set("rubric", e.target.value)} />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="placement-item-points">{t("placement.item.points")}</Label>
              <Input id="placement-item-points" type="number" min={0.5} max={100} step={0.5} value={draft.points}
                onChange={(e) => set("points", Number(e.target.value))} />
              {err("points")}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="placement-item-estimated">{t("placement.item.estimated")}</Label>
              <Input id="placement-item-estimated" type="number" min={5} max={3600} value={draft.estimated_seconds ?? ""}
                onChange={(e) => set("estimated_seconds", e.target.value ? Number(e.target.value) : null)} />
              {err("estimated")}
            </div>
            {itemTimeLimits && !bank && (
              <div className="space-y-1.5">
                <Label htmlFor="placement-item-limit">{t("placement.item.timeLimit")}</Label>
                <Input id="placement-item-limit" type="number" min={5} max={3600} value={draft.timeLimitSeconds ?? ""}
                  onChange={(e) => set("timeLimitSeconds", e.target.value ? Number(e.target.value) : null)} />
                {err("timeLimit")}
              </div>
            )}
          </div>

          {!manual && (
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
              <Switch checked={draft.is_screening} onCheckedChange={(v) => set("is_screening", v)} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{t("placement.item.screening")}</span>
                <span className="block text-xs text-muted-foreground">{t("placement.item.screeningHint")}</span>
              </span>
            </label>
          )}
          {err("screening")}

          {bank?.official && (
            <label className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
              <Switch checked={meta.published} onCheckedChange={(v) => setMeta((m) => ({ ...m, published: v }))} className="mt-0.5" data-testid="placement-bank-published" />
              <span>
                <span className="block text-sm font-medium">{t("placement.bank.publishOfficial")}</span>
                <span className="block text-xs text-muted-foreground">{t("placement.bank.publishOfficialHint")}</span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>{t("placement.cancel")}</Button>
            <Button type="submit" disabled={busy} data-testid="placement-item-save">{busy ? t("placement.form.saving") : t("placement.form.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

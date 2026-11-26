import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";
import {
  PLACEMENT_SKILLS, validateTemplateDraft, type PlacementSkill, type TemplateDraftError, type TemplateDraftInput, type TimingMode,
} from "@/lib/placement";
import { cn } from "@/lib/utils";

/**
 * Title, description, skills (1–6, ordered) and timing of a placement template. Used to create a
 * draft and to edit a draft's settings. Presentation only: the parent persists the result.
 */
export function PlacementTemplateForm({
  initial, submitLabel, busy, onSubmit, onCancel, warnOnRemove = false,
}: {
  initial: TemplateDraftInput;
  submitLabel: string;
  busy: boolean;
  onSubmit: (value: TemplateDraftInput) => void;
  onCancel?: () => void;
  /** Editing an existing draft: unselecting a skill deletes its questions. */
  warnOnRemove?: boolean;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [skills, setSkills] = useState<PlacementSkill[]>(initial.skills);
  const [timing, setTiming] = useState<TimingMode>(initial.timing);
  const [testMinutes, setTestMinutes] = useState<string>(initial.testMinutes ? String(initial.testMinutes) : "");
  const [errors, setErrors] = useState<TemplateDraftError[]>([]);
  const [attempted, setAttempted] = useState(false);
  const current = (): TemplateDraftInput => ({
    title, description, skills, timing, testMinutes: timing === "test" ? Number(testMinutes) || null : null,
  });
  // After the first save attempt, messages follow the fields live (fixed fields stop showing errors).
  useEffect(() => {
    if (attempted) setErrors(validateTemplateDraft(current()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempted, title, skills, timing, testMinutes]);
  const removedFromInitial = warnOnRemove && initial.skills.some((s) => !skills.includes(s));

  const toggle = (skill: PlacementSkill, on: boolean) =>
    setSkills((current) => (on ? [...current, skill] : current.filter((s) => s !== skill)));
  const move = (index: number, delta: -1 | 1) =>
    setSkills((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = current();
    const found = validateTemplateDraft(value);
    setAttempted(true);
    setErrors(found);
    if (found.length === 0) onSubmit(value);
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="placement-title">{t("placement.form.title")}</Label>
        <Input id="placement-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)}
          placeholder={t("placement.form.titlePlaceholder")} aria-invalid={errors.includes("title") || undefined} />
        {errors.includes("title") && <p role="alert" className="text-xs text-destructive">{t("placement.form.errors.title")}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="placement-description">{t("placement.form.description")}</Label>
        <Textarea id="placement-description" value={description} maxLength={2000} rows={2}
          onChange={(e) => setDescription(e.target.value)} placeholder={t("placement.form.descriptionPlaceholder")} />
      </div>

      <fieldset className="space-y-2" aria-describedby="placement-skills-hint">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium">{t("placement.form.skills")}</legend>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSkills([...PLACEMENT_SKILLS])}>
              {t("placement.form.selectAll")}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setSkills([])}>
              {t("placement.form.clearAll")}
            </Button>
          </div>
        </div>
        <p id="placement-skills-hint" className="text-xs text-muted-foreground">{t("placement.form.skillsHint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PLACEMENT_SKILLS.map((skill) => (
            <label key={skill} className={cn("flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
              skills.includes(skill) ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/50")}>
              <Checkbox checked={skills.includes(skill)} onCheckedChange={(v) => toggle(skill, v === true)} data-skill={skill} />
              {t(`placement.skills.${skill}`)}
            </label>
          ))}
        </div>
        {skills.length > 0 && (
          <ol className="mt-2 space-y-1 rounded-lg border border-border bg-muted/20 p-2" aria-label={t("placement.form.order")}>
            {skills.map((skill, index) => {
              const label = t(`placement.skills.${skill}`);
              return (
                <li key={skill} data-order-skill={skill} className="flex items-center gap-2 rounded-md bg-card px-2 py-1 text-sm">
                  <span className="w-5 text-center text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                  <span className="flex-1">{label}</span>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0}
                    aria-label={t("placement.form.moveUp").replace("{skill}", label)} onClick={() => move(index, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={index === skills.length - 1}
                    aria-label={t("placement.form.moveDown").replace("{skill}", label)} onClick={() => move(index, 1)}>
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ol>
        )}
        {errors.includes("skills") && <p role="alert" className="text-xs text-destructive">{t("placement.form.errors.skills")}</p>}
        {removedFromInitial && <p className="text-xs text-amber-700 dark:text-amber-400">{t("placement.form.skillsChangeWarning")}</p>}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("placement.form.timing")}</legend>
        <RadioGroup value={timing} onValueChange={(v) => setTiming(v as TimingMode)} className="gap-1.5">
          {(["none", "test", "skill", "item"] as TimingMode[]).map((mode) => (
            <label key={mode} className="flex cursor-pointer items-center gap-2 text-sm">
              <RadioGroupItem value={mode} data-timing={mode} />
              {t(`placement.form.timing${mode[0].toUpperCase()}${mode.slice(1)}`)}
            </label>
          ))}
        </RadioGroup>
        {timing === "test" && (
          <div className="flex items-center gap-2 pl-6">
            <Label htmlFor="placement-test-minutes" className="sr-only">{t("placement.form.testMinutes")}</Label>
            <Input id="placement-test-minutes" type="number" inputMode="numeric" min={1} max={600} className="h-8 w-24"
              value={testMinutes} onChange={(e) => setTestMinutes(e.target.value)} aria-invalid={errors.includes("testMinutes") || undefined} />
            <span className="text-xs text-muted-foreground">{t("placement.form.minutes")}</span>
          </div>
        )}
        {timing === "skill" && <p className="pl-6 text-xs text-muted-foreground">{t("placement.form.timingSkillHint")}</p>}
        {timing === "item" && <p className="pl-6 text-xs text-muted-foreground">{t("placement.form.timingItemHint")}</p>}
        {errors.includes("testMinutes") && <p role="alert" className="pl-6 text-xs text-destructive">{t("placement.form.errors.testMinutes")}</p>}
      </fieldset>

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>{t("placement.cancel")}</Button>}
        <Button type="submit" disabled={busy}>{busy ? t("placement.form.saving") : submitLabel}</Button>
      </div>
    </form>
  );
}

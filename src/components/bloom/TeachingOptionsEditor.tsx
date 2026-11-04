import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Save } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CatalogValidationError, type CatalogCategory, type CatalogOptions, type ModalityNature } from "@/lib/catalog-options";
import { addCatalogOption, moveCatalogOption, prepareCatalogForSave, renameCatalogOption, setCatalogModalityNature, setCatalogOptionActive } from "@/lib/catalog-editor";
import { CatalogSettingsError } from "@/lib/catalog-settings";

const categories: CatalogCategory[] = ["levels", "focuses", "modalities"];
const natures: ModalityNature[] = ["online", "in_person", "hybrid"];

function OrderButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function NaturePicker({ id, value, disabled, invalid, onChange }: { id: string; value?: ModalityNature; disabled: boolean; invalid?: boolean; onChange: (value: ModalityNature) => void }) {
  const { t } = useLanguage();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{t("teachingOptions.nature")}</Label>
      <Select value={value ?? ""} disabled={disabled} onValueChange={(next) => { if (natures.includes(next as ModalityNature)) onChange(next as ModalityNature); }}>
        <SelectTrigger id={id} aria-invalid={invalid}><SelectValue placeholder={t("teachingOptions.chooseNature")} /></SelectTrigger>
        <SelectContent>{natures.map((nature) => <SelectItem key={nature} value={nature}>{t(`teachingOptions.${nature}`)}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

export function TeachingOptionsEditor({ initialCatalog, onSave }: { initialCatalog: CatalogOptions; onSave: (catalog: CatalogOptions) => Promise<CatalogOptions> }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(initialCatalog);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [adding, setAdding] = useState<CatalogCategory | null>(null);
  const [newName, setNewName] = useState("");
  const [newNature, setNewNature] = useState<ModalityNature | undefined>();
  const [addAttempted, setAddAttempted] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const savingRef = useRef(false);

  function change(next: CatalogOptions) {
    setDraft(next);
    setSaved(false);
    setError(null);
  }

  function cancelAddition() {
    setAdding(null);
    setNewName("");
    setNewNature(undefined);
    setAddAttempted(false);
  }

  function add(category: CatalogCategory) {
    setAddAttempted(true);
    if (!newName.trim() || (category === "modalities" && !newNature)) return;
    try {
      change(addCatalogOption(draft, category, crypto.randomUUID(), newName, newNature));
      cancelAddition();
    } catch (failure) {
      setError(t(failure instanceof CatalogValidationError && failure.issues.some((issue) => issue.code === "duplicate_id") ? "teachingOptions.duplicateId" : "teachingOptions.invalidCatalog"));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setAttempted(true);
    setSaved(false);
    setError(null);
    try {
      const catalog = prepareCatalogForSave(draft);
      savingRef.current = true;
      setSaving(true);
      const persisted = await onSave(catalog);
      setDraft(persisted);
      setSaved(true);
    } catch (failure) {
      const key = failure instanceof CatalogSettingsError
        ? failure.reason === "authentication" ? "authentication" : "missingSettings"
        : failure instanceof CatalogValidationError
          ? failure.issues.some((issue) => issue.code === "duplicate_id") ? "duplicateId"
            : categories.some((category) => draft[category].some((option) => !option.label.trim())) ? "requiredName" : "invalidCatalog"
          : "saveError";
      setError(t(`teachingOptions.${key}`));
      requestAnimationFrame(() => form.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]')?.focus());
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <form ref={form} onSubmit={save} noValidate className="max-w-4xl space-y-8">
        <h2 className="font-display text-xl font-semibold text-foreground">{t("teachingOptions.title")}</h2>
        {categories.map((category) => (
          <section key={category} aria-labelledby={`teaching-${category}`} className="space-y-3 border-t border-border pt-5">
            <h3 id={`teaching-${category}`} className="font-display text-base font-semibold text-foreground">{t(`teachingOptions.${category}`)}</h3>
            <div className="divide-y divide-border">
              {draft[category].map((option, index) => {
                const inputId = `teaching-${category}-${option.id}`;
                const invalid = attempted && !option.label.trim();
                return (
                  <div key={option.id} className="grid grid-cols-[minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className={`grid min-w-0 gap-3 ${category === "modalities" ? "sm:grid-cols-[minmax(0,1fr)_10rem]" : ""}`}>
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor={inputId} className="text-xs text-muted-foreground">{t("teachingOptions.name")}</Label>
                        <Input id={inputId} value={option.label} disabled={saving} aria-invalid={invalid} aria-describedby={invalid ? `${inputId}-error` : undefined} onChange={(event) => change(renameCatalogOption(draft, category, option.id, event.target.value))} />
                        {invalid && <p id={`${inputId}-error`} className="text-xs text-destructive">{t("teachingOptions.requiredName")}</p>}
                      </div>
                      {category === "modalities" && "nature" in option && <NaturePicker id={`${inputId}-nature`} value={option.nature} disabled={saving} onChange={(nature) => change(setCatalogModalityNature(draft, option.id, nature))} />}
                    </div>
                    <div className="flex h-9 shrink-0 items-center justify-end gap-3">
                      <div className="flex items-center gap-2">
                        <Switch id={`${inputId}-active`} checked={option.active} disabled={saving} onCheckedChange={(active) => change(setCatalogOptionActive(draft, category, option.id, active))} />
                        <Label htmlFor={`${inputId}-active`} className="w-12 text-xs text-muted-foreground">{t(option.active ? "teachingOptions.active" : "teachingOptions.inactive")}</Label>
                      </div>
                      <div className="flex gap-0.5">
                        <OrderButton label={t("teachingOptions.moveUp")} disabled={saving || index === 0} onClick={() => change(moveCatalogOption(draft, category, option.id, -1))}><ArrowUp /></OrderButton>
                        <OrderButton label={t("teachingOptions.moveDown")} disabled={saving || index === draft[category].length - 1} onClick={() => change(moveCatalogOption(draft, category, option.id, 1))}><ArrowDown /></OrderButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {draft[category].length === 0 && <p className="text-sm text-muted-foreground">{t("teachingOptions.empty")}</p>}
            {adding === category ? (
              <div className="space-y-3 border-t border-border pt-4">
                <div className={`grid gap-3 ${category === "modalities" ? "sm:grid-cols-[minmax(0,1fr)_10rem]" : ""}`}>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`new-${category}`}>{t("teachingOptions.newName")}</Label>
                    <Input id={`new-${category}`} autoFocus disabled={saving} value={newName} aria-invalid={addAttempted && !newName.trim()} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); add(category); } }} />
                    {addAttempted && !newName.trim() && <p role="alert" className="text-xs text-destructive">{t("teachingOptions.requiredName")}</p>}
                  </div>
                  {category === "modalities" && <NaturePicker id="new-modality-nature" value={newNature} disabled={saving} invalid={addAttempted && !newNature} onChange={setNewNature} />}
                </div>
                {category === "modalities" && addAttempted && !newNature && <p role="alert" className="text-xs text-destructive">{t("teachingOptions.requiredNature")}</p>}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" disabled={saving} onClick={() => add(category)}><Plus />{t("teachingOptions.add")}</Button>
                  <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={cancelAddition}>{t("teachingOptions.cancel")}</Button>
                </div>
              </div>
            ) : (
              <Button type="button" size="sm" variant="outline" disabled={saving || adding !== null} onClick={() => { setAdding(category); setAddAttempted(false); }}><Plus />{t("teachingOptions.add")}</Button>
            )}
          </section>
        ))}
        <div className="flex flex-col items-start gap-3 border-t border-border pt-5 sm:items-end">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Check className="h-4 w-4" />{t("teachingOptions.saved")}</p>}
          <Button type="submit" disabled={saving || adding !== null}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{t(saving ? "saveFeedback.saving" : "teachingOptions.save")}</Button>
        </div>
      </form>
    </TooltipProvider>
  );
}
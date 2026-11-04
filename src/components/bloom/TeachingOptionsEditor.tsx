import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { CatalogValidationError, type CatalogCategory, type CatalogOptions, type ModalityNature } from "@/lib/catalog-options";
import { addCatalogOption, moveCatalogOption, prepareCatalogForSave, renameCatalogOption, setCatalogModalityNature, setCatalogOptionActive } from "@/lib/catalog-editor";
import { CatalogSettingsError, type CatalogLifecycleResult } from "@/lib/catalog-settings";

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

export function TeachingOptionsEditor({ initialCatalog, onSave, onLifecycle }: {
  initialCatalog: CatalogOptions;
  onSave: (catalog: CatalogOptions) => Promise<CatalogOptions>;
  onLifecycle: (catalog: CatalogOptions, category: CatalogCategory, id: string, action: "remove" | "restore") => Promise<CatalogLifecycleResult>;
}) {
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
  const baseline = useRef(initialCatalog);
  const [pendingRemoval, setPendingRemoval] = useState<{ category: CatalogCategory; id: string; label: string } | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleMessage, setLifecycleMessage] = useState<string | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const busy = saving || lifecycleBusy;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current);

  function requestRemoval(category: CatalogCategory, id: string, label: string) {
    setError(null);
    setLifecycleMessage(null);
    setLifecycleError(null);
    setPendingRemoval({ category, id, label });
  }

  async function runLifecycle(category: CatalogCategory, id: string, action: "remove" | "restore") {
    if (savingRef.current) return;
    if (dirty || adding) {
      if (action === "remove") setLifecycleError(t("teachingOptions.saveFirst"));
      else setError(t("teachingOptions.saveFirst"));
      return;
    }
    savingRef.current = true;
    setLifecycleBusy(true);
    setLifecycleError(null);
    setError(null);
    setSaved(false);
    setLifecycleMessage(null);
    try {
      const result = await onLifecycle(baseline.current, category, id, action);
      baseline.current = result.catalog;
      setDraft(result.catalog);
      setLifecycleMessage(t(`teachingOptions.${result.action}`));
      setPendingRemoval(null);
    } catch (failure) {
      const key = failure instanceof CatalogSettingsError
        ? failure.reason === "authentication" ? "authentication" : failure.reason === "changed" ? "changed" : "missingSettings"
        : action === "remove" ? "removeError" : "restoreError";
      if (action === "remove") setLifecycleError(t(`teachingOptions.${key}`));
      else setError(t(`teachingOptions.${key}`));
    } finally {
      savingRef.current = false;
      setLifecycleBusy(false);
    }
  }

  function change(next: CatalogOptions) {
    setDraft(next);
    setSaved(false);
    setError(null);
    setLifecycleMessage(null);
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
      baseline.current = persisted;
      setDraft(persisted);
      setSaved(true);
    } catch (failure) {
      const key = failure instanceof CatalogSettingsError
        ? failure.reason === "authentication" ? "authentication" : failure.reason === "changed" ? "changed" : "missingSettings"
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
        <fieldset disabled={busy} className="min-w-0 space-y-8">
        {categories.map((category) => (
          <section key={category} aria-labelledby={`teaching-${category}`} className="space-y-3 border-t border-border pt-5">
            <h3 id={`teaching-${category}`} className="font-display text-base font-semibold text-foreground">{t(`teachingOptions.${category}`)}</h3>
            <div className="divide-y divide-border">
              {draft[category].filter((option) => option.active).map((option, index, activeOptions) => {
                const inputId = `teaching-${category}-${option.id}`;
                const invalid = attempted && !option.label.trim();
                return (
                  <div key={option.id} className="grid grid-cols-[minmax(0,1fr)] gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className={`grid min-w-0 gap-3 ${category === "modalities" ? "lg:grid-cols-[minmax(0,1fr)_10rem]" : ""}`}>
                      <div className="min-w-0 space-y-1.5">
                        <Label htmlFor={inputId} className="text-xs text-muted-foreground">{t("teachingOptions.name")}</Label>
                        <Input id={inputId} value={option.label} disabled={saving} aria-invalid={invalid} aria-describedby={invalid ? `${inputId}-error` : undefined} onChange={(event) => change(renameCatalogOption(draft, category, option.id, event.target.value))} />
                        {invalid && <p id={`${inputId}-error`} className="text-xs text-destructive">{t("teachingOptions.requiredName")}</p>}
                      </div>
                      {category === "modalities" && "nature" in option && (option.nature === "online" || option.nature === "in_person" || option.nature === "hybrid") && <NaturePicker id={`${inputId}-nature`} value={option.nature} disabled={busy} onChange={(nature) => change(setCatalogModalityNature(draft, option.id, nature))} />}
                    </div>
                    <div className="flex h-9 shrink-0 items-center justify-end gap-3">
                      <div className="flex items-center gap-2">
                        <Switch id={`${inputId}-active`} checked={option.active} disabled={saving} onCheckedChange={(active) => change(setCatalogOptionActive(draft, category, option.id, active))} />
                        <Label htmlFor={`${inputId}-active`} className="w-12 text-xs text-muted-foreground">{t(option.active ? "teachingOptions.active" : "teachingOptions.inactive")}</Label>
                      </div>
                      <div className="flex gap-0.5">
                        <OrderButton label={t("teachingOptions.moveUp")} disabled={saving || index === 0} onClick={() => change(moveCatalogOption(draft, category, option.id, -1))}><ArrowUp /></OrderButton>
                        <OrderButton label={t("teachingOptions.moveDown")} disabled={busy || index === activeOptions.length - 1} onClick={() => change(moveCatalogOption(draft, category, option.id, 1))}><ArrowDown /></OrderButton>
                        <OrderButton label={t("teachingOptions.remove")} disabled={busy} onClick={() => requestRemoval(category, option.id, option.label)}><Trash2 className="text-destructive" /></OrderButton>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {!draft[category].some((option) => option.active) && <p className="text-sm text-muted-foreground">{t("teachingOptions.empty")}</p>}
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
        </fieldset>
        {categories.some((category) => draft[category].some((option) => !option.active)) && (
          <section aria-labelledby="teaching-archived" className="space-y-4 border-t border-border pt-5">
            <h3 id="teaching-archived" className="font-display text-base font-semibold">{t("teachingOptions.archivedTitle")}</h3>
            {categories.map((category) => {
              const inactive = draft[category].filter((option) => !option.active);
              if (!inactive.length) return null;
              return <section key={category} aria-labelledby={`archived-${category}`} className="space-y-2">
                <h4 id={`archived-${category}`} className="text-sm font-semibold text-muted-foreground">{t(`teachingOptions.${category}`)}</h4>
                <div className="divide-y divide-border">{inactive.map((option) => <div key={option.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="break-words text-sm">{option.label}</p>{"nature" in option && <p className="text-xs text-muted-foreground">{t(`teachingOptions.${option.nature}`)}</p>}</div>
                  <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={busy} onClick={() => { void runLifecycle(category, option.id, "restore"); }}><RotateCcw />{t("teachingOptions.restore")}</Button>
                </div>)}</div>
              </section>;
            })}
          </section>
        )}
        <div className="flex flex-col items-start gap-3 border-t border-border pt-5 sm:items-end">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Check className="h-4 w-4" />{t("teachingOptions.saved")}</p>}
          {lifecycleMessage && <p role="status" className="flex items-center gap-2 text-sm text-primary"><Check className="h-4 w-4" />{lifecycleMessage}</p>}
          <Button type="submit" disabled={busy || adding !== null}>{saving ? <Loader2 className="animate-spin" /> : <Save />}{t(saving ? "saveFeedback.saving" : "teachingOptions.save")}</Button>
        </div>
      </form>
      <AlertDialog open={pendingRemoval !== null} onOpenChange={(open) => { if (!open && !lifecycleBusy) setPendingRemoval(null); }}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("teachingOptions.removeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("teachingOptions.removeDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-words text-sm font-semibold">{pendingRemoval?.label}</p>
          {lifecycleError && <p role="alert" className="text-sm text-destructive">{lifecycleError}</p>}
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" disabled={lifecycleBusy} onClick={() => setPendingRemoval(null)}>{t("teachingOptions.cancel")}</Button>
            <Button type="button" variant="destructive" disabled={lifecycleBusy} onClick={() => { if (pendingRemoval) void runLifecycle(pendingRemoval.category, pendingRemoval.id, "remove"); }}>
              {lifecycleBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}{t(lifecycleBusy ? "teachingOptions.removing" : "teachingOptions.confirmRemove")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
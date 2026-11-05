import { useEffect, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { ITEM_TYPES, PROJECT_COLORS, PROJECT_ICONS, prepareItemDraft, type ItemDraft, type PreparedItem, type ProjectDraft, type WorkspacePhase } from "@/lib/workspace-projects";
import { colorOf, projectIcon } from "./project-appearance";

export function ProjectDialog({ open, initial, onClose, onSave, pending }: { open: boolean; initial: ProjectDraft | null; onClose: () => void; onSave: (draft: ProjectDraft) => Promise<boolean>; pending: boolean }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<ProjectDraft>({ title: "", description: "", color: "forest", icon: "folder" });
  const [error, setError] = useState(false);
  useEffect(() => { if (open) { setDraft(initial ?? { title: "", description: "", color: "forest", icon: "folder" }); setError(false); } }, [open, initial]);
  const submit = async () => {
    if (!draft.title.trim()) { setError(true); document.getElementById("project-title")?.focus(); return; }
    if (await onSave(draft)) onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t(initial ? "workspace.projects.edit" : "workspace.projects.new")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="project-title">{t("workspace.projects.titleLabel")}</Label>
            <Input id="project-title" value={draft.title} maxLength={120} aria-invalid={error} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(false); }} placeholder={t("workspace.projects.titlePlaceholder")} />
            {error && <p className="text-xs text-destructive">{t("workspace.projects.titleRequired")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="project-description">{t("workspace.projects.descriptionLabel")}</Label>
            <Textarea id="project-description" rows={3} maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("workspace.projects.descriptionPlaceholder")} />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("workspace.projects.colorLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((color) => (
                <button key={color} type="button" aria-pressed={draft.color === color} aria-label={t(`workspace.projects.colors.${color}`)} onClick={() => setDraft({ ...draft, color })}
                  className="flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground/40"
                  style={{ backgroundColor: colorOf(color) }}>
                  {draft.color === color && <Check className="h-4 w-4 text-primary-foreground" aria-hidden />}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">{t("workspace.projects.iconLabel")}</legend>
            <div className="grid grid-cols-8 gap-1.5">
              {PROJECT_ICONS.map((icon) => { const Icon = projectIcon(icon); return (
                <button key={icon} type="button" aria-pressed={draft.icon === icon} aria-label={t(`workspace.projects.icons.${icon}`)} onClick={() => setDraft({ ...draft, icon })}
                  className={cn("flex aspect-square items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", draft.icon === icon && "border-primary bg-primary/10 text-primary")}>
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              ); })}
            </div>
          </fieldset>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t("workspace.mural.cancel")}</Button>
            <Button type="submit" disabled={pending}>{pending ? t("workspace.mural.saving") : t("workspace.mural.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TitleDialog({ open, title, label, initial, onClose, onSave, pending }: { open: boolean; title: string; label: string; initial: string; onClose: () => void; onSave: (value: string) => Promise<boolean>; pending: boolean }) {
  const { t } = useLanguage();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(false);
  useEffect(() => { if (open) { setValue(initial); setError(false); } }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (!value.trim()) { setError(true); return; } if (await onSave(value)) onClose(); }}>
          <div className="space-y-1.5">
            <Label htmlFor="title-dialog-input">{label}</Label>
            <Input id="title-dialog-input" autoFocus value={value} maxLength={120} aria-invalid={error} onChange={(e) => { setValue(e.target.value); setError(false); }} />
            {error && <p className="text-xs text-destructive">{t("workspace.projects.titleRequired")}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t("workspace.mural.cancel")}</Button>
            <Button type="submit" disabled={pending}>{t("workspace.mural.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const GENERAL = "__general__";
export function ItemDialog({ open, initial, isNew, phases, onClose, onSave, pending }: { open: boolean; initial: ItemDraft; isNew: boolean; phases: WorkspacePhase[]; onClose: () => void; onSave: (item: PreparedItem) => Promise<boolean>; pending: boolean }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setDraft(initial); setError(null); } }, [open, initial]);
  const submit = async () => {
    let prepared: PreparedItem;
    try { prepared = prepareItemDraft(draft, phases); } catch (e) { setError((e as Error).message); return; }
    if (await onSave(prepared)) onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{t(isNew ? "workspace.project.newItem" : "workspace.project.editItem")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("workspace.project.typeLabel")}</Label>
              <Select value={draft.type} onValueChange={(v) => { setDraft({ ...draft, type: v as ItemDraft["type"] }); setError(null); }}>
                <SelectTrigger aria-label={t("workspace.project.typeLabel")}><SelectValue /></SelectTrigger>
                <SelectContent>{ITEM_TYPES.map((type) => <SelectItem key={type} value={type}>{t(`workspace.project.types.${type}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("workspace.project.phaseLabel")}</Label>
              <Select value={draft.phase_id ?? GENERAL} onValueChange={(v) => setDraft({ ...draft, phase_id: v === GENERAL ? null : v })}>
                <SelectTrigger aria-label={t("workspace.project.phaseLabel")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GENERAL}>{t("workspace.project.general")}</SelectItem>
                  {phases.map((phase) => <SelectItem key={phase.id} value={phase.id}>{phase.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-title">{t("workspace.projects.titleLabel")}</Label>
            <Input id="item-title" value={draft.title} maxLength={200} aria-invalid={error === "title_required"} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(null); }} />
            {error === "title_required" && <p className="text-xs text-destructive">{t("workspace.projects.titleRequired")}</p>}
          </div>
          {draft.type === "link" ? (
            <div className="space-y-1.5">
              <Label htmlFor="item-url">{t("workspace.project.urlLabel")}</Label>
              <Input id="item-url" inputMode="url" placeholder="https://" value={draft.url} aria-invalid={error === "invalid_url"} onChange={(e) => { setDraft({ ...draft, url: e.target.value }); setError(null); }} />
              {error === "invalid_url" && <p className="text-xs text-destructive">{t("workspace.project.invalidUrl")}</p>}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="item-content">{t(draft.type === "note" ? "workspace.mural.contentLabel" : "workspace.project.detailsLabel")}</Label>
              <Textarea id="item-content" rows={draft.type === "note" ? 5 : 3} maxLength={5000} value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t("workspace.mural.cancel")}</Button>
            <Button type="submit" disabled={pending}>{t("workspace.mural.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmDialog({ open, title, body, confirm, onClose, onConfirm }: { open: boolean; title: string; body: ReactNode; confirm: string; onClose: () => void; onConfirm: () => void }) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{title}</AlertDialogTitle><AlertDialogDescription>{body}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("workspace.mural.cancel")}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onConfirm}>{confirm}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

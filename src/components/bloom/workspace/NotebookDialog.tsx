import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";
import { NOTEBOOK_COLORS, NOTEBOOK_ICONS, type NotebookDraft } from "@/lib/workspace-notebooks";
import { cn } from "@/lib/utils";
import { notebookIcon, notebookSwatches } from "./notebook-appearance";

export function NotebookDialog({ initial, pending, onClose, onSave }: { initial: NotebookDraft | null; pending: boolean; onClose: () => void; onSave: (draft: NotebookDraft) => Promise<boolean> }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState<NotebookDraft>(initial ?? { title: "", description: "", color: "forest", icon: "book-open" });
  const [error, setError] = useState(false);
  useEffect(() => { setDraft(initial ?? { title: "", description: "", color: "forest", icon: "book-open" }); }, [initial]);
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader><DialogTitle>{t(initial ? "workspace.notebooks.edit" : "workspace.notebooks.new")}</DialogTitle><DialogDescription className="sr-only">{t("workspace.notebooks.titleLabel")}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={async (e) => { e.preventDefault(); if (!draft.title.trim()) { setError(true); return; } if (await onSave(draft)) onClose(); }}>
        <div className="space-y-1.5"><Label htmlFor="notebook-title">{t("workspace.notebooks.titleLabel")}</Label><Input autoFocus id="notebook-title" maxLength={120} value={draft.title} aria-invalid={error} onChange={(e) => { setDraft({ ...draft, title: e.target.value }); setError(false); }} />{error && <p className="text-sm text-destructive">{t("workspace.notebooks.titleRequired")}</p>}</div>
        <div className="space-y-1.5"><Label htmlFor="notebook-description">{t("workspace.notebooks.descriptionLabel")}</Label><Textarea id="notebook-description" rows={3} maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("workspace.notebooks.colorLabel")}</legend><div className="flex flex-wrap gap-2">
          {NOTEBOOK_COLORS.map((color) => <Button key={color} type="button" size="icon" variant="ghost" aria-label={t(`workspace.projects.colors.${color}`)} aria-pressed={draft.color === color} className={cn("h-9 w-9 rounded-full text-primary-foreground ring-offset-2 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-ring", notebookSwatches[color])} onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check aria-hidden />}</Button>)}
        </div></fieldset>
        <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("workspace.notebooks.iconLabel")}</legend><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {NOTEBOOK_ICONS.map((icon) => { const Icon = notebookIcon(icon); return <Button key={icon} type="button" size="icon" variant="outline" className={cn("w-full", draft.icon === icon && "border-primary bg-primary/10 text-primary")} aria-label={t(`workspace.projects.icons.${icon}`)} aria-pressed={draft.icon === icon} onClick={() => setDraft({ ...draft, icon })}><Icon aria-hidden /></Button>; })}
        </div></fieldset>
        <DialogFooter><Button type="button" variant="ghost" disabled={pending} onClick={onClose}>{t("workspace.mural.cancel")}</Button><Button type="submit" disabled={pending}>{t(pending ? "workspace.mural.saving" : "workspace.mural.save")}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
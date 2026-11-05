import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { NOTE_COLORS, type NoteDraft } from "@/lib/workspace-notes";
import { cn } from "@/lib/utils";
import { noteSurface } from "./note-appearance";

export interface NoteEditorState { id: string; isNew: boolean; draft: NoteDraft }

export function NoteEditor({ editor, pending, onClose, onSave }: {
  editor: NoteEditorState; pending: boolean; onClose: () => void; onSave: (draft: NoteDraft) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(editor.draft);
  const [error, setError] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent closeLabel={t("workspace.mural.close")} aria-describedby={undefined}
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg motion-reduce:animate-none">
        <DialogHeader><DialogTitle className="tracking-normal">{t(editor.isNew ? "workspace.mural.newNote" : "workspace.mural.editNote")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          if (!draft.content.trim()) { setError(true); return; }
          if (await onSave(draft)) onClose();
        }}>
          <div className="space-y-2">
            <Label htmlFor="workspace-note-title">{t("workspace.mural.titleLabel")}</Label>
            <Input id="workspace-note-title" value={draft.title} disabled={pending} placeholder={t("workspace.mural.titlePlaceholder")}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-note-content">{t("workspace.mural.contentLabel")}</Label>
            <Textarea id="workspace-note-content" autoFocus value={draft.content} disabled={pending} aria-required aria-invalid={error}
              aria-describedby={error ? "workspace-note-error" : undefined} placeholder={t("workspace.mural.contentPlaceholder")}
              className={cn("min-h-36 max-h-72 text-note-ink", noteSurface[draft.color])}
              onChange={(event) => { setDraft({ ...draft, content: event.target.value }); setError(false); }} />
            {error && <p id="workspace-note-error" role="alert" className="text-sm text-destructive">{t("workspace.mural.contentRequired")}</p>}
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("workspace.mural.colorLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((color) => <Button key={color} type="button" variant="ghost" size="icon" disabled={pending}
                aria-label={t(`workspace.mural.colors.${color}`)} title={t(`workspace.mural.colors.${color}`)} aria-pressed={draft.color === color}
                className={cn("h-9 w-9 rounded-full border border-note-ink/15 text-note-ink hover:ring-2 hover:ring-ring hover:ring-offset-2", noteSurface[color],
                  draft.color === color && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
                onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check aria-hidden />}</Button>)}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>{t("workspace.mural.cancel")}</Button>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{t(pending ? "workspace.mural.saving" : "workspace.mural.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
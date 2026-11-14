import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { NOTE_COLORS, type NoteDraft } from "@/lib/workspace-notes";
import { cn } from "@/lib/utils";
import { noteSurface } from "./note-appearance";
import { MAX_IMAGES_PER_NOTE, NoteImageError, prepareImage, type NoteImage, type PreparedImage } from "@/lib/workspace-note-images";
import type { NoteImageChanges, NoteImageResult } from "@/hooks/use-workspace-note-images";

export interface NoteEditorState { id: string; isNew: boolean; draft: NoteDraft }
/** null = the note text was not saved; otherwise which image changes failed (empty = all saved). */
export type NoteSaveOutcome = NoteImageResult | null;

const ACCEPT = "image/jpeg,image/png,image/webp";
const errorKey = (error: unknown) => error instanceof NoteImageError
  ? ({ image_type: "type", image_too_large: "tooLarge", image_limit: "limit", image_process: "process" } as const)[error.code] : "process";

export function NoteEditor({ editor, pending, images = [], urls = {}, onClose, onSave }: {
  editor: NoteEditorState; pending: boolean; images?: readonly NoteImage[]; urls?: Readonly<Record<string, string>>;
  onClose: () => void; onSave: (draft: NoteDraft, changes: NoteImageChanges, kept: readonly NoteImage[]) => Promise<NoteSaveOutcome>;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState(editor.draft);
  const [error, setError] = useState(false);
  // Image edits stay local until Save: nothing is uploaded or removed when the editor is cancelled.
  const [removed, setRemoved] = useState<NoteImage[]>([]);
  const [added, setAdded] = useState<(PreparedImage & { preview: string; failed?: boolean })[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  useEffect(() => () => { previews.current.forEach((url) => URL.revokeObjectURL(url)); }, []);
  const busy = pending || saving || processing;
  const kept = images.filter((image) => !removed.some((entry) => entry.id === image.id));
  const count = kept.length + added.length;
  const imageLabel = (key: string, n: number) => t(`workspace.mural.images.${key}`).replace("{n}", String(n));

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setImageError(null);
    const slots = MAX_IMAGES_PER_NOTE - count;
    const selected = Array.from(files);
    if (selected.length > slots) setImageError(t("workspace.mural.images.limit"));
    setProcessing(true);
    try {
      for (const file of selected.slice(0, Math.max(0, slots))) {
        try {
          const image = await prepareImage(file);
          const preview = URL.createObjectURL(image.blob);
          previews.current.add(preview);
          setAdded((current) => [...current, { ...image, preview }]);
        } catch (failure) {
          setImageError(t(`workspace.mural.images.${errorKey(failure)}`));
        }
      }
    } finally {
      setProcessing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  const dropAdded = (id: string) => setAdded((current) => current.filter((image) => {
    if (image.id !== id) return true;
    URL.revokeObjectURL(image.preview);
    previews.current.delete(image.preview);
    return false;
  }));
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent closeLabel={t("workspace.mural.close")} aria-describedby={undefined}
        className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg motion-reduce:animate-none">
        <DialogHeader><DialogTitle className="tracking-normal">{t(editor.isNew ? "workspace.mural.newNote" : "workspace.mural.editNote")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (pending) return;
          if (busy) return;
          if (!draft.content.trim()) { setError(true); return; }
          setSaving(true);
          try {
            const outcome = await onSave(draft, { removed, added }, kept);
            if (!outcome) return;
            if (!outcome.failedRemovals.length && !outcome.failedUploads.length) { onClose(); return; }
            // Keep only what still needs saving; the next Save retries exactly those.
            setRemoved((current) => current.filter((image) => outcome.failedRemovals.includes(image.id)));
            added.filter((image) => !outcome.failedUploads.includes(image.id)).forEach((image) => dropAdded(image.id));
            setAdded((current) => current.map((image) => ({ ...image, failed: outcome.failedUploads.includes(image.id) })));
            setImageError(t("workspace.mural.images.saveError"));
          } finally {
            setSaving(false);
          }
        }}>
          <div className="space-y-2">
            <Label htmlFor="workspace-note-title">{t("workspace.mural.titleLabel")}</Label>
            <Input id="workspace-note-title" value={draft.title} disabled={busy} placeholder={t("workspace.mural.titlePlaceholder")}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-note-content">{t("workspace.mural.contentLabel")}</Label>
            <Textarea id="workspace-note-content" autoFocus value={draft.content} disabled={busy} aria-required aria-invalid={error}
              aria-describedby={error ? "workspace-note-error" : undefined} placeholder={t("workspace.mural.contentPlaceholder")}
              className={cn("min-h-36 max-h-72 text-note-ink", noteSurface[draft.color])}
              onChange={(event) => { setDraft({ ...draft, content: event.target.value }); setError(false); }} />
            {error && <p id="workspace-note-error" role="alert" className="text-sm text-destructive">{t("workspace.mural.contentRequired")}</p>}
          </div>
          <fieldset className="space-y-2" aria-describedby="workspace-note-images-hint">
            <legend className="mb-1 text-sm font-medium">{t("workspace.mural.images.label")}</legend>
            <p id="workspace-note-images-hint" className="text-xs text-muted-foreground">{t("workspace.mural.images.hint")}</p>
            {count > 0 && <ul className="grid grid-cols-3 gap-2" data-testid="editor-images">
              {kept.map((image, index) => <EditorThumb key={image.id} src={urls[image.file_path]} alt={imageLabel("alt", index + 1)}
                removeLabel={imageLabel("remove", index + 1)} disabled={busy} onRemove={() => setRemoved((current) => [...current, image])} />)}
              {added.map((image, index) => <EditorThumb key={image.id} src={image.preview} alt={imageLabel("alt", kept.length + index + 1)}
                removeLabel={imageLabel("remove", kept.length + index + 1)} disabled={busy} failed={image.failed}
                failedLabel={t("workspace.mural.images.notSaved")} onRemove={() => dropAdded(image.id)} />)}
            </ul>}
            <input ref={fileInput} type="file" accept={ACCEPT} multiple hidden data-testid="note-image-input"
              onChange={(event) => void addFiles(event.target.files)} />
            <Button type="button" variant="outline" size="sm" disabled={busy || count >= MAX_IMAGES_PER_NOTE} onClick={() => fileInput.current?.click()}>
              {processing ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden /> : <ImagePlus aria-hidden />}
              {t(processing ? "workspace.mural.images.processing" : "workspace.mural.images.add")}
            </Button>
            {imageError && <p role="alert" className="text-sm text-destructive">{imageError}</p>}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{t("workspace.mural.colorLabel")}</legend>
            <div className="flex flex-wrap gap-2">
              {NOTE_COLORS.map((color) => <Button key={color} type="button" variant="ghost" size="icon" disabled={busy}
                aria-label={t(`workspace.mural.colors.${color}`)} title={t(`workspace.mural.colors.${color}`)} aria-pressed={draft.color === color}
                className={cn("h-9 w-9 rounded-full border border-note-ink/15 text-note-ink hover:ring-2 hover:ring-ring hover:ring-offset-2", noteSurface[color],
                  draft.color === color && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
                onClick={() => setDraft({ ...draft, color })}>{draft.color === color && <Check aria-hidden />}</Button>)}
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{t("workspace.mural.cancel")}</Button>
            <Button type="submit" disabled={busy}>{(pending || saving) && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{t(pending || saving ? "workspace.mural.saving" : "workspace.mural.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function EditorThumb({ src, alt, removeLabel, disabled, failed, failedLabel, onRemove }: {
  src?: string; alt: string; removeLabel: string; disabled: boolean; failed?: boolean; failedLabel?: string; onRemove: () => void;
}) {
  return (
    <li className={cn("relative aspect-square overflow-hidden rounded-md border bg-muted", failed && "border-destructive ring-1 ring-destructive")}>
      {src ? <img src={src} alt={alt} draggable={false} className="h-full w-full object-cover" /> : <span aria-label={alt} role="img" className="block h-full w-full animate-pulse motion-reduce:animate-none" />}
      {failed && <span className="absolute inset-x-0 bottom-0 bg-destructive/90 px-1 py-0.5 text-center text-[10px] text-destructive-foreground">{failedLabel}</span>}
      <Button type="button" variant="secondary" size="icon" disabled={disabled} aria-label={removeLabel} title={removeLabel}
        className="absolute right-1 top-1 h-6 w-6 rounded-full shadow-sm" onClick={onRemove}><X className="h-3.5 w-3.5" aria-hidden /></Button>
    </li>
  );
}

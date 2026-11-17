import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { toast } from "sonner";
import { BringToFront, Lock, LockOpen, MoreHorizontal, Pencil, Plus, SendToBack, Spline, StickyNote, Trash2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspaceNotes } from "@/hooks/use-workspace-notes";
import { useNoteConnections } from "@/hooks/use-note-connections";
import { connectRefusal, connectionsOf, visibleConnections } from "@/lib/workspace-note-connections";
import { canLayer, type NoteDraft, type WorkspaceNote } from "@/lib/workspace-notes";
import { useWorkspaceNoteImages, type NoteImageChanges } from "@/hooks/use-workspace-note-images";
import type { NoteImage } from "@/lib/workspace-note-images";
import { cn } from "@/lib/utils";
import { WorkspaceGridSkeleton } from "./WorkspaceShell";
import { NoteEditor, type NoteEditorState, type NoteSaveOutcome } from "./NoteEditor";
import { NoteImages } from "./NoteImages";
import { noteSurface } from "./note-appearance";
import { NotesCanvas } from "./NotesCanvas";

/** Thin green-grey grid lines (24 × 24px) for the board surface; low opacity so the notes stay in front. */
const BOARD_GRID: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, oklch(0.55 0.03 150 / 0.09) 1px, transparent 1px), linear-gradient(to bottom, oklch(0.55 0.03 150 / 0.09) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
};

/** Free positioning starts at the md breakpoint; narrower screens keep the stacked grid without drag. */
const FREE_BOARD_QUERY = "(min-width: 768px)";
function subscribeFreeBoard(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(FREE_BOARD_QUERY);
  media.addEventListener?.("change", onChange);
  return () => media.removeEventListener?.("change", onChange);
}
const isFreeBoard = () => typeof window !== "undefined" && Boolean(window.matchMedia?.(FREE_BOARD_QUERY).matches);

/**
 * The personal board (default, unchanged) or one project's board (projectId). readOnly (archived
 * projects) shows notes and images but hides every write control; the hook and RLS also block writes.
 * On a shared project board every participant edits any note, images stay with the note's author and
 * deleting another author's note is reserved to the project owner (isProjectOwner); RLS enforces it.
 */
export function NotesBoard({ projectId = null, readOnly = false, isProjectOwner = true, title }: { projectId?: string | null; readOnly?: boolean; isProjectOwner?: boolean; title?: string } = {}) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const isAuthor = (note: Pick<WorkspaceNote, "user_id">) => note.user_id === user?.id;
  const canDelete = (note: WorkspaceNote) => !projectId || isProjectOwner || isAuthor(note);
  const { notes, isLoading, error, pending, execute, refetch } = useWorkspaceNotes(projectId, { readOnly });
  const heading = title ?? t("workspace.mural.title");
  const [editor, setEditor] = useState<NoteEditorState | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceNote | null>(null);
  const noteImages = useWorkspaceNoteImages(projectId);
  const imageAlt = (n: number) => t("workspace.mural.images.alt").replace("{n}", String(n));
  /**
   * Text first (unchanged text on an existing note is not rewritten), then image changes. The
   * success toast only appears when both parts are saved; partial failures keep the editor open.
   */
  const saveNote = async (state: NoteEditorState, draft: NoteDraft, changes: NoteImageChanges, kept: readonly NoteImage[]): Promise<NoteSaveOutcome> => {
    const hasImageChanges = changes.removed.length > 0 || changes.added.length > 0;
    const textChanged = state.isNew || draft.title !== state.draft.title || draft.content !== state.draft.content || draft.color !== state.draft.color;
    if (textChanged) {
      if (!await execute({ type: state.isNew ? "create" : "edit", id: state.id, draft }, { quiet: hasImageChanges })) return null;
      // The note exists now: later retries are edits of the same note.
      setEditor((current) => current?.id === state.id ? { ...current, isNew: false, draft } : current);
    }
    if (!hasImageChanges) return { failedRemovals: [], failedUploads: [] };
    let result;
    try { result = await noteImages.saveNoteImages(state.id, changes, kept); }
    catch { result = { failedRemovals: changes.removed.map((image) => image.id), failedUploads: changes.added.map((image) => image.id) }; }
    if (result.failedRemovals.length || result.failedUploads.length) toast.error(t("workspace.mural.images.saveError"), { id: "workspace-notes-feedback" });
    else toast.success(t("workspace.mural.saved"), { id: "workspace-notes-feedback", duration: 1800 });
    return result;
  };
  const startCreate = () => {
    toast.dismiss("workspace-notes-feedback");
    setEditor({ id: crypto.randomUUID(), isNew: true, draft: { title: "", content: "", color: "yellow" } });
  };
  const startEdit = (note: WorkspaceNote) => {
    toast.dismiss("workspace-notes-feedback");
    setEditor({ id: note.id, isNew: false, draft: { title: note.title ?? "", content: note.content, color: note.color } });
  };
  const freeBoard = useSyncExternalStore(subscribeFreeBoard, isFreeBoard, () => false);
  const allNotes = notes ?? [];
  // Connections exist only on the personal board ("Meu Mural"); project boards are unchanged.
  const noteConnections = useNoteConnections(!projectId);
  const connectionsOn = noteConnections.available && !readOnly;
  const noteIds = new Set(allNotes.map((note) => note.id));
  const connections = connectionsOn ? visibleConnections(noteConnections.connections, noteIds) : [];
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const connecting = connectionsOn && freeBoard && connectingFrom !== null && noteIds.has(connectingFrom);
  const noteLabel = (id: string) => {
    const other = allNotes.find((note) => note.id === id);
    return (other?.title || other?.content || "").trim().slice(0, 40) || "…";
  };
  // Esc cancels connect mode (also left automatically when the board switches to the stacked grid).
  useEffect(() => {
    if (!connecting) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setConnectingFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [connecting]);
  const pickTarget = async (target: WorkspaceNote) => {
    const from = connectingFrom;
    setConnectingFrom(null);
    if (!from || from === target.id) return;
    const refusal = connectRefusal(noteConnections.connections, noteIds, from, target.id);
    if (refusal === "exists") { toast.info(t("workspace.mural.connections.exists"), { id: "workspace-notes-feedback" }); return; }
    if (refusal) return;
    if (await noteConnections.connect(from, target.id)) toast.success(t("workspace.mural.connections.connected"), { id: "workspace-notes-feedback", duration: 1800 });
  };
  const renderNote = (note: WorkspaceNote) => (
    <article data-note-id={note.id} aria-busy={pending} data-connect-source={connecting && connectingFrom === note.id ? true : undefined}
      className={cn("min-w-0 rounded-lg border border-note-ink/10 p-4 text-note-ink shadow-note", noteSurface[note.color] ?? noteSurface.neutral,
        connecting && (connectingFrom === note.id ? "ring-2 ring-primary ring-offset-2" : "hover:ring-2 hover:ring-primary/40"))}>
      {readOnly ? (note.pinned && <div className="-mr-1 -mt-1 mb-1 flex h-8 justify-end"><Lock className="m-2 h-4 w-4" aria-label={t("workspace.mural.pinned")} /></div>) : <div className="-mr-1 -mt-1 mb-1 flex justify-end gap-1" data-no-drag>
        <Button variant="ghost" size="icon" className={cn("h-8 w-8 text-note-ink hover:bg-note-ink/10 hover:text-note-ink", note.pinned && "bg-note-ink/10")}
          disabled={pending} aria-label={t(note.pinned ? "workspace.mural.unpin" : "workspace.mural.pin")}
          title={t(note.pinned ? "workspace.mural.unpin" : "workspace.mural.pin")} aria-pressed={note.pinned}
          onClick={() => void execute({ type: "pin", id: note.id, pinned: !note.pinned })}>
          {note.pinned ? <Lock aria-hidden /> : <LockOpen aria-hidden />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-note-ink hover:bg-note-ink/10 hover:text-note-ink"
            disabled={pending} aria-label={t("workspace.mural.actions")} title={t("workspace.mural.actions")}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => startEdit(note)}><Pencil />{t("workspace.mural.edit")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canLayer(allNotes, note.id, "front")} onSelect={() => void execute({ type: "layer", id: note.id, to: "front" })}><BringToFront />{t("workspace.mural.bringFront")}</DropdownMenuItem>
            <DropdownMenuItem disabled={!canLayer(allNotes, note.id, "back")} onSelect={() => void execute({ type: "layer", id: note.id, to: "back" })}><SendToBack />{t("workspace.mural.sendBack")}</DropdownMenuItem>
            {connectionsOn && (freeBoard && allNotes.length > 1 || connectionsOf(connections, note.id).length > 0) && <>
              <DropdownMenuSeparator />
              {freeBoard && allNotes.length > 1 && <DropdownMenuItem onSelect={() => setConnectingFrom(note.id)}><Spline />{t("workspace.mural.connections.connect")}</DropdownMenuItem>}
              {connectionsOf(connections, note.id).map(({ connection, otherId }) => (
                <DropdownMenuItem key={connection.id} onSelect={async () => {
                  if (await noteConnections.disconnect(connection.id)) toast.success(t("workspace.mural.connections.removed"), { id: "workspace-notes-feedback", duration: 1800 });
                }}><Unlink />{t("workspace.mural.connections.remove").replace("{note}", noteLabel(otherId))}</DropdownMenuItem>
              ))}
            </>}
            {canDelete(note) && <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(note)}><Trash2 />{t("workspace.mural.delete")}</DropdownMenuItem>
            </>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>}
      <Button variant="ghost" disabled={pending} aria-label={readOnly ? note.title || note.content.slice(0, 60) : `${t("workspace.mural.edit")}: ${note.title || note.content.slice(0, 60)}`}
        className={cn("block h-auto min-h-12 w-full overflow-hidden whitespace-normal p-0 text-left text-note-ink hover:bg-transparent hover:text-note-ink", readOnly && "cursor-default")}
        onClick={() => { if (connecting) void pickTarget(note); else if (!readOnly) startEdit(note); }}>
        {note.title && <span className="mb-2 block break-words font-display text-base font-semibold tracking-normal">{note.title}</span>}
        <span className="block max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm font-normal leading-relaxed [overflow-wrap:anywhere]">{note.content}</span>
        <NoteImages images={noteImages.byNote[note.id] ?? []} urls={noteImages.urls} label={imageAlt} />
      </Button>
    </article>
  );
  const groups = [true, false].map((pinned) => ({ pinned, notes: (notes ?? []).filter((note) => note.pinned === pinned) }));

  return (
    <section className="space-y-5" aria-label={heading}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold tracking-normal">{heading}</h2>
        {!readOnly && <Button onClick={startCreate} disabled={pending || !notes}><Plus aria-hidden />{t("workspace.mural.newNote")}</Button>}
      </div>
      {readOnly && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-testid="board-read-only">{t("workspace.project.pages.readOnly")}</p>}
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 p-4 text-sm">
        <p className="flex-1 text-destructive">{t("workspace.mural.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={pending}>{t("workspace.mural.retry")}</Button>
      </div>}
      {connecting && <div role="status" data-testid="connect-mode" className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
        <Spline className="h-4 w-4 text-primary" aria-hidden />
        <p className="flex-1 text-foreground">{t("workspace.mural.connections.banner")} <span className="text-muted-foreground">{t("workspace.mural.connections.cancelHint")}</span></p>
        <Button variant="outline" size="sm" onClick={() => setConnectingFrom(null)}>{t("workspace.mural.connections.cancel")}</Button>
      </div>}
      {/* Board surface: soft 24px grid where the notes are pinned (empty areas included). */}
      <div className="min-h-[22rem] space-y-5 rounded-2xl border border-border/50 bg-card/40 p-4 sm:p-5" style={BOARD_GRID}>
      {isLoading ? <WorkspaceGridSkeleton variant="notes" /> : notes?.length === 0 && !error ? (
        <div className="flex flex-col items-center justify-center border border-dashed border-border px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><StickyNote className="h-6 w-6" aria-hidden /></div>
          <h3 className="font-display text-lg font-semibold tracking-normal">{t("workspace.mural.emptyTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t("workspace.mural.emptyBody")}</p>
          {!readOnly && <Button className="mt-5" onClick={startCreate}><Plus aria-hidden />{t("workspace.mural.firstNote")}</Button>}
        </div>
      ) : freeBoard ? (
        <NotesCanvas notes={allNotes} pending={pending} readOnly={readOnly} execute={execute} label={t("workspace.mural.boardLabel")} renderNote={renderNote}
          connections={connections} connecting={connecting} />
      ) : groups.filter((group) => group.notes.length > 0).map((group) => (
        <div key={String(group.pinned)} className="space-y-3">
          <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{group.pinned && <Lock className="h-3.5 w-3.5" aria-hidden />}{t(group.pinned ? "workspace.mural.pinned" : "workspace.mural.notes")}</h3>
          <div className="grid grid-cols-1 items-start gap-4 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {group.notes.map((note) => <div key={note.id} className="min-w-0">{renderNote(note)}</div>)}
          </div>
        </div>
      ))}
      </div>
      {editor && <NoteEditor key={editor.id} editor={editor} pending={pending} onClose={() => setEditor(null)}
        images={noteImages.byNote[editor.id] ?? []} urls={noteImages.urls}
        imagesEditable={editor.isNew || isAuthor(allNotes.find((note) => note.id === editor.id) ?? { user_id: user?.id ?? "" })}
        onSave={(draft, changes, kept) => saveNote(editor, draft, changes, kept)} />}
      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open && !pending) setDeleting(null); }}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg motion-reduce:animate-none">
          <AlertDialogHeader><AlertDialogTitle>{t("workspace.mural.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("workspace.mural.deleteBody")}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <Button variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>{t("workspace.mural.cancel")}</Button>
            <Button variant="destructive" disabled={pending} onClick={async () => {
              if (deleting && await execute({ type: "delete", id: deleting.id })) {
                setDeleting(null);
                // The database removed this note's connections (cascade); refresh the cached list.
                if (connectionsOn) void noteConnections.refresh();
              }
            }}><Trash2 aria-hidden />{t("workspace.mural.delete")}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
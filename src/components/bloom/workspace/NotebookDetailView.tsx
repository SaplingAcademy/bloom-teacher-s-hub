import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/core";
import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft, ArrowDownToLine, ArrowUpToLine, Check, Copy, FileText, List, MoreHorizontal, Pencil, Pin, PinOff, Plus, RotateCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { useWorkspaceNotebook } from "@/hooks/use-workspace-notebooks";
import { useAuth } from "@/hooks/use-auth";
import { NotebookAutosave } from "@/lib/notebook-autosave";
import { saveNotebookDocument } from "@/lib/workspace-notebooks-data";
import { emptyDocument, pageGroupEnd, pageMoveIndex, sortNotebookPages, type NotebookPage, type PageCommand } from "@/lib/workspace-notebooks";
import { cn } from "@/lib/utils";
import { ConfirmDialog, TitleDialog } from "./ProjectDialogs";
import { WorkspaceBackLink, WorkspaceDetailSkeleton } from "./WorkspaceShell";
import { notebookColor, notebookIcon } from "./notebook-appearance";

const RichEditor = lazy(() => import("./NotebookRichEditor").then((module) => ({ default: module.NotebookRichEditor })));

export function NotebookDetailView({ notebookId }: { notebookId: string }) {
  const { user } = useAuth();
  return <NotebookSession key={`${user?.id ?? "signed-out"}:${notebookId}`} notebookId={notebookId} />;
}

function NotebookSession({ notebookId }: { notebookId: string }) {
  const { t, lang } = useLanguage();
  const { owner, detail, isLoading, error, pending, execute, acceptPage, refetch } = useWorkspaceNotebook(notebookId);
  const acceptRef = useRef(acceptPage); acceptRef.current = acceptPage;
  const [autosave] = useState(() => new NotebookAutosave(
    (id, document) => { if (!owner) return Promise.reject(new Error("authentication_changed")); return saveNotebookDocument(owner, notebookId, id, document); },
    (_id, result) => acceptRef.current(result as NotebookPage),
  ));
  const snapshot = useSyncExternalStore(autosave.subscribe, autosave.getSnapshot, autosave.getSnapshot);
  const [selectedId, setSelectedId] = useState<string | null>(null), [mobileEditor, setMobileEditor] = useState(false);
  const [renaming, setRenaming] = useState<NotebookPage | null>(null), [deleting, setDeleting] = useState<NotebookPage | null>(null);
  const [actionBusy, setActionBusy] = useState(false), [leaving, setLeaving] = useState(false);
  const actionLock = useRef(false), createIntent = useRef<{ key: string; command: PageCommand } | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const editorReady = useCallback((editor: Editor | null) => { editorRef.current = editor; }, []);
  const blocker = useBlocker({ shouldBlockFn: () => autosave.getSnapshot().pending, enableBeforeUnload: () => autosave.getSnapshot().pending, withResolver: true });
  useEffect(() => {
    if (detail) detail.pages.forEach((page) => autosave.seed(page.id, page.content_json));
  }, [detail, autosave]);
  // Normal unmount flushes any remaining debounce. Browser closure warns rather than claiming a save.
  useEffect(() => () => { void autosave.flush(); }, [autosave]);
  const pages = sortNotebookPages(detail?.pages ?? []);
  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedDocument = selected ? autosave.document(selected.id) ?? selected.content_json : undefined;
  const saveStatus = selected ? autosave.status(selected.id) : "saved";
  const hasSaveError = pages.some((p) => autosave.status(p.id) === "error");

  const pageAction = async (command: PageCommand) => {
    if (actionLock.current || pending) return false;
    actionLock.current = true; setActionBusy(true);
    editorRef.current?.setEditable(false);
    try {
      // Metadata writes/duplication/deletion wait for confirmed content, never overwrite an unsaved version.
      if (!await autosave.flush()) return false;
      const saved = await execute(command);
      if (!saved) return false;
      if (command.type === "delete") { autosave.forget(command.id); if (selected?.id === command.id) setSelectedId(null); }
      if (typeof saved === "object") { if (command.type === "create") { autosave.seed(saved.id, saved.content_json); setSelectedId(saved.id); setMobileEditor(true); } }
      return true;
    } finally { actionLock.current = false; setActionBusy(false); editorRef.current?.setEditable(true); }
  };
  const createPage = async (source?: NotebookPage) => {
    const key = source?.id ?? "new";
    if (!createIntent.current || createIntent.current.key !== key) createIntent.current = { key, command: {
      type: "create", id: crypto.randomUUID(), title: source ? `${source.title} (${t("workspace.notebook.copySuffix")})` : t("workspace.notebook.untitled"),
      content: source ? autosave.document(source.id) ?? source.content_json : emptyDocument(), order_index: pageGroupEnd(pages, false),
    } };
    if (await pageAction(createIntent.current.command)) createIntent.current = null;
  };
  const switchPage = (page: NotebookPage) => { autosave.seed(page.id, page.content_json); setSelectedId(page.id); setMobileEditor(true); void autosave.flush(); };
  const disabled = pending || actionBusy;

  if (isLoading) return <WorkspaceDetailSkeleton />;
  if (error && !detail) {
    const message = (error as Error).message;
    const missing = message === "notebook_not_found";
    return <div className="space-y-5"><WorkspaceBackLink to="/workspace/notebooks">{t("workspace.notebook.back")}</WorkspaceBackLink><div role="alert" className="border-y border-border py-12 text-center"><FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden /><h2 className="font-display text-xl font-semibold">{t(missing ? "workspace.notebook.notFound" : "workspace.notebook.loadError")}</h2><p className="mt-2 text-sm text-muted-foreground">{t(missing ? "workspace.notebook.notFoundBody" : message === "invalid_document" ? "workspace.notebook.invalidDocument" : "workspace.notebook.loadError")}</p>{!missing && <Button variant="outline" className="mt-4" onClick={() => void refetch()}>{t("workspace.mural.retry")}</Button>}</div></div>;
  }
  if (!detail) return null;
  const Icon = notebookIcon(detail.notebook.icon);
  const date = (value: string) => new Date(value).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US");
  return <section className="min-w-0 space-y-5">
    <WorkspaceBackLink to="/workspace/notebooks">{t("workspace.notebook.back")}</WorkspaceBackLink>
    <header className="flex min-w-0 items-center gap-3"><span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border", notebookColor(detail.notebook.color))}><Icon className="h-6 w-6" aria-hidden /></span><div className="min-w-0"><h1 className="break-words font-display text-2xl font-semibold">{detail.notebook.title}</h1>{detail.notebook.description && <p className="mt-1 break-words text-sm text-muted-foreground">{detail.notebook.description}</p>}</div></header>
    {hasSaveError && <div role="alert" className="flex flex-wrap items-center gap-3 border border-destructive/30 p-3 text-sm"><p className="min-w-0 flex-1 text-destructive">{t("workspace.notebook.saveErrorBody")}</p><Button size="sm" variant="outline" onClick={() => void autosave.flush()}><RotateCw aria-hidden />{t("workspace.mural.retry")}</Button></div>}
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card md:grid md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)]">
      <aside aria-label={t("workspace.notebook.pages")} className={cn("min-w-0 border-border bg-muted/25 md:block md:border-r", mobileEditor && selected && "hidden")}>
        <div className="flex items-center justify-between border-b border-border p-4"><h2 className="text-sm font-semibold">{t("workspace.notebook.pages")} <span className="ml-1 text-muted-foreground">{pages.length}</span></h2><Button variant="ghost" size="icon" disabled={disabled} aria-label={t("workspace.notebook.newPage")} onClick={() => void createPage()}><Plus aria-hidden /></Button></div>
        <ul className="max-h-[65dvh] space-y-1 overflow-y-auto p-2 md:min-h-96">
          {pages.map((page) => <li key={page.id} className={cn("flex min-w-0 items-center gap-1 rounded-lg", selected?.id === page.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
            <Button variant="ghost" className="h-auto min-h-14 min-w-0 flex-1 justify-start gap-2 px-3 py-2 text-left hover:bg-transparent" aria-current={selected?.id === page.id ? "page" : undefined} onClick={() => switchPage(page)}>{page.pinned ? <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <FileText className="h-4 w-4 shrink-0" aria-hidden />}<span className="min-w-0"><span className="block truncate text-sm font-medium">{page.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{page.plain_preview || date(page.updated_at)}</span></span>{autosave.status(page.id) !== "saved" && <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", autosave.status(page.id) === "error" ? "bg-destructive" : "bg-warning")} aria-label={t(`workspace.notebook.save.${autosave.status(page.id)}`)} />}</Button>
            <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="mr-1 h-7 w-7 shrink-0" disabled={disabled} aria-label={`${t("workspace.notebook.actions")}: ${page.title}`}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRenaming(page)}><Pencil aria-hidden />{t("workspace.notebook.rename")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void createPage(page)}><Copy aria-hidden />{t("workspace.notebook.duplicate")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void pageAction({ type: "pin", id: page.id, pinned: !page.pinned, order_index: pageGroupEnd(pages, !page.pinned) })}>{page.pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}{t(page.pinned ? "workspace.notebook.unpin" : "workspace.notebook.pin")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void pageAction({ type: "move", id: page.id, order_index: pageMoveIndex(pages, page, "first") })}><ArrowUpToLine aria-hidden />{t("workspace.mural.moveFirst")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void pageAction({ type: "move", id: page.id, order_index: pageMoveIndex(pages, page, "last") })}><ArrowDownToLine aria-hidden />{t("workspace.mural.moveLast")}</DropdownMenuItem><DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(page)}><Trash2 aria-hidden />{t("workspace.mural.delete")}</DropdownMenuItem>
            </DropdownMenuContent></DropdownMenu>
          </li>)}
          {!pages.length && <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t("workspace.notebook.noPages")}</li>}
        </ul>
        <div className="border-t border-border p-3"><Button variant="ghost" className="w-full justify-start" disabled={disabled} onClick={() => void createPage()}><Plus aria-hidden />{t("workspace.notebook.newPage")}</Button></div>
      </aside>
      <div className={cn("min-w-0", !mobileEditor && selected && "hidden md:block")}>
        {selected && selectedDocument ? <>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-3 p-4 sm:px-6"><div className="min-w-0 flex-1"><Button variant="ghost" size="sm" className="mb-2 -ml-2 md:hidden" onClick={() => setMobileEditor(false)}><List aria-hidden />{t("workspace.notebook.pages")}</Button><div className="flex items-center gap-2"><h2 className="min-w-0 break-words font-display text-xl font-semibold">{selected.title}</h2><Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" disabled={disabled} aria-label={t("workspace.notebook.rename")} onClick={() => setRenaming(selected)}><Pencil className="h-3.5 w-3.5" aria-hidden /></Button></div><p className="mt-1 text-xs text-muted-foreground">{t("workspace.notebook.created")}: {date(selected.created_at)} · {t("workspace.notebook.updated")}: {date(selected.updated_at)}</p></div><span role="status" aria-live="polite" className={cn("flex min-w-24 shrink-0 items-center justify-end gap-1.5 pt-1 text-xs", saveStatus === "error" ? "text-destructive" : "text-muted-foreground")}>{saveStatus === "saved" && <Check className="h-3.5 w-3.5" aria-hidden />}{t(`workspace.notebook.save.${saveStatus}`)}</span></div>
          <Suspense fallback={<Skeleton className="m-5 h-96" />}><RichEditor key={selected.id} document={selectedDocument} editable={!disabled} onReady={editorReady} onChange={(document) => { autosave.seed(selected.id, selected.content_json); autosave.edit(selected.id, document); }} /></Suspense>
        </> : <div className="flex min-h-96 flex-col items-center justify-center gap-4 px-5 py-12 text-center"><FileText className="h-10 w-10 text-muted-foreground" aria-hidden /><h2 className="font-display text-lg font-semibold">{t("workspace.notebook.noPages")}</h2><Button disabled={disabled} onClick={() => void createPage()}><Plus aria-hidden />{t("workspace.notebook.newPage")}</Button></div>}
      </div>
    </div>
    {renaming && <TitleDialog open title={t("workspace.notebook.rename")} label={t("workspace.notebook.pageTitle")} initial={renaming.title} pending={disabled} onClose={() => setRenaming(null)} onSave={(title) => pageAction({ type: "rename", id: renaming.id, title })} />}
    <ConfirmDialog open={Boolean(deleting)} title={t("workspace.notebook.deleteTitle")} body={t("workspace.notebook.deleteBody")} confirm={t("workspace.mural.delete")} onClose={() => setDeleting(null)} onConfirm={() => { if (!deleting) return; const id = deleting.id; setDeleting(null); void pageAction({ type: "delete", id }); }} />
    <Dialog open={blocker.status === "blocked"} onOpenChange={(open) => { if (!open && !leaving) blocker.reset?.(); }}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>{t("workspace.notebook.pendingTitle")}</DialogTitle><DialogDescription>{t("workspace.notebook.pendingBody")}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={leaving} onClick={() => blocker.reset?.()}><ArrowLeft aria-hidden />{t("workspace.notebook.stay")}</Button><Button disabled={leaving} onClick={async () => { setLeaving(true); try { if (await autosave.flush()) blocker.proceed?.(); } finally { setLeaving(false); } }}>{t(leaving ? "workspace.mural.saving" : "workspace.notebook.saveAndLeave")}</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
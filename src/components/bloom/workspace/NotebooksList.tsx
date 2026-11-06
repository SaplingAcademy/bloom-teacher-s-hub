import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { useWorkspaceNotebooks } from "@/hooks/use-workspace-notebooks";
import { sortNotebooks, type NotebookDraft, type WorkspaceNotebook } from "@/lib/workspace-notebooks";
import { cn } from "@/lib/utils";
import { WorkspaceGridSkeleton } from "./WorkspaceShell";
import { ConfirmDialog } from "./ProjectDialogs";
import { NotebookDialog } from "./NotebookDialog";
import { notebookColor, notebookIcon } from "./notebook-appearance";

export function NotebooksList() {
  const { t, lang } = useLanguage(), { summaries, isLoading, error, pending, execute, refetch } = useWorkspaceNotebooks();
  const [editor, setEditor] = useState<{ id: string; initial: NotebookDraft | null } | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceNotebook | null>(null);
  return <section className="space-y-5" aria-label={t("workspace.tabs.notebooks")}>
    <div className="flex items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold">{t("workspace.tabs.notebooks")}</h2><Button disabled={!summaries || pending} onClick={() => setEditor({ id: crypto.randomUUID(), initial: null })}><Plus aria-hidden />{t("workspace.notebooks.new")}</Button></div>
    {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 p-4 text-sm"><p className="flex-1 text-destructive">{t("workspace.notebooks.loadError")}</p><Button size="sm" variant="outline" onClick={() => void refetch()}>{t("workspace.mural.retry")}</Button></div>}
    {isLoading ? <WorkspaceGridSkeleton /> : !error && summaries?.length === 0 ? <div className="flex flex-col items-center border-y border-dashed border-border py-16 text-center"><BookOpen className="mb-4 h-9 w-9 text-primary" aria-hidden /><h3 className="font-display text-lg font-semibold">{t("workspace.notebooks.emptyTitle")}</h3><Button className="mt-5" onClick={() => setEditor({ id: crypto.randomUUID(), initial: null })}><Plus aria-hidden />{t("workspace.notebooks.first")}</Button></div> : <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sortNotebooks(summaries ?? []).map(({ notebook, pageCount, latestUpdate }) => { const Icon = notebookIcon(notebook.icon); return <li key={notebook.id} className="group relative flex min-w-0 flex-col rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none">
        <div className={cn("flex h-24 items-center justify-between border-b px-5", notebookColor(notebook.color))}><Icon className="h-9 w-9" aria-hidden /><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative z-10" disabled={pending} aria-label={t("workspace.notebooks.actions")}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setEditor({ id: notebook.id, initial: notebook })}><Pencil aria-hidden />{t("workspace.mural.edit")}</DropdownMenuItem><DropdownMenuItem className="text-destructive" onSelect={() => setDeleting(notebook)}><Trash2 aria-hidden />{t("workspace.mural.delete")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
        <div className="flex flex-1 flex-col p-5"><Link to="/workspace/notebooks/$notebookId" params={{ notebookId: notebook.id }} className="font-display text-lg font-semibold after:absolute after:inset-0 after:rounded-xl hover:underline"><span className="break-words">{notebook.title}</span></Link>{notebook.description && <p className="mt-2 line-clamp-2 break-words text-sm text-muted-foreground">{notebook.description}</p>}<div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-5 text-xs text-muted-foreground"><span>{t("workspace.notebooks.pageCount").replace("{count}", String(pageCount))}</span><time dateTime={latestUpdate}>{new Date(latestUpdate).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US")}</time></div></div>
      </li>; })}
    </ul>}
    {editor && <NotebookDialog initial={editor.initial} pending={pending} onClose={() => setEditor(null)} onSave={(draft) => execute({ type: editor.initial ? "edit" : "create", id: editor.id, draft })} />}
    <ConfirmDialog open={Boolean(deleting)} title={t("workspace.notebooks.deleteTitle")} body={t("workspace.notebooks.deleteBody")} confirm={t("workspace.mural.delete")} onClose={() => setDeleting(null)} onConfirm={() => { if (!deleting) return; const id = deleting.id; setDeleting(null); void execute({ type: "delete", id }); }} />
  </section>;
}
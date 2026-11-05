import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, FolderKanban, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { useWorkspaceProjects } from "@/hooks/use-workspace-projects";
import { filterAndSortProjects, type ProjectDraft, type StatusFilter, type WorkspaceProject } from "@/lib/workspace-projects";
import type { ProjectSummary } from "@/lib/workspace-projects-data";
import { cn } from "@/lib/utils";
import { WorkspaceGridSkeleton } from "./WorkspaceShell";
import { ConfirmDialog, ProjectDialog } from "./ProjectDialogs";
import { colorOf, projectIcon } from "./project-appearance";
import { ProgressBar } from "./ProjectProgress";

const FILTERS: StatusFilter[] = ["active", "archived", "all"];

export function ProjectsList({ filter, onFilter }: { filter: StatusFilter; onFilter: (f: StatusFilter) => void }) {
  const { t } = useLanguage();
  const { summaries, isLoading, error, pending, execute, refetch } = useWorkspaceProjects();
  const [editor, setEditor] = useState<{ id: string; initial: ProjectDraft | null } | null>(null);
  const [deleting, setDeleting] = useState<WorkspaceProject | null>(null);
  const byId = new Map((summaries ?? []).map((s) => [s.project.id, s]));
  const visible = filterAndSortProjects((summaries ?? []).map((s) => s.project), filter).map((p) => byId.get(p.id)!);

  return (
    <section className="space-y-5" aria-label={t("workspace.tabs.projects")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label={t("workspace.projects.filterLabel")} className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
          {FILTERS.map((f) => (
            <button key={f} role="tab" aria-selected={filter === f} onClick={() => onFilter(f)}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground", filter === f && "bg-card text-foreground shadow-sm")}>
              {t(`workspace.projects.filters.${f}`)}
            </button>
          ))}
        </div>
        <Button onClick={() => setEditor({ id: crypto.randomUUID(), initial: null })} disabled={pending || !summaries}><Plus aria-hidden />{t("workspace.projects.new")}</Button>
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 p-4 text-sm">
        <p className="flex-1 text-destructive">{t("workspace.projects.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("workspace.mural.retry")}</Button>
      </div>}
      {isLoading ? <WorkspaceGridSkeleton /> : !error && visible.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><FolderKanban className="h-6 w-6" aria-hidden /></div>
          <h2 className="font-display text-lg font-semibold">{t(summaries?.length ? "workspace.projects.noneInFilter" : "workspace.projects.emptyTitle")}</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">{t("workspace.projects.emptyBody")}</p>
          {!summaries?.length && <Button className="mt-5" onClick={() => setEditor({ id: crypto.randomUUID(), initial: null })} disabled={!summaries}><Plus aria-hidden />{t("workspace.projects.first")}</Button>}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((s) => <ProjectCard key={s.project.id} summary={s} disabled={pending}
            onEdit={() => setEditor({ id: s.project.id, initial: { title: s.project.title, description: s.project.description, color: s.project.color, icon: s.project.icon } })}
            onStatus={() => void execute({ type: "setStatus", id: s.project.id, status: s.project.status === "active" ? "archived" : "active" })}
            onDelete={() => setDeleting(s.project)} />)}
        </ul>
      )}
      <ProjectDialog open={!!editor} initial={editor?.initial ?? null} pending={pending} onClose={() => setEditor(null)}
        onSave={(draft) => execute(editor!.initial ? { type: "edit", id: editor!.id, draft } : { type: "create", id: editor!.id, draft })} />
      <ConfirmDialog open={!!deleting} title={t("workspace.projects.deleteTitle")} body={t("workspace.projects.deleteBody")} confirm={t("workspace.mural.delete")}
        onClose={() => setDeleting(null)} onConfirm={() => { const id = deleting!.id; setDeleting(null); void execute({ type: "delete", id }); }} />
    </section>
  );
}

function ProjectCard({ summary: { project, progress }, disabled, onEdit, onStatus, onDelete }: { summary: ProjectSummary; disabled: boolean; onEdit: () => void; onStatus: () => void; onDelete: () => void }) {
  const { t } = useLanguage();
  const Icon = projectIcon(project.icon);
  const color = colorOf(project.color);
  return (
    <li className={cn("group relative flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md", project.status === "archived" && "opacity-80")}>
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)`, color }}><Icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <Link to="/workspace/projects/$projectId" params={{ projectId: project.id }} className="font-display text-base font-semibold leading-tight text-foreground after:absolute after:inset-0 after:rounded-2xl hover:underline focus-visible:outline-none">
            <span className="break-words">{project.title}</span>
          </Link>
          {project.status === "archived" && <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{t("workspace.projects.archivedBadge")}</span>}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="relative z-10 -mr-2 -mt-1 h-8 w-8" aria-label={t("workspace.projects.actions")} disabled={disabled}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}><Pencil aria-hidden />{t("workspace.mural.edit")}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onStatus}>{project.status === "active" ? <><Archive aria-hidden />{t("workspace.projects.archive")}</> : <><ArchiveRestore aria-hidden />{t("workspace.projects.reactivate")}</>}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive"><Trash2 aria-hidden />{t("workspace.mural.delete")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {project.description && <p className="mt-3 line-clamp-2 break-words text-sm text-muted-foreground">{project.description}</p>}
      <div className="mt-auto pt-4"><ProgressBar progress={progress} color={color} /></div>
    </li>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, ExternalLink, FileText, FolderInput, Layers, Link2, ListChecks, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/hooks/use-language";
import { useWorkspaceProject, useWorkspaceProjects } from "@/hooks/use-workspace-projects";
import { computeProgress, containerItems, isTrackable, nextOrder, phaseProgress, reorder, safeUrl, sortPhases, type ItemDraft, type PreparedItem, type ProjectDetail, type WorkspaceItem, type WorkspacePhase } from "@/lib/workspace-projects";
import { cn } from "@/lib/utils";
import { WorkspaceBackLink, WorkspaceDetailSkeleton } from "./WorkspaceShell";
import { ConfirmDialog, ItemDialog, ProjectDialog, TitleDialog } from "./ProjectDialogs";
import { colorOf, projectIcon } from "./project-appearance";
import { ProgressBar } from "./ProjectProgress";

type ItemEditor = { id: string; isNew: boolean; initial: ItemDraft };
type Confirm = { kind: "phase"; phase: WorkspacePhase } | { kind: "item"; item: WorkspaceItem } | { kind: "project" };

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { detail, isLoading, error, notFound, pending, execute, refetch } = useWorkspaceProject(projectId);
  const list = useWorkspaceProjects();
  const [editingProject, setEditingProject] = useState(false);
  const [phaseEditor, setPhaseEditor] = useState<{ id: string; title: string; isNew: boolean } | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditor | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const back = <WorkspaceBackLink to="/workspace/projects">{t("workspace.project.back")}</WorkspaceBackLink>;
  if (isLoading) return <div className="space-y-4">{back}<WorkspaceDetailSkeleton /></div>;
  if (notFound) return (
    <div className="space-y-4">{back}
      <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
        <h2 className="font-display text-lg font-semibold">{t("workspace.project.notFoundTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("workspace.project.notFoundBody")}</p>
        <Button asChild variant="outline" className="mt-5"><Link to="/workspace/projects">{t("workspace.project.back")}</Link></Button>
      </div>
    </div>
  );
  if (error || !detail) return (
    <div className="space-y-4">{back}
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 p-4 text-sm">
        <p className="flex-1 text-destructive">{t("workspace.project.loadError")}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("workspace.mural.retry")}</Button>
      </div>
    </div>
  );

  const { project, items } = detail;
  const phases = sortPhases(detail.phases);
  const color = colorOf(project.color);
  const Icon = projectIcon(project.icon);
  const newItem = (phaseId: string | null) => setItemEditor({ id: crypto.randomUUID(), isNew: true, initial: { type: "task", title: "", content: "", url: "", phase_id: phaseId } });
  const editItem = (item: WorkspaceItem) => setItemEditor({ id: item.id, isNew: false, initial: { type: item.type, title: item.title, content: item.content, url: typeof item.meta.url === "string" ? item.meta.url : "", phase_id: item.phase_id } });
  const saveItem = (prepared: PreparedItem) => {
    const editor = itemEditor!;
    const existing = items.find((i) => i.id === editor.id);
    const target = containerItems(items, prepared.phase_id).filter((i) => i.id !== editor.id);
    const order = existing && existing.phase_id === prepared.phase_id ? existing.order_index : nextOrder(target);
    return execute(editor.isNew ? { type: "createItem", id: editor.id, item: prepared, order_index: order } : { type: "editItem", id: editor.id, item: prepared, order_index: order });
  };
  const moveItem = (item: WorkspaceItem, phaseId: string | null) => execute({ type: "editItem", id: item.id, order_index: nextOrder(containerItems(items, phaseId)),
    item: { type: item.type, title: item.title, content: item.content, meta: item.meta, phase_id: phaseId } });

  const containerProps = { detail, phases, pending, color, onAdd: newItem, onEdit: editItem, onMove: moveItem,
    onToggle: (item: WorkspaceItem) => void execute({ type: "toggleItem", id: item.id, completed: !item.completed }),
    onReorder: (phaseId: string | null, id: string, dir: -1 | 1) => { const updates = reorder(containerItems(items, phaseId), id, dir); if (updates.length) void execute({ type: "reorderItems", updates }); },
    onDelete: (item: WorkspaceItem) => setConfirm({ kind: "item", item }) };

  return (
    <div className="space-y-5">
      {back}
      <header className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `color-mix(in oklch, ${color} 16%, transparent)`, color }}><Icon className="h-6 w-6" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="break-words font-display text-xl font-semibold leading-tight sm:text-2xl">{project.title}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", project.status === "active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
                {t(project.status === "active" ? "workspace.projects.activeBadge" : "workspace.projects.archivedBadge")}
              </span>
            </div>
            {project.description && <p className="mt-1.5 whitespace-pre-line break-words text-sm text-muted-foreground">{project.description}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("workspace.projects.actions")} disabled={pending}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditingProject(true)}><Pencil aria-hidden />{t("workspace.mural.edit")}</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void execute({ type: "setStatus", status: project.status === "active" ? "archived" : "active" })}>
                {project.status === "active" ? <><Archive aria-hidden />{t("workspace.projects.archive")}</> : <><ArchiveRestore aria-hidden />{t("workspace.projects.reactivate")}</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm({ kind: "project" })}><Trash2 aria-hidden />{t("workspace.mural.delete")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-5"><ProgressBar progress={computeProgress(items)} color={color} /></div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => newItem(null)} disabled={pending}><Plus aria-hidden />{t("workspace.project.newItem")}</Button>
        <Button variant="outline" onClick={() => setPhaseEditor({ id: crypto.randomUUID(), title: "", isNew: true })} disabled={pending}><Layers aria-hidden />{t("workspace.project.newPhase")}</Button>
      </div>

      <ItemContainer {...containerProps} phase={null} />
      {phases.map((phase, index) => (
        <ItemContainer key={phase.id} {...containerProps} phase={phase} first={index === 0} last={index === phases.length - 1}
          onRename={() => setPhaseEditor({ id: phase.id, title: phase.title, isNew: false })}
          onDeletePhase={() => setConfirm({ kind: "phase", phase })}
          onMovePhase={(dir) => { const updates = reorder(phases, phase.id, dir); if (updates.length) void execute({ type: "reorderPhases", updates }); }} />
      ))}

      <ProjectDialog open={editingProject} pending={pending} onClose={() => setEditingProject(false)}
        initial={{ title: project.title, description: project.description, color: project.color, icon: project.icon }}
        onSave={(draft) => execute({ type: "editProject", draft })} />
      <TitleDialog open={!!phaseEditor} pending={pending} initial={phaseEditor?.title ?? ""} label={t("workspace.project.phaseName")}
        title={t(phaseEditor?.isNew ? "workspace.project.newPhase" : "workspace.project.renamePhase")} onClose={() => setPhaseEditor(null)}
        onSave={(title) => execute(phaseEditor!.isNew ? { type: "createPhase", id: phaseEditor!.id, title, order_index: nextOrder(phases) } : { type: "renamePhase", id: phaseEditor!.id, title })} />
      {itemEditor && <ItemDialog open isNew={itemEditor.isNew} initial={itemEditor.initial} phases={phases} pending={pending} onClose={() => setItemEditor(null)} onSave={saveItem} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} confirm={t("workspace.mural.delete")}
        title={t(confirm?.kind === "phase" ? "workspace.project.deletePhaseTitle" : confirm?.kind === "project" ? "workspace.projects.deleteTitle" : "workspace.project.deleteItemTitle")}
        body={confirm?.kind === "phase" ? t("workspace.project.deletePhaseBody").replace("{count}", String(containerItems(items, confirm.phase.id).length))
          : confirm?.kind === "project" ? t("workspace.projects.deleteBody") : t("workspace.mural.deleteBody")}
        onConfirm={() => {
          const c = confirm!; setConfirm(null);
          if (c.kind === "phase") void execute({ type: "deletePhase", id: c.phase.id });
          else if (c.kind === "item") void execute({ type: "deleteItem", id: c.item.id });
          else void list.execute({ type: "delete", id: project.id }).then((ok) => { if (ok) void navigate({ to: "/workspace/projects" }); });
        }} />
    </div>
  );
}

interface ContainerProps {
  detail: ProjectDetail; phases: WorkspacePhase[]; phase: WorkspacePhase | null; pending: boolean; color: string; first?: boolean; last?: boolean;
  onAdd: (phaseId: string | null) => void; onEdit: (item: WorkspaceItem) => void; onToggle: (item: WorkspaceItem) => void; onDelete: (item: WorkspaceItem) => void;
  onMove: (item: WorkspaceItem, phaseId: string | null) => void; onReorder: (phaseId: string | null, id: string, dir: -1 | 1) => void;
  onRename?: () => void; onDeletePhase?: () => void; onMovePhase?: (dir: -1 | 1) => void;
}

function ItemContainer({ detail, phases, phase, pending, color, first, last, onAdd, onEdit, onToggle, onDelete, onMove, onReorder, onRename, onDeletePhase, onMovePhase }: ContainerProps) {
  const { t } = useLanguage();
  const phaseId = phase?.id ?? null;
  const items = containerItems(detail.items, phaseId);
  const progress = phase ? phaseProgress(detail.items, phase.id) : null;
  if (!phase && items.length === 0 && phases.length > 0) return null;
  return (
    <section aria-label={phase?.title ?? t("workspace.project.general")} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 break-words font-display text-base font-semibold">{phase?.title ?? t("workspace.project.general")}</h3>
        {progress && <span className="text-xs font-medium text-muted-foreground">{progress.percent}%</span>}
        {phase && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("workspace.project.phaseActions")} disabled={pending}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename}><Pencil aria-hidden />{t("workspace.project.renamePhase")}</DropdownMenuItem>
              <DropdownMenuItem disabled={first} onSelect={() => onMovePhase?.(-1)}><ArrowUp aria-hidden />{t("workspace.project.moveUp")}</DropdownMenuItem>
              <DropdownMenuItem disabled={last} onSelect={() => onMovePhase?.(1)}><ArrowDown aria-hidden />{t("workspace.project.moveDown")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDeletePhase}><Trash2 aria-hidden />{t("workspace.project.deletePhase")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {progress && <div className="mt-2"><ProgressBar progress={progress} color={color} compact /></div>}
      {items.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("workspace.project.emptyContainer")}</p> : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item, index) => <ItemRow key={item.id} item={item} phases={phases} pending={pending} first={index === 0} last={index === items.length - 1}
            onToggle={() => onToggle(item)} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onMove={(p) => onMove(item, p)} onReorder={(dir) => onReorder(phaseId, item.id, dir)} />)}
        </ul>
      )}
      <Button variant="ghost" size="sm" className="mt-2 text-muted-foreground" onClick={() => onAdd(phaseId)} disabled={pending}><Plus aria-hidden />{t("workspace.project.addHere")}</Button>
    </section>
  );
}

function ItemRow({ item, phases, pending, first, last, onToggle, onEdit, onDelete, onMove, onReorder }: { item: WorkspaceItem; phases: WorkspacePhase[]; pending: boolean; first: boolean; last: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void; onMove: (phaseId: string | null) => void; onReorder: (dir: -1 | 1) => void }) {
  const { t } = useLanguage();
  const trackable = isTrackable(item);
  const href = item.type === "link" ? safeUrl(item.meta.url) : null;
  const TypeIcon = item.type === "note" ? FileText : item.type === "link" ? Link2 : ListChecks;
  return (
    <li className="flex items-start gap-3 py-2.5">
      {trackable ? (
        <Checkbox className="mt-0.5" checked={item.completed} disabled={pending} onCheckedChange={onToggle}
          aria-label={t(item.completed ? "workspace.project.reopen" : "workspace.project.complete").replace("{title}", item.title)} />
      ) : <TypeIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center gap-1 break-all text-sm font-medium text-primary hover:underline">
              {item.title}<ExternalLink className="h-3 w-3 shrink-0" aria-hidden /><span className="sr-only">{t("workspace.project.opensNewTab")}</span>
            </a>
          ) : <span className={cn("break-words text-sm font-medium", item.completed && "text-muted-foreground line-through")}>{item.title}</span>}
          {item.type !== "task" && <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{t(`workspace.project.types.${item.type}`)}</span>}
        </div>
        {item.content && <p className={cn("mt-0.5 whitespace-pre-line break-words text-sm text-muted-foreground", item.type !== "note" && "line-clamp-2")}>{item.content}</p>}
        {item.type === "link" && !href && <p className="mt-0.5 text-xs text-destructive">{t("workspace.project.invalidUrl")}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={t("workspace.project.itemActions")} disabled={pending}><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onEdit}><Pencil aria-hidden />{t("workspace.mural.edit")}</DropdownMenuItem>
          <DropdownMenuItem disabled={first} onSelect={() => onReorder(-1)}><ArrowUp aria-hidden />{t("workspace.project.moveUp")}</DropdownMenuItem>
          <DropdownMenuItem disabled={last} onSelect={() => onReorder(1)}><ArrowDown aria-hidden />{t("workspace.project.moveDown")}</DropdownMenuItem>
          {(phases.length > 0) && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><FolderInput aria-hidden className="mr-2 h-4 w-4" />{t("workspace.project.moveTo")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem disabled={item.phase_id === null} onSelect={() => onMove(null)}>{t("workspace.project.general")}</DropdownMenuItem>
                {phases.map((p) => <DropdownMenuItem key={p.id} disabled={item.phase_id === p.id} onSelect={() => onMove(p.id)}>{p.title}</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={onDelete}><Trash2 aria-hidden />{t("workspace.mural.delete")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

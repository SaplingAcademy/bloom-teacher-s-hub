import { useState, type ReactNode } from "react";
import { CalendarCheck, CalendarDays, ChartNoAxesColumnIncreasing, CircleUser, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { formatCalendarDate, isCalendarDate, type Progress, type WorkspaceProject } from "@/lib/workspace-projects";
import { cn } from "@/lib/utils";

interface ProjectSummaryProps {
  project: Pick<WorkspaceProject, "start_date" | "end_date">;
  progress: Progress;
  creator: { name: string; photo?: string | null };
  /** Accepted participants (avatars beside the creator). */
  members?: { id: string; name: string; photo: string | null }[];
  /** Opens the participants list from the avatars (sharing itself lives in the header "Compartilhar" button). */
  onShare?: () => void;
  pending: boolean;
  onSaveDates: (start: string, end: string | null) => Promise<boolean>;
}

/**
 * Creator shown in the summary. The signed-in owner uses useTeacherIdentity() (profiles.full_name /
 * avatar_url); on a shared project the owner's public profile is used, with the neutral label while
 * it loads or when it is unavailable.
 */
export function projectCreator(ownerId: string, currentUserId: string | undefined, identity: { name: string | null; avatarUrl: string | null },
  ownerProfile: { name: string; photo: string | null } | null = null) {
  if (ownerId === currentUserId) return { name: identity.name ?? "", photo: identity.avatarUrl };
  return ownerProfile ? { name: ownerProfile.name, photo: ownerProfile.photo } : { name: "", photo: null };
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

function Property({ icon, label, children, valueClassName }: { icon: ReactNode; label: string; children: ReactNode; valueClassName?: string }) {
  return (
    <div className="flex min-h-8 items-center gap-3 sm:min-h-7">
      <dt className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</dt>
      <dd className={cn("flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-foreground", valueClassName)}>{children}</dd>
    </div>
  );
}

/**
 * Notion-like project summary (two lines on desktop, stacked on phones): creator, future
 * "add teacher" slot, short green progress, start date and the optional end date.
 */
export function ProjectSummary({ project, progress, creator, members = [], onShare, pending, onSaveDates }: ProjectSummaryProps) {
  const { t, lang } = useLanguage();
  const [editing, setEditing] = useState(false);
  const name = creator.name.trim() || t("workspace.project.summary.unnamed");
  const progressLabel = t("workspace.project.progressLabel").replace("{done}", String(progress.done)).replace("{total}", String(progress.total));
  const shown = members.slice(0, 3);
  const editDates = t("workspace.project.summary.editDates");

  const dateButton = (value: string, testId: string) => (
    <button type="button" disabled={pending} onClick={() => setEditing(true)} data-testid={testId} title={editDates}
      className="group inline-flex items-center gap-1.5 rounded-md px-1 -mx-1 tabular-nums hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
      {formatCalendarDate(value, lang)}
      <Pencil className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden />
      <span className="sr-only">{editDates}</span>
    </button>
  );

  return (
    <>
      <dl className="mt-4 grid gap-x-10 gap-y-1 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 sm:ml-16 sm:grid-cols-2 sm:gap-y-0.5 sm:py-2" data-testid="project-summary">
        {/* Long names wrap to at most two lines; the avatar and the + stay in place inside the card. */}
        <Property icon={<CircleUser className="h-3.5 w-3.5" aria-hidden />} label={t("workspace.project.summary.createdBy")} valueClassName="flex-nowrap">
          {creator.photo
            ? <img src={creator.photo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            : <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac-soft text-[10px] font-semibold text-foreground">{initials(name)}</span>}
          {/* Owner name in Bloom lilac (same for every teacher; avatars have no per-teacher color). lilac-strong is the
              darker light-theme tone with ≥ 4.5:1 contrast; the dark theme keeps the regular lilac. */}
          <span className="line-clamp-2 min-w-0 break-words font-medium text-lilac-strong [overflow-wrap:anywhere]" title={name} data-testid="project-creator-name">{name}</span>
          {shown.length > 0 && (
            <button type="button" onClick={onShare} disabled={!onShare} data-testid="project-members-avatars"
              aria-label={t("workspace.share.membersCount").replace("{count}", String(members.length))}
              className="flex shrink-0 items-center -space-x-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {shown.map((m) => m.photo
                ? <img key={m.id} src={m.photo} alt="" title={m.name} className="h-6 w-6 rounded-full object-cover ring-2 ring-card" />
                : <span key={m.id} aria-hidden title={m.name} className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground ring-2 ring-card">{initials(m.name)}</span>)}
              {members.length > shown.length && <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card">+{members.length - shown.length}</span>}
            </button>
          )}
        </Property>
        <Property icon={<ChartNoAxesColumnIncreasing className="h-3.5 w-3.5" aria-hidden />} label={t("workspace.project.summary.progress")}>
          <span role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={progressLabel}
            className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress.percent}%`, backgroundColor: "var(--primary)" }} />
          </span>
          <span className="text-xs font-medium tabular-nums">{progress.percent}%</span>
          <span className="hidden text-xs text-muted-foreground sm:inline" aria-hidden>·</span>
          <span className="text-xs text-muted-foreground" data-testid="project-tasks-done">{t("workspace.project.summary.tasksDone").replace("{done}", String(progress.done)).replace("{total}", String(progress.total))}</span>
        </Property>
        <Property icon={<CalendarDays className="h-3.5 w-3.5" aria-hidden />} label={t("workspace.project.summary.start")}>
          {dateButton(project.start_date, "project-start-date")}
          {!project.end_date && (
            <button type="button" disabled={pending} onClick={() => setEditing(true)} data-testid="project-add-end"
              className="inline-flex items-center gap-1 rounded-md px-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60">
              <Plus className="h-3 w-3" aria-hidden />{t("workspace.project.summary.addEnd")}
            </button>
          )}
        </Property>
        {project.end_date && (
          <Property icon={<CalendarCheck className="h-3.5 w-3.5" aria-hidden />} label={t("workspace.project.summary.end")}>
            {dateButton(project.end_date, "project-end-date")}
          </Property>
        )}
      </dl>
      {editing && <DatesDialog start={project.start_date} end={project.end_date} pending={pending}
        onClose={() => setEditing(false)} onSave={onSaveDates} />}
    </>
  );
}

function DatesDialog({ start, end, pending, onClose, onSave }: {
  start: string; end: string | null; pending: boolean; onClose: () => void; onSave: (start: string, end: string | null) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [startValue, setStartValue] = useState(start);
  const [endValue, setEndValue] = useState(end ?? "");
  const [saving, setSaving] = useState(false);
  const startError = !isCalendarDate(startValue) ? t("workspace.project.summary.startRequired") : null;
  const endError = !startError && endValue && (!isCalendarDate(endValue) || endValue < startValue) ? t("workspace.project.summary.endBeforeStart") : null;
  const busy = pending || saving;
  return (
    <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg" aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{t("workspace.project.summary.datesTitle")}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (busy || startError || endError) return;
          setSaving(true);
          try { if (await onSave(startValue, endValue || null)) onClose(); } finally { setSaving(false); }
        }}>
          <div className="space-y-2">
            <Label htmlFor="project-start">{t("workspace.project.summary.start")}</Label>
            <Input id="project-start" type="date" required value={startValue} disabled={busy} aria-invalid={Boolean(startError)}
              onChange={(event) => setStartValue(event.target.value)} />
            {startError && <p role="alert" className="text-xs text-destructive">{startError}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-end">{t("workspace.project.summary.endOptional")}</Label>
            <div className="flex items-center gap-2">
              <Input id="project-end" type="date" value={endValue} min={isCalendarDate(startValue) ? startValue : undefined} disabled={busy}
                aria-invalid={Boolean(endError)} onChange={(event) => setEndValue(event.target.value)} className={cn("flex-1")} />
              {endValue && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEndValue("")}>{t("workspace.project.summary.removeEnd")}</Button>}
            </div>
            {endError && <p role="alert" className="text-xs text-destructive">{endError}</p>}
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{t("workspace.mural.cancel")}</Button>
            <Button type="submit" disabled={busy || Boolean(startError || endError)}>
              {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{t("workspace.mural.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

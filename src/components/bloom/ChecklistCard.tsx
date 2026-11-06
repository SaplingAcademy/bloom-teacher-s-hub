import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, Check, CheckCheck, ListChecks, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTeacherChecklist } from "@/hooks/use-teacher-checklist";
import { pendingChecklistCount } from "@/lib/teacher-checklist";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

function Tool({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

export function ChecklistCard() {
  const { t } = useLanguage();
  const { items, isLoading, error, isFetching, pending, isItemPending, execute, refetch } = useTeacherChecklist();
  const [title, setTitle] = useState("");
  const createId = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [clearIds, setClearIds] = useState<string[] | null>(null);
  const [clearing, setClearing] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const rows = items ?? [];
  const pendingCount = pendingChecklistCount(rows);
  const completedCount = rows.length - pendingCount;
  const unavailable = isLoading || Boolean(error) || !items;

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || adding || unavailable) return;
    createId.current ??= crypto.randomUUID();
    setAdding(true);
    const saved = await execute({ type: "create", id: createId.current, title });
    if (saved) { setTitle(""); createId.current = null; }
    setAdding(false);
    input.current?.focus();
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editing.title.trim()) return;
    if (await execute({ type: "edit", ...editing })) setEditing(null);
  }

  async function clear() {
    if (!clearIds || clearing) return;
    setClearing(true);
    if (await execute({ type: "clear", ids: clearIds })) setClearIds(null);
    setClearing(false);
  }

  return (
    <TooltipProvider delayDuration={350}>
      <section aria-label={t("checklist.title")} className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:h-full">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/10 bg-primary-soft/40 px-4 py-4 sm:px-5">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-primary">
            <ListChecks className="h-5 w-5 shrink-0" aria-hidden="true" />{t("checklist.title")}
          </h2>
          {!unavailable && <span aria-live="polite" className="text-xs font-semibold text-muted-foreground">
            {t(pendingCount === 1 ? "checklist.pendingOne" : "checklist.pending").replace("{count}", String(pendingCount))}
          </span>}
        </header>
        <div className="px-4 pb-3 pt-4 sm:px-5">
          <form onSubmit={add} className="flex min-w-0 items-center gap-2">
            <Input ref={input} aria-label={t("checklist.add")} placeholder={t("checklist.placeholder")}
              value={title} onChange={(event) => { setTitle(event.target.value); createId.current = null; }}
              disabled={unavailable || adding} required className="h-9 min-w-0 flex-1 text-sm" />
            <Tool label={t("checklist.add")}><Button type="submit" size="icon" aria-label={t("checklist.add")}
              disabled={unavailable || adding || !title.trim()} className="shrink-0">
              {adding ? <Loader2 className="motion-safe:animate-spin" /> : <Plus />}
            </Button></Tool>
          </form>
        </div>

        {isLoading ? <div role="status" aria-label={t("checklist.loading")} className="space-y-3 px-4 pb-5 sm:px-5">
          <span className="sr-only">{t("checklist.loading")}</span>
          {[0, 1, 2, 3].map((id) => <div key={id} className="flex gap-3 py-1"><Skeleton className="h-4 w-4 shrink-0" /><Skeleton className="h-4 flex-1" /></div>)}
        </div> : error ? <div role="alert" className="space-y-3 px-4 pb-5 sm:px-5">
          <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t("checklist.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching || pending}>
            {isFetching && <Loader2 className="motion-safe:animate-spin" />}{t("checklist.retry")}
          </Button>
        </div> : rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t("checklist.empty")}</p> : <>
          <div role="region" aria-label={t("checklist.listLabel")} tabIndex={0}
            className="max-h-80 overflow-y-auto overscroll-contain px-4 pb-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
            <ul className="divide-y divide-border/60">
              {rows.map((item, index) => {
                const busy = isItemPending(item.id);
                return <li key={item.id} className="min-w-0 py-2">
                  {item.completed && !rows[index - 1]?.completed && <p className="mb-2 mt-1 text-xs font-semibold text-muted-foreground">{t("checklist.completed")}</p>}
                  {editing?.id === item.id ? <form onSubmit={saveEdit} className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Input autoFocus aria-label={t("checklist.titleLabel")} value={editing.title} disabled={busy || Boolean(error)} required
                      onChange={(event) => setEditing({ id: item.id, title: event.target.value })}
                      onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); setEditing(null); } }}
                      className="h-9 min-w-0 basis-full text-sm" />
                    <Tool label={t("checklist.saveEdit")}><Button type="submit" size="icon" variant="ghost" aria-label={t("checklist.saveEdit")} disabled={busy || !editing.title.trim()}><Check /></Button></Tool>
                    <Tool label={t("checklist.cancelEdit")}><Button type="button" size="icon" variant="ghost" aria-label={t("checklist.cancelEdit")} disabled={busy} onClick={() => setEditing(null)}><X /></Button></Tool>
                  </form> : <div className="flex min-w-0 items-start gap-2">
                    <Checkbox checked={item.completed} aria-label={t(item.completed ? "checklist.reopen" : "checklist.complete").replace("{title}", item.title)}
                      disabled={busy || clearing || unavailable} className="mt-2.5"
                      onCheckedChange={(checked) => void execute({ type: "complete", id: item.id, completed: checked === true })} />
                    <span className={`min-w-0 flex-1 break-words py-2 text-sm leading-5 [overflow-wrap:anywhere] ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.title}</span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <Tool label={t("checklist.edit")}><Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground" aria-label={`${t("checklist.edit")}: ${item.title}`}
                        disabled={busy || clearing || unavailable} onClick={() => setEditing({ id: item.id, title: item.title })}><Pencil /></Button></Tool>
                      <Tool label={t("checklist.delete")}><Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground hover:text-destructive" aria-label={`${t("checklist.delete")}: ${item.title}`}
                        disabled={busy || clearing || unavailable} onClick={() => void execute({ type: "delete", id: item.id })}><Trash2 /></Button></Tool>
                    </div>
                  </div>}
                </li>;
              })}
            </ul>
          </div>
          {completedCount > 0 && <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 sm:px-5">
            {pendingCount === 0 && <span className="flex items-center gap-1.5 text-xs text-primary"><CheckCheck className="h-4 w-4" />{t("checklist.allDone")}</span>}
            <Button variant="ghost" size="sm" className="ml-auto whitespace-normal text-muted-foreground" disabled={pending || Boolean(editing)}
              onClick={() => setClearIds(rows.filter((item) => item.completed).map((item) => item.id))}><Trash2 />{t("checklist.clear")}</Button>
          </footer>}
        </>}
        <span className="sr-only" role="status">{pending ? t("checklist.saving") : ""}</span>
      </section>
      <AlertDialog open={clearIds !== null} onOpenChange={(open) => { if (!open && !clearing) setClearIds(null); }}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-xl sm:max-w-md motion-reduce:animate-none">
          <AlertDialogHeader><AlertDialogTitle className="font-display">{t("checklist.clearTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t(clearIds?.length === 1 ? "checklist.clearOne" : "checklist.clearBody").replace("{count}", String(clearIds?.length ?? 0))}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={clearing}>{t("checklist.cancel")}</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void clear()} disabled={clearing || pending}>
              {clearing && <Loader2 className="motion-safe:animate-spin" />}{t("checklist.confirmClear")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
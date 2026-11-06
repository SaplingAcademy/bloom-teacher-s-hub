import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { AlertCircle, CalendarDays, Check, CheckCheck, History, ListChecks, Loader2, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useTeacherChecklist } from "@/hooks/use-teacher-checklist";
import { checklistDeadline, localChecklistDate, pendingChecklistCount, splitChecklist,
  type ChecklistDeadline, type TeacherChecklistItem } from "@/lib/teacher-checklist";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChecklistDeadlineFields } from "./ChecklistDeadlineFields";

const NO_DEADLINE: ChecklistDeadline = { deadline_type: "none", due_date: null };

function Tool({ label, children }: { label: string; children: ReactNode }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

function useTeacherLocalDay() {
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const now = new Date();
      setToday(localChecklistDate(now));
      if (timer) clearTimeout(timer);
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(update, Math.max(1000, tomorrow.getTime() - now.getTime() + 50));
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return today;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function ChecklistCard() {
  const { t, lang } = useLanguage();
  const { items, isLoading, error, isFetching, pending, isItemPending, execute, refetch } = useTeacherChecklist();
  const today = useTeacherLocalDay();
  const reducedMotion = useReducedMotion();
  const [title, setTitle] = useState("");
  const [newDeadline, setNewDeadline] = useState<ChecklistDeadline>(NO_DEADLINE);
  const createId = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; title: string; deadline: ChecklistDeadline } | null>(null);
  const [clearIds, setClearIds] = useState<string[] | null>(null);
  const [clearing, setClearing] = useState(false);
  const [recovering, setRecovering] = useState<{ item: TeacherChecklistItem; deadline: ChecklistDeadline } | null>(null);
  const [recoveryPending, setRecoveryPending] = useState(false);
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const [carouselRef, carouselApi] = useEmblaCarousel({
    align: "start", duration: reducedMotion ? 0 : 25,
    watchDrag: (event) => {
      const target = event.target;
      return target instanceof Element && !target.closest("input, textarea, select, button, [role='checkbox']");
    },
  });

  useEffect(() => {
    if (!carouselApi) return;
    const update = () => setSelected(carouselApi.selectedScrollSnap());
    update();
    carouselApi.on("select", update);
    carouselApi.on("reInit", update);
    return () => {
      carouselApi.off("select", update);
      carouselApi.off("reInit", update);
    };
  }, [carouselApi]);

  const rows = useMemo(() => items ?? [], [items]);
  const { current, history } = useMemo(() => today ? splitChecklist(rows, today) : { current: [], history: [] }, [rows, today]);
  const pendingCount = pendingChecklistCount(current);
  const completedCount = current.length - pendingCount;
  const unavailable = isLoading || Boolean(error) || !items || !today;

  function goTo(index: number) {
    setSelected(index);
    carouselApi?.scrollTo(index);
  }

  function carouselKeys(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(0); }
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(1); }
    if (event.key === "Home") { event.preventDefault(); goTo(0); }
    if (event.key === "End") { event.preventDefault(); goTo(1); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || adding || unavailable || !today) return;
    let deadline: ChecklistDeadline;
    try { deadline = checklistDeadline(newDeadline.deadline_type, newDeadline.due_date, today); }
    catch { return; }
    createId.current ??= crypto.randomUUID();
    setAdding(true);
    const saved = await execute({ type: "create", id: createId.current, title, deadline });
    if (saved) {
      setTitle(""); setNewDeadline(NO_DEADLINE); createId.current = null;
    }
    setAdding(false);
    input.current?.focus();
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing || !editing.title.trim() || !today) return;
    let deadline: ChecklistDeadline;
    try { deadline = checklistDeadline(editing.deadline.deadline_type, editing.deadline.due_date, today); }
    catch { return; }
    if (await execute({ type: "edit", id: editing.id, title: editing.title, deadline })) setEditing(null);
  }

  async function clear() {
    if (!clearIds || clearing) return;
    setClearing(true);
    if (await execute({ type: "clear", ids: clearIds })) setClearIds(null);
    setClearing(false);
  }

  async function recover(event: FormEvent) {
    event.preventDefault();
    if (!recovering || recoveryPending || !today) return;
    let deadline: ChecklistDeadline;
    try { deadline = checklistDeadline(recovering.deadline.deadline_type, recovering.deadline.due_date, today); }
    catch { return; }
    setRecoveryPending(true);
    if (await execute({ type: "recover", id: recovering.item.id, deadline })) {
      setRecovering(null); goTo(0);
    }
    setRecoveryPending(false);
  }

  function formatDate(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(lang === "pt" ? "pt-BR" : "en-US",
      { day: "2-digit", month: "short", year: "numeric" });
  }

  function currentDeadlineLabel(item: TeacherChecklistItem) {
    if (item.deadline_type === "none" || !item.due_date) return t("checklist.noDeadline");
    if (item.deadline_type === "today" && item.due_date === today) return t("checklist.deadlineToday");
    return formatDate(item.due_date);
  }

  function renderItem(item: TeacherChecklistItem, fromHistory = false) {
    const busy = isItemPending(item.id);
    return <li key={item.id} className="min-w-0 py-2">
      {editing?.id === item.id && !fromHistory ? <form onSubmit={saveEdit} className="space-y-2 py-1">
        <Input autoFocus aria-label={t("checklist.titleLabel")} value={editing.title} disabled={busy || Boolean(error)} required
          onChange={(event) => setEditing({ ...editing, title: event.target.value })}
          onKeyDown={(event) => { if (event.key === "Escape" && !busy) { event.preventDefault(); setEditing(null); } }}
          className="h-9 min-w-0 text-sm" />
        <div className="flex min-w-0 flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1"><ChecklistDeadlineFields id={`edit-${item.id}-date`} value={editing.deadline} today={today ?? ""}
            disabled={busy} onChange={(deadline) => setEditing({ ...editing, deadline })} /></div>
          <Tool label={t("checklist.saveEdit")}><Button type="submit" size="icon" variant="ghost" aria-label={t("checklist.saveEdit")}
            disabled={busy || !editing.title.trim() || (editing.deadline.deadline_type === "specific" && !editing.deadline.due_date)}><Check /></Button></Tool>
          <Tool label={t("checklist.cancelEdit")}><Button type="button" size="icon" variant="ghost" aria-label={t("checklist.cancelEdit")} disabled={busy} onClick={() => setEditing(null)}><X /></Button></Tool>
        </div>
      </form> : <div className="flex min-w-0 items-start gap-2">
        <Checkbox checked={item.completed} aria-label={t(item.completed ? "checklist.reopen" : "checklist.complete").replace("{title}", item.title)}
          disabled={busy || clearing || unavailable} className="mt-2.5"
          onCheckedChange={(checked) => void execute({ type: "complete", id: item.id, completed: checked === true })} />
        <div className="min-w-0 flex-1 py-1.5">
          <p className={`break-words text-sm leading-5 [overflow-wrap:anywhere] ${item.completed ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.title}</p>
          <p className={`mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 ${fromHistory ? "text-destructive" : "text-muted-foreground"}`}>
            <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {fromHistory && item.due_date ? <>
              <span className="font-semibold">{t("checklist.overdue")}</span>
              <span>{t("checklist.originalDue").replace("{date}", formatDate(item.due_date))}</span>
            </> : <span>{currentDeadlineLabel(item)}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {fromHistory ? <Tool label={t("checklist.recover")}><Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-primary"
            aria-label={`${t("checklist.recover")}: ${item.title}`} disabled={busy || clearing || unavailable}
            onClick={() => setRecovering({ item, deadline: NO_DEADLINE })}><RotateCcw /></Button></Tool>
            : <Tool label={t("checklist.edit")}><Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground"
              aria-label={`${t("checklist.edit")}: ${item.title}`} disabled={busy || clearing || unavailable}
              onClick={() => setEditing({ id: item.id, title: item.title,
                deadline: { deadline_type: item.deadline_type, due_date: item.due_date } })}><Pencil /></Button></Tool>}
          <Tool label={t("checklist.delete")}><Button type="button" variant="ghost" size="icon" className="h-9 w-8 text-muted-foreground hover:text-destructive"
            aria-label={`${t("checklist.delete")}: ${item.title}`} disabled={busy || clearing || unavailable}
            onClick={() => void execute({ type: "delete", id: item.id })}><Trash2 /></Button></Tool>
        </div>
      </div>}
    </li>;
  }

  function taskList(list: TeacherChecklistItem[], fromHistory = false) {
    return <div role="region" aria-label={t(fromHistory ? "checklist.historyListLabel" : "checklist.listLabel")} tabIndex={0}
      data-no-carousel-drag className="max-h-72 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring sm:px-5 xl:max-h-none">
      <ul className="divide-y divide-border/60">{list.map((item, index) => <div key={item.id} className="contents">
        {!fromHistory && item.completed && !list[index - 1]?.completed && <li aria-hidden="true" className="mb-1 mt-1 list-none text-xs font-semibold text-muted-foreground">{t("checklist.completed")}</li>}
        {renderItem(item, fromHistory)}
      </div>)}</ul>
    </div>;
  }

  return (
    <TooltipProvider delayDuration={350}>
      <section aria-label={t("checklist.title")} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm xl:h-full">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-primary/10 bg-primary-soft/40 px-4 py-4 sm:px-5">
          <h2 className="flex items-center gap-2 font-display text-xl font-extrabold text-primary">
            {selected === 0 ? <ListChecks className="h-5 w-5 shrink-0" aria-hidden="true" /> : <History className="h-5 w-5 shrink-0" aria-hidden="true" />}
            {t(selected === 0 ? "checklist.title" : "checklist.history")}
          </h2>
          {!unavailable && <span aria-live="polite" className="text-xs font-semibold text-muted-foreground">
            {selected === 0
              ? t(pendingCount === 1 ? "checklist.pendingOne" : "checklist.pending").replace("{count}", String(pendingCount))
              : t(history.length === 1 ? "checklist.overdueOne" : "checklist.overdueCount").replace("{count}", String(history.length))}
          </span>}
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {isLoading || !today ? <div role="status" aria-label={t("checklist.loading")} className="space-y-3 px-4 py-5 sm:px-5">
            <span className="sr-only">{t("checklist.loading")}</span>
            {[0, 1, 2, 3].map((id) => <div key={id} className="flex gap-3 py-1"><Skeleton className="h-4 w-4 shrink-0" /><Skeleton className="h-4 flex-1" /></div>)}
          </div> : error || !items ? <div role="alert" className="space-y-3 px-4 py-5 sm:px-5">
            <p className="flex items-start gap-2 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t("checklist.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching || pending}>
              {isFetching && <Loader2 className="motion-safe:animate-spin" />}{t("checklist.retry")}
            </Button>
          </div> : <div ref={carouselRef} role="region" aria-roledescription="carousel" aria-label={t("checklist.carouselLabel")}
            tabIndex={0} onKeyDown={carouselKeys} className="min-h-0 overflow-hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring xl:flex-1">
            <div className="flex h-full touch-pan-y">
              <div role="group" aria-roledescription="slide" aria-label={t("checklist.currentSlide")} aria-hidden={selected !== 0}
                className="flex min-h-0 min-w-0 flex-[0_0_100%] flex-col">
                <div className="shrink-0 px-4 pb-3 pt-4 sm:px-5">
                  <form onSubmit={add} className="space-y-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Input ref={input} aria-label={t("checklist.add")} placeholder={t("checklist.placeholder")} value={title}
                        onChange={(event) => { setTitle(event.target.value); createId.current = null; }}
                        disabled={unavailable || adding} required className="h-9 min-w-0 flex-1 text-sm" />
                      <Tool label={t("checklist.add")}><Button type="submit" size="icon" aria-label={t("checklist.add")}
                        disabled={unavailable || adding || !title.trim() || (newDeadline.deadline_type === "specific" && !newDeadline.due_date)} className="shrink-0">
                        {adding ? <Loader2 className="motion-safe:animate-spin" /> : <Plus />}
                      </Button></Tool>
                    </div>
                    <ChecklistDeadlineFields id="new-checklist-deadline" value={newDeadline} today={today} preventPast disabled={unavailable || adding}
                      onChange={(deadline) => { setNewDeadline(deadline); createId.current = null; }} />
                  </form>
                </div>
                {current.length === 0 ? <p className="flex flex-1 items-center justify-center px-5 py-8 text-center text-sm text-muted-foreground">{t("checklist.empty")}</p>
                  : taskList(current)}
                {completedCount > 0 && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 sm:px-5">
                  {pendingCount === 0 && <span className="flex items-center gap-1.5 text-xs text-primary"><CheckCheck className="h-4 w-4" />{t("checklist.allDone")}</span>}
                  <Button variant="ghost" size="sm" className="ml-auto whitespace-normal text-muted-foreground" disabled={pending || Boolean(editing)}
                    onClick={() => setClearIds(current.filter((item) => item.completed).map((item) => item.id))}><Trash2 />{t("checklist.clear")}</Button>
                </footer>}
              </div>

              <div role="group" aria-roledescription="slide" aria-label={t("checklist.historySlide")} aria-hidden={selected !== 1}
                className="flex min-h-0 min-w-0 flex-[0_0_100%] flex-col">
                <div className="shrink-0 px-4 pb-2 pt-4 text-xs text-muted-foreground sm:px-5">{t("checklist.historyDescription")}</div>
                {history.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center">
                  <History className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">{t("checklist.historyEmpty")}</p>
                  <p className="text-xs text-muted-foreground">{t("checklist.historyEmptyDescription")}</p>
                </div> : taskList(history, true)}
              </div>
            </div>
          </div>}

          <div className="mt-auto flex shrink-0 items-center justify-center gap-2 px-4 py-3" aria-label={t("checklist.navigationLabel")}>
            {[0, 1].map((index) => <Button key={index} type="button" variant="ghost" size="icon" disabled={unavailable}
              aria-label={t(index === 0 ? "checklist.showChecklist" : "checklist.showHistory")} aria-current={selected === index ? "page" : undefined}
              onClick={() => goTo(index)} className="h-7 w-7 rounded-full p-0 hover:bg-transparent">
              <span className={`block h-2 rounded-full transition-all duration-200 motion-reduce:transition-none ${selected === index ? "w-5 bg-primary" : "w-2 bg-muted-foreground/30"}`} />
            </Button>)}
          </div>
        </div>
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

      <Dialog open={recovering !== null} onOpenChange={(open) => { if (!open && !recoveryPending) setRecovering(null); }}>
        <DialogContent closeLabel={t("checklist.cancel")} className="max-w-[calc(100vw-2rem)] rounded-xl sm:max-w-md motion-reduce:animate-none">
          <DialogHeader><DialogTitle className="font-display">{t("checklist.recoverTitle")}</DialogTitle>
            <DialogDescription>{recovering?.item.due_date ? t("checklist.recoverDescription").replace("{date}", formatDate(recovering.item.due_date)) : ""}</DialogDescription>
          </DialogHeader>
          {recovering && <form onSubmit={recover} className="space-y-4">
            <p className="break-words text-sm font-medium text-foreground">{recovering.item.title}</p>
            <ChecklistDeadlineFields id="recover-checklist-deadline" value={recovering.deadline} today={today ?? ""} preventPast disabled={recoveryPending}
              onChange={(deadline) => setRecovering({ ...recovering, deadline })} />
            <DialogFooter><Button type="button" variant="outline" disabled={recoveryPending} onClick={() => setRecovering(null)}>{t("checklist.cancel")}</Button>
              <Button type="submit" disabled={recoveryPending || (recovering.deadline.deadline_type === "specific" && !recovering.deadline.due_date)}>
                {recoveryPending ? <Loader2 className="motion-safe:animate-spin" /> : <RotateCcw />}{t("checklist.confirmRecover")}
              </Button>
            </DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

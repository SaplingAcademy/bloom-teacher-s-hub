import { useEffect, useMemo, useState } from "react";
import { AlarmClock, CircleCheck, ClipboardList, Clock, Mail, MessageCircle, Phone, Plus, Repeat, Users, Workflow, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";
import {
  completeLeadTask,
  DEFAULT_LEAD_ACTIVITY_TYPE,
  LEAD_ACTIVITY_TYPES,
  resolveLeadActivityType,
  type LeadActivityType,
  createLeadTask,
  fetchLeadTasks,
  groupLeadTasks,
  validateLeadTaskDraft,
  type LeadTask,
  type LeadTaskDraft,
} from "@/lib/lead-tasks";

interface Props {
  teacherId: string | undefined;
  leadId: string;
  /** Called after a successful write so the Leads page refreshes its task summary. */
  onTasksChanged?: () => void;
}

const EMPTY: LeadTaskDraft = { title: "", description: "", due: "", activityType: DEFAULT_LEAD_ACTIVITY_TYPE };

const ACTIVITY_ICONS: Record<LeadActivityType, LucideIcon> = {
  whatsapp: MessageCircle, call: Phone, email: Mail, meeting: Users, follow_up: Repeat, general: ClipboardList,
};

export function LeadTasksPanel({ teacherId, leadId, onTasksChanged }: Props) {
  const { t, lang } = useLanguage();
  const L = (k: string) => t(`leadTasks.${k}`);
  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const [tasks, setTasks] = useState<LeadTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<LeadTaskDraft>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      setTasks(await fetchLeadTasks(teacherId, leadId));
      setLoadFailed(false);
    } catch (err) {
      console.error("[LeadTasksPanel] load:", err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId, leadId]);

  const groups = useMemo(() => groupLeadTasks(tasks), [tasks]);
  const fmt = (v: string | null) =>
    v ? new Date(v).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : null;

  const handleCreate = async () => {
    const issue = validateLeadTaskDraft(draft);
    if (issue) return setFormError(L(issue));
    if (!teacherId) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await createLeadTask(teacherId, leadId, draft);
      setTasks((prev) => [...prev, created]);
      setDraft(EMPTY);
      setCreating(false);
      onTasksChanged?.();
    } catch (err) {
      console.error("[LeadTasksPanel] create:", err);
      setFormError(L("createError"));
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async (task: LeadTask) => {
    if (!teacherId) return;
    setCompletingId(task.id);
    setRowError(null);
    try {
      const saved = await completeLeadTask(teacherId, leadId, task.id);
      setTasks((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
      onTasksChanged?.();
    } catch (err) {
      console.error("[LeadTasksPanel] complete:", err);
      setRowError(L("completeError"));
    } finally {
      setCompletingId(null);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">{L("loading")}</p>;
  if (loadFailed)
    return (
      <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
        <p className="text-sm text-destructive">{L("loadError")}</p>
        <Button size="sm" variant="outline" onClick={load}>{L("retry")}</Button>
      </div>
    );

  const renderTask = (task: LeadTask, kind: "overdue" | "pending" | "completed") => (
    <li key={task.id} className="rounded-lg border border-border p-3 flex flex-col sm:flex-row sm:items-start gap-2">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={kind === "completed" ? "text-sm font-medium line-through text-muted-foreground" : "text-sm font-medium"}>
            {task.title}
          </span>
          {(() => {
            const type = resolveLeadActivityType(task.activity_type);
            const TypeIcon = ACTIVITY_ICONS[type];
            return (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <TypeIcon className="w-3 h-3" aria-hidden /> {L(`types.${type}`)}
              </span>
            );
          })()}
          {task.automation_event_id && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Workflow className="w-3 h-3" /> {L("automatic")}
            </Badge>
          )}
        </div>
        {task.description && <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{task.description}</p>}
        <p className={kind === "overdue" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {task.due_date ? `${L("due")}: ${fmt(task.due_date)}` : L("noDue")}
        </p>
      </div>
      {kind !== "completed" && (
        <Button size="sm" variant="outline" className="gap-1.5 shrink-0 self-start" disabled={completingId === task.id} onClick={() => handleComplete(task)}>
          <CircleCheck className="w-3.5 h-3.5" /> {completingId === task.id ? L("completing") : L("complete")}
        </Button>
      )}
    </li>
  );

  const section = (kind: "overdue" | "pending" | "completed", Icon: typeof Clock, list: LeadTask[]) => (
    <section className="space-y-2">
      <h4 className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${kind === "overdue" ? "text-destructive" : "text-muted-foreground"}`}>
        <Icon className="w-3.5 h-3.5" /> {L(kind)} ({list.length})
      </h4>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">{L(`${kind}Empty`)}</p>
      ) : (
        <ul className="space-y-2">{list.map((task) => renderTask(task, kind))}</ul>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      {creating ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lead-task-title">{L("title")}</Label>
            <Input id="lead-task-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lead-task-type">{L("activityType")}</Label>
            <Select value={draft.activityType} onValueChange={(v) => setDraft({ ...draft, activityType: v as LeadActivityType })}>
              <SelectTrigger id="lead-task-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_ACTIVITY_TYPES.map((type) => {
                  const Icon = ACTIVITY_ICONS[type];
                  return (
                    <SelectItem key={type} value={type}>
                      <span className="inline-flex items-center gap-2"><Icon className="w-3.5 h-3.5" aria-hidden /> {L(`types.${type}`)}</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lead-task-desc">{L("description")}</Label>
            <Textarea id="lead-task-desc" rows={2} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lead-task-due">{L("dueDate")}</Label>
            <Input id="lead-task-due" type="datetime-local" value={draft.due} onChange={(e) => setDraft({ ...draft, due: e.target.value })} />
          </div>
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={saving} onClick={() => { setCreating(false); setDraft(EMPTY); setFormError(null); }}>
              {L("cancel")}
            </Button>
            <Button size="sm" disabled={saving} onClick={handleCreate}>{saving ? L("saving") : L("create")}</Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setCreating(true)}>
            <Plus className="w-3.5 h-3.5" /> {L("new")}
          </Button>
        </div>
      )}
      {rowError && <p role="alert" className="text-sm text-destructive">{rowError}</p>}
      {section("overdue", AlarmClock, groups.overdue)}
      {section("pending", Clock, groups.pending)}
      {section("completed", CircleCheck, groups.completed)}
    </div>
  );
}

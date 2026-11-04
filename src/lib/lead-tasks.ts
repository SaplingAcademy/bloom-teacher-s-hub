import { supabase } from "@/lib/supabase";

/**
 * Lead tasks reuse the canonical `public.tasks` table (linked by `lead_id`,
 * owner-scoped by `teacher_id` under RLS). No parallel task model.
 * `tasks` has no completion timestamp column, so none is shown or inferred.
 */
export interface LeadTask {
  id: string;
  lead_id: string | null;
  title: string;
  description: string | null;
  status: string | null;
  due_date: string | null;
  created_at: string | null;
  automation_event_id: string | null;
}

export const LEAD_TASK_COLUMNS =
  "id, lead_id, title, description, status, due_date, created_at, automation_event_id";

export interface LeadTaskGroups {
  overdue: LeadTask[];
  pending: LeadTask[];
  completed: LeadTask[];
}

const time = (v: string | null) => (v ? new Date(v).getTime() : Number.POSITIVE_INFINITY);

/** Same overdue rule as Precisa de atenção: pending and due_date before now. */
export function groupLeadTasks(tasks: LeadTask[], now: Date = new Date()): LeadTaskGroups {
  const nowMs = now.getTime();
  const groups: LeadTaskGroups = { overdue: [], pending: [], completed: [] };
  for (const task of tasks) {
    if (task.status === "completed") groups.completed.push(task);
    else if (task.due_date && new Date(task.due_date).getTime() < nowMs) groups.overdue.push(task);
    else groups.pending.push(task);
  }
  const byDue = (a: LeadTask, b: LeadTask) => time(a.due_date) - time(b.due_date);
  groups.overdue.sort(byDue);
  groups.pending.sort(byDue);
  groups.completed.sort((a, b) => time(b.due_date) - time(a.due_date));
  return groups;
}

export interface LeadTaskDraft {
  title: string;
  description: string;
  /** Value from a datetime-local input (device local time). */
  due: string;
}

export type LeadTaskIssue = "titleRequired" | "dueRequired" | "dueInvalid";

export function validateLeadTaskDraft(draft: LeadTaskDraft): LeadTaskIssue | null {
  if (!draft.title.trim()) return "titleRequired";
  if (!draft.due.trim()) return "dueRequired";
  if (Number.isNaN(new Date(draft.due).getTime())) return "dueInvalid";
  return null;
}

export function buildLeadTaskInsert(teacherId: string, leadId: string, draft: LeadTaskDraft) {
  const description = draft.description.trim();
  return {
    teacher_id: teacherId,
    lead_id: leadId,
    title: draft.title.trim(),
    description: description ? description : null,
    status: "pending",
    due_date: new Date(draft.due).toISOString(),
  };
}

export async function fetchLeadTasks(teacherId: string, leadId: string): Promise<LeadTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select(LEAD_TASK_COLUMNS)
    .eq("teacher_id", teacherId)
    .eq("lead_id", leadId);
  if (error) throw error;
  return (data || []) as LeadTask[];
}

export async function createLeadTask(teacherId: string, leadId: string, draft: LeadTaskDraft): Promise<LeadTask> {
  const { data, error } = await supabase
    .from("tasks")
    .insert(buildLeadTaskInsert(teacherId, leadId, draft))
    .select(LEAD_TASK_COLUMNS)
    .single();
  if (error || !data) throw error ?? new Error("Task not created");
  return data as LeadTask;
}

export async function completeLeadTask(teacherId: string, leadId: string, taskId: string): Promise<LeadTask> {
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("teacher_id", teacherId)
    .eq("lead_id", leadId)
    .select(LEAD_TASK_COLUMNS)
    .maybeSingle();
  if (error || !data) throw error ?? new Error("Task not updated");
  return data as LeadTask;
}

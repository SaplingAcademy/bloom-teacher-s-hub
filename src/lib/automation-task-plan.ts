/**
 * Pure planning for automation-generated lead tasks (Rules A, C, D).
 * Identity of an automatic task = automation_event_id (event of the rule's type
 * for this lead) + activity_type role. Titles are never the primary key.
 * Completed and manual (automation_event_id NULL) tasks are never touched.
 */
export interface AutoTaskRow {
  id: string;
  status: string | null;
  automation_event_id: string | null;
  activity_type: string | null;
}

export interface AutoTaskSpec {
  activity_type: string;
  title: string;
  description: string;
  due_date: string;
}

export type AutoTaskAction =
  | { kind: "insert"; spec: AutoTaskSpec }
  | { kind: "update"; taskId: string; spec: AutoTaskSpec }
  | { kind: "skip"; taskId: string };

/**
 * existing: tasks of this lead linked to events of the same rule.
 * updatePending: reschedule/proposal update refreshes pending tasks; otherwise kept as-is.
 */
export function planAutoTasks(
  existing: AutoTaskRow[],
  ruleEventIds: Set<string>,
  specs: AutoTaskSpec[],
  updatePending: boolean,
): AutoTaskAction[] {
  const linked = existing.filter((t) => t.automation_event_id && ruleEventIds.has(t.automation_event_id));
  return specs.map((spec) => {
    const same = linked.filter((t) => t.activity_type === spec.activity_type);
    const pending = same.find((t) => t.status !== "completed");
    if (pending) return updatePending ? { kind: "update", taskId: pending.id, spec } : { kind: "skip", taskId: pending.id };
    const done = same.find((t) => t.status === "completed");
    if (done) return { kind: "skip", taskId: done.id };
    return { kind: "insert", spec };
  });
}

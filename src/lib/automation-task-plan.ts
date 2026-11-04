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

export interface ProposalEventRow {
  id: string;
  status: string | null;
  idempotency_key: string;
}

/**
 * Stable proposal cycle identity (Rule D), derived only from persisted events/tasks — never timestamps.
 * - Latest cycle unfinished (failed/processing/retrying) → same key (retry).
 * - Latest cycle has a pending linked task → same key (update of the same proposal).
 * - Otherwise → next cycle number (a new proposal gets its own follow-up).
 * Legacy keys without a cycle number count as cycle 0.
 */
export function resolveProposalCycle(
  leadId: string,
  events: ProposalEventRow[],
  pendingTaskEventIds: Set<string>,
): { key: string; cycle: number; isNew: boolean } {
  const prefix = `proposal-recorded:${leadId}:cycle:`;
  const numbered = events.map((e) => {
    const n = e.idempotency_key.startsWith(prefix) ? Number(e.idempotency_key.slice(prefix.length)) : 0;
    return { ...e, n: Number.isFinite(n) ? n : 0 };
  });
  if (numbered.length === 0) return { key: `${prefix}1`, cycle: 1, isNew: true };
  const maxN = Math.max(...numbered.map((e) => e.n));
  const latest = numbered.filter((e) => e.n === maxN);
  const reuse = latest.some((e) => e.status !== "completed" || pendingTaskEventIds.has(e.id));
  if (reuse) {
    // Legacy events keep their original key so their pending follow-up is updated, not duplicated.
    const target = latest.find((e) => e.status !== "completed" || pendingTaskEventIds.has(e.id))!;
    return { key: maxN > 0 ? `${prefix}${maxN}` : target.idempotency_key, cycle: maxN, isNew: false };
  }
  return { key: `${prefix}${maxN + 1}`, cycle: maxN + 1, isNew: true };
}

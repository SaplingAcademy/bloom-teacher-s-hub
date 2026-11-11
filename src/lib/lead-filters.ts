import type { Lead } from "@/lib/automation-engine";
import { resolveLeadActivityType } from "@/lib/lead-tasks";

export type ContactFilter = "all" | "pending" | "done";
export type TaskFilter = "all" | "pending" | "overdue";

export interface LeadFilters {
  stage: string;
  contact: ContactFilter;
  source: string;
  campaign: string;
  tag: string;
  language: string;
  level: string;
  focus: string;
  modality: string;
  createdFrom: string; // YYYY-MM-DD
  createdTo: string; // YYYY-MM-DD
  valueMin: string;
  valueMax: string;
  tasks: TaskFilter;
  /** "" = any; otherwise a stable activity type (NULL tasks count as "general"). */
  activityType: string;
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  stage: "", contact: "all", source: "", campaign: "", tag: "", language: "", level: "", focus: "",
  modality: "", createdFrom: "", createdTo: "", valueMin: "", valueMax: "", tasks: "all", activityType: "",
};

export function countActiveLeadFilters(f: LeadFilters): number {
  return (Object.keys(EMPTY_LEAD_FILTERS) as (keyof LeadFilters)[]).filter(
    (k) => f[k] !== EMPTY_LEAD_FILTERS[k],
  ).length;
}

/** Keys whose value differs from the empty filter, in EMPTY_LEAD_FILTERS order (active-filter chips). */
export function activeLeadFilterKeys(f: LeadFilters): (keyof LeadFilters)[] {
  return (Object.keys(EMPTY_LEAD_FILTERS) as (keyof LeadFilters)[]).filter((k) => f[k] !== EMPTY_LEAD_FILTERS[k]);
}

/** Resets one filter to its empty value, keeping every other filter. */
export function clearLeadFilter(f: LeadFilters, key: keyof LeadFilters): LeadFilters {
  return { ...f, [key]: EMPTY_LEAD_FILTERS[key] };
}

export interface LeadTaskSummary {
  pending: number;
  overdue: number;
  /** Per activity type counts over all linked tasks (any status). */
  byType: Record<string, { total: number; pending: number; overdue: number }>;
}

/**
 * True when a task-filter result must not be trusted: the required task data
 * failed to load while a pending/overdue task filter is active. An empty
 * result in that situation is an unknown, not a valid conclusion.
 */
export function isTaskFilterUnavailable(tasksError: boolean, tasksFilter: TaskFilter, activityType = ""): boolean {
  return tasksError && (tasksFilter !== "all" || activityType !== "");
}

/** Per-lead pending/overdue counts (pending tasks only) plus per-activity-type counts over all linked tasks. */
export function summarizeLeadTasks(
  tasks: { lead_id?: string | null; status?: string | null; due_date?: string | null; activity_type?: string | null }[],
  now: Date,
): Map<string, LeadTaskSummary> {
  const map = new Map<string, LeadTaskSummary>();
  for (const task of tasks) {
    if (!task.lead_id) continue;
    const entry = map.get(task.lead_id) ?? { pending: 0, overdue: 0, byType: {} };
    const type = resolveLeadActivityType(task.activity_type);
    const bucket = (entry.byType[type] ??= { total: 0, pending: 0, overdue: 0 });
    bucket.total += 1;
    if (task.status === "pending") {
      const overdue = !!task.due_date && new Date(task.due_date).getTime() < now.getTime();
      entry.pending += 1;
      bucket.pending += 1;
      if (overdue) { entry.overdue += 1; bucket.overdue += 1; }
    }
    map.set(task.lead_id, entry);
  }
  return map;
}

/** Contact is "done" only with a real contacted_at; manual stage changes do not count. */
export function isContactPending(lead: Pick<Lead, "contacted_at">): boolean {
  return !lead.contacted_at;
}

const DAY = 86_400_000;
/** Elapsed time since creation for pending contacts; null when contacted or unknown. */
export function pendingContactAge(
  lead: Pick<Lead, "contacted_at" | "created_at">,
  now: Date,
): { days: number; hours: number } | null {
  if (!isContactPending(lead) || !lead.created_at) return null;
  const ms = Math.max(0, now.getTime() - new Date(lead.created_at).getTime());
  return { days: Math.floor(ms / DAY), hours: Math.floor(ms / 3_600_000) };
}

export interface LeadFilterContext {
  search: string;
  now: Date;
  tasks: Map<string, LeadTaskSummary>;
  /** Resolves a stored catalog value (ID/legacy) to its canonical ID so legacy values match. */
  catalogId?: (category: "levels" | "focuses" | "modalities", value: string) => string;
}

function localDay(iso: string): string {
  const d = new Date(iso);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function toNumber(v: string): number | null {
  const raw = v.trim().replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function matchesLeadSearch(lead: Lead, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    lead.full_name.toLowerCase().includes(q) ||
    Boolean(lead.email?.toLowerCase().includes(q)) ||
    Boolean(lead.phone?.includes(search.trim()))
  );
}

/** All filters combine with AND; the free-text search is preserved. */
export function applyLeadFilters(leads: Lead[], f: LeadFilters, ctx: LeadFilterContext): Lead[] {
  const id = (cat: "levels" | "focuses" | "modalities", v: string) => (ctx.catalogId ? ctx.catalogId(cat, v) : v);
  const min = toNumber(f.valueMin);
  const max = toNumber(f.valueMax);
  const campaign = f.campaign.trim().toLowerCase();
  const tag = f.tag.trim().toLowerCase();
  return leads.filter((l) => {
    if (!matchesLeadSearch(l, ctx.search)) return false;
    if (f.stage && l.stage !== f.stage) return false;
    if (f.contact === "pending" && !isContactPending(l)) return false;
    if (f.contact === "done" && isContactPending(l)) return false;
    if (f.source && (l.source ?? "") !== f.source) return false;
    if (campaign && !(l.campaign ?? "").toLowerCase().includes(campaign)) return false;
    if (tag && !(l.tags ?? []).some((t) => t.toLowerCase() === tag)) return false;
    if (f.language && l.language_studied !== f.language) return false;
    if (f.level && (!l.level || id("levels", l.level) !== id("levels", f.level))) return false;
    if (f.focus && (!l.focus || id("focuses", l.focus) !== id("focuses", f.focus))) return false;
    if (f.modality && (!l.modality || id("modalities", l.modality) !== id("modalities", f.modality))) return false;
    if (f.createdFrom || f.createdTo) {
      if (!l.created_at) return false;
      const day = localDay(l.created_at);
      if (f.createdFrom && day < f.createdFrom) return false;
      if (f.createdTo && day > f.createdTo) return false;
    }
    if (min !== null || max !== null) {
      if (l.potential_value === null || l.potential_value === undefined) return false;
      const v = Number(l.potential_value);
      if (min !== null && v < min) return false;
      if (max !== null && v > max) return false;
    }
    if (f.tasks !== "all" || f.activityType) {
      const s = ctx.tasks.get(l.id);
      // With a type selected, pending/overdue apply to tasks of that type; "all" means any linked task of it.
      const scope = f.activityType ? s?.byType[f.activityType] : s;
      if (!scope) return false;
      if (f.tasks === "pending" && !(scope.pending > 0)) return false;
      if (f.tasks === "overdue" && !(scope.overdue > 0)) return false;
      if (f.tasks === "all" && f.activityType && !((scope as { total: number }).total > 0)) return false;
    }
    return true;
  });
}

export function normalizePhone(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}
export function normalizeEmail(v?: string | null): string {
  return (v ?? "").trim().toLowerCase();
}

/** Possible duplicates within the same teacher's leads, by normalized phone or case-insensitive email. */
export function findDuplicateLeads<T extends Pick<Lead, "id" | "teacher_id" | "phone" | "email">>(
  teacherId: string,
  existing: T[],
  candidate: { phone?: string | null; email?: string | null },
): T[] {
  const phone = normalizePhone(candidate.phone);
  const email = normalizeEmail(candidate.email);
  if (!phone && !email) return [];
  return existing.filter(
    (l) =>
      l.teacher_id === teacherId &&
      ((phone !== "" && normalizePhone(l.phone) === phone) || (email !== "" && normalizeEmail(l.email) === email)),
  );
}

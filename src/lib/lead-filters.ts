import type { Lead } from "@/lib/automation-engine";

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
}

export const EMPTY_LEAD_FILTERS: LeadFilters = {
  stage: "", contact: "all", source: "", campaign: "", tag: "", language: "", level: "", focus: "",
  modality: "", createdFrom: "", createdTo: "", valueMin: "", valueMax: "", tasks: "all",
};

export function countActiveLeadFilters(f: LeadFilters): number {
  return (Object.keys(EMPTY_LEAD_FILTERS) as (keyof LeadFilters)[]).filter(
    (k) => f[k] !== EMPTY_LEAD_FILTERS[k],
  ).length;
}

export interface LeadTaskSummary {
  pending: number;
  overdue: number;
}

/** Per-lead pending/overdue counts from pending tasks of the teacher. */
export function summarizeLeadTasks(
  tasks: { lead_id?: string | null; status?: string | null; due_date?: string | null }[],
  now: Date,
): Map<string, LeadTaskSummary> {
  const map = new Map<string, LeadTaskSummary>();
  for (const task of tasks) {
    if (!task.lead_id || task.status !== "pending") continue;
    const entry = map.get(task.lead_id) ?? { pending: 0, overdue: 0 };
    entry.pending += 1;
    if (task.due_date && new Date(task.due_date).getTime() < now.getTime()) entry.overdue += 1;
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
    if (f.tasks !== "all") {
      const s = ctx.tasks.get(l.id);
      if (f.tasks === "pending" && !(s && s.pending > 0)) return false;
      if (f.tasks === "overdue" && !(s && s.overdue > 0)) return false;
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

import { supabase } from "@/lib/supabase";
import type { AutomationActivity } from "@/lib/automation-engine";

/**
 * Manual lead interactions live in `public.lead_interactions` (insert/select only).
 * Database triggers own `leads.contacted_at` / `last_interaction_at`; the frontend
 * never writes those columns, never changes the stage and never creates tasks.
 */
export const LEAD_INTERACTION_TYPES = ["whatsapp", "call", "email", "meeting", "note", "other"] as const;
export type LeadInteractionType = (typeof LEAD_INTERACTION_TYPES)[number];

export interface LeadInteraction {
  id: string;
  lead_id: string;
  type: string;
  description: string;
  occurred_at: string;
  created_at: string;
}

export interface LeadInteractionDraft {
  type: LeadInteractionType;
  /** datetime-local value (device local time). */
  occurredAt: string;
  description: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Formats a Date as a datetime-local input value in device time. */
export function toDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function emptyInteractionDraft(now: Date = new Date()): LeadInteractionDraft {
  return { type: "whatsapp", occurredAt: toDateTimeLocal(now), description: "" };
}

export type InteractionDraftIssue = "typeRequired" | "dateRequired" | "dateInvalid" | "dateFuture" | "descriptionRequired";

/** Same tolerance as the database trigger (1 minute) so both reject future dates consistently. */
export function validateInteractionDraft(draft: LeadInteractionDraft, now: Date = new Date()): InteractionDraftIssue | null {
  if (!(LEAD_INTERACTION_TYPES as readonly string[]).includes(draft.type)) return "typeRequired";
  if (!draft.occurredAt) return "dateRequired";
  const when = new Date(draft.occurredAt);
  if (Number.isNaN(when.getTime())) return "dateInvalid";
  if (when.getTime() > now.getTime() + 60_000) return "dateFuture";
  if (!draft.description.trim()) return "descriptionRequired";
  return null;
}

export function buildInteractionInsert(teacherId: string, leadId: string, draft: LeadInteractionDraft) {
  return {
    teacher_id: teacherId,
    lead_id: leadId,
    type: draft.type,
    occurred_at: new Date(draft.occurredAt).toISOString(),
    description: draft.description.trim(),
  };
}

/** Internal notes are recorded in history but are not an effective contact. */
export function isEffectiveContact(type: string): boolean {
  return type !== "note";
}

export const STAGE_NEW = "Novo contato";
export const STAGE_IN_CONVERSATION = "Em conversa";

/** Only an effective contact moves a lead out of exactly "Novo contato". */
export function shouldAdvanceStageOnInteraction(currentStage: string | null | undefined, type: string): boolean {
  return currentStage === STAGE_NEW && isEffectiveContact(type);
}

/**
 * Owner-scoped compare-and-set: changes the stage only while it is still "Novo contato".
 * Returns true if a row was updated, false if the stage had already changed. Throws on failure.
 */
export async function advanceLeadStageAfterInteraction(teacherId: string, leadId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("leads")
    .update({ stage: STAGE_IN_CONVERSATION, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("teacher_id", teacherId)
    .eq("stage", STAGE_NEW)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

const INTERACTION_COLUMNS = "id, lead_id, type, description, occurred_at, created_at";

export async function fetchLeadInteractions(teacherId: string, leadId: string): Promise<LeadInteraction[]> {
  const { data, error } = await supabase
    .from("lead_interactions")
    .select(INTERACTION_COLUMNS)
    .eq("teacher_id", teacherId)
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadInteraction[];
}

export async function createLeadInteraction(teacherId: string, leadId: string, draft: LeadInteractionDraft): Promise<LeadInteraction> {
  const { data, error } = await supabase
    .from("lead_interactions")
    .insert(buildInteractionInsert(teacherId, leadId, draft))
    .select(INTERACTION_COLUMNS)
    .single();
  if (error) throw error;
  return data as LeadInteraction;
}

const PAGE = 500;
/** All automation activity targeting this lead (paginated; no global 30-row cap). Throws on failure. */
export async function fetchLeadAutomationActivity(teacherId: string, leadId: string): Promise<AutomationActivity[]> {
  const all: AutomationActivity[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("automation_activity")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("target_id", leadId)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...((data ?? []) as AutomationActivity[]));
    if (!data || data.length < PAGE) break;
  }

  // Older conversion RPCs targeted the student. Resolve only conversion events
  // whose canonical source is THIS teacher's original lead, never all students.
  const { data: conversions, error: conversionError } = await supabase
    .from("automation_events")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("source_table", "leads")
    .eq("source_id", leadId)
    .eq("event_type", "lead.converted");
  if (conversionError) throw conversionError;
  const eventIds = (conversions ?? []).map((event: { id: string }) => event.id);
  if (eventIds.length > 0) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("automation_activity")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("action_type", "lead_converted")
        .in("automation_event_id", eventIds)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const knownIds = new Set(all.map((entry) => entry.id));
      all.push(...((data ?? []) as AutomationActivity[]).filter((entry) => !knownIds.has(entry.id)));
      if (!data || data.length < PAGE) break;
    }
  }
  return all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export type TimelineEntry =
  | { kind: "manual"; id: string; at: string; type: string; description: string }
  | { kind: "automatic"; id: string; at: string; description: string };

/** Unified timeline, newest first. Manual and automatic entries stay distinguishable. */
export function mergeLeadTimeline(manual: LeadInteraction[], automatic: AutomationActivity[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...manual.map((m) => ({ kind: "manual" as const, id: `m-${m.id}`, at: m.occurred_at, type: m.type, description: m.description })),
    ...automatic.map((a) => ({ kind: "automatic" as const, id: `a-${a.id}`, at: a.created_at, description: a.description })),
  ];
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

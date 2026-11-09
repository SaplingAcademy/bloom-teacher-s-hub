import { supabase } from "@/lib/supabase";
import { normalizeLeadStage } from "@/lib/automation-engine";
import { FUNNEL_STAGES } from "@/lib/lead-stage-confirmation";

/**
 * Read-only relevance of automation-generated lead tasks for Today/Urgente.
 * An automatic task is identified by the event type that created it
 * (tasks.automation_event_id → automation_events.event_type) plus its activity_type
 * role — never by its title. It stays visible only while its purpose still fits the
 * lead's current funnel stage and recorded facts. Manual tasks (no automation event),
 * unknown events and unknown stages are always kept. Nothing is completed or deleted.
 */
export interface LeadTaskLeadState {
  stage?: string | null;
  contacted_at?: string | null;
  trial_scheduled_at?: string | null;
}

const CLOSED_STAGES = new Set(["Convertido", "Perdido"]);

export function isAutoLeadTaskRelevant(
  eventType: string | null | undefined,
  activityType: string | null | undefined,
  lead: LeadTaskLeadState | null | undefined,
  now: Date,
): boolean {
  if (!eventType || !lead) return true;
  const stage = normalizeLeadStage(lead.stage || undefined);
  if (CLOSED_STAGES.has(stage)) return false; // prospecting automation lost its purpose
  const index = FUNNEL_STAGES.findIndex((s) => s === stage);
  if (index < 0) return true;
  const trialIndex = FUNNEL_STAGES.indexOf("Aula experimental agendada");
  const proposalIndex = FUNNEL_STAGES.indexOf("Proposta enviada");
  switch (eventType) {
    case "lead.created": // first contact: superseded by a recorded contact or any later stage
      return index === 0 && !lead.contacted_at && !lead.trial_scheduled_at;
    case "lead.trial_scheduled": {
      if (index !== trialIndex) return false;
      if (activityType === "whatsapp") {
        // Confirmation only makes sense before the trial takes place.
        const trialAt = lead.trial_scheduled_at ? new Date(lead.trial_scheduled_at).getTime() : NaN;
        return !Number.isFinite(trialAt) || trialAt > now.getTime();
      }
      return true; // post-trial feedback stays until the lead moves on
    }
    case "lead.proposal_recorded":
      return index === proposalIndex;
    default:
      return true; // e.g. lead.inactive re-contact stays valid in any open stage
  }
}

type LeadTaskRow = {
  automation_event_id?: string | null;
  activity_type?: string | null;
  leads?: LeadTaskLeadState | LeadTaskLeadState[] | null;
};

/** Keeps only lead tasks still pertinent to their lead; one batched event lookup. */
export async function filterRelevantLeadTasks<T extends LeadTaskRow>(teacherId: string, rows: T[], now: Date): Promise<T[]> {
  const eventIds = [...new Set(rows.map((r) => r.automation_event_id).filter((id): id is string => Boolean(id)))];
  if (eventIds.length === 0) return rows;
  const { data, error } = await supabase
    .from("automation_events")
    .select("id, event_type")
    .eq("teacher_id", teacherId)
    .in("id", eventIds);
  if (error) throw error;
  const typeById = new Map((data || []).map((e: any) => [e.id, e.event_type as string]));
  return rows.filter((r) => {
    if (!r.automation_event_id) return true; // manual task
    const lead = Array.isArray(r.leads) ? r.leads[0] : r.leads;
    return isAutoLeadTaskRelevant(typeById.get(r.automation_event_id), r.activity_type, lead, now);
  });
}

export const LEAD_TASK_RELEVANCE_COLUMNS = "automation_event_id, activity_type, leads(stage, contacted_at, trial_scheduled_at)";

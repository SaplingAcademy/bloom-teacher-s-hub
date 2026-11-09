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
  trial_calendar_event_id?: string | null;
}

/** The lead's linked trial occurrence as persisted in calendar_events (never browser storage). */
export interface TrialEventState {
  date?: string | null;
  end_time?: string | null;
  status?: string | null;
}

const CANCELLED_EVENT_STATUSES = new Set(["cancelled", "canceled"]);

/**
 * Earliest moment the post-trial feedback may be asked for. It only means the scheduled
 * time is over — it is NOT proof the trial happened (the task asks the teacher to check).
 * - Linked event with date + end_time → that end time.
 * - Linked event with a date but no end_time → end of that day (no invented hour).
 * - No linked event data → end of the trial_scheduled_at day; with neither, null
 *   (the task's own due date remains the only gate).
 */
export function trialFeedbackEligibleAt(lead: LeadTaskLeadState, event: TrialEventState | null | undefined): Date | null {
  const endOfDay = (ymd: string) => new Date(`${ymd}T23:59:59`);
  if (event?.date) {
    const end = (event.end_time || "").slice(0, 8);
    return /^\d{2}:\d{2}/.test(end) ? new Date(`${event.date}T${end.length === 5 ? `${end}:00` : end}`) : endOfDay(event.date);
  }
  if (lead.trial_scheduled_at) {
    const start = new Date(lead.trial_scheduled_at);
    if (Number.isFinite(start.getTime())) {
      const ymd = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
      return endOfDay(ymd);
    }
  }
  return null;
}

const CLOSED_STAGES = new Set(["Convertido", "Perdido"]);

export function isAutoLeadTaskRelevant(
  eventType: string | null | undefined,
  activityType: string | null | undefined,
  lead: LeadTaskLeadState | null | undefined,
  now: Date,
  trialEvent?: TrialEventState | null,
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
      // Post-trial check: never for a trial cancelled in the database, never before the
      // linked occurrence's real end; stays until the lead moves on.
      if (CANCELLED_EVENT_STATUSES.has(String(trialEvent?.status || "").toLowerCase())) return false;
      const eligibleAt = trialFeedbackEligibleAt(lead, trialEvent);
      return !eligibleAt || eligibleAt.getTime() <= now.getTime();
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
  const leadOf = (r: T) => (Array.isArray(r.leads) ? r.leads[0] : r.leads) || null;

  // Linked trial occurrences, read from the database only for trial-rule tasks.
  const trialIds = [...new Set(rows
    .filter((r) => r.automation_event_id && typeById.get(r.automation_event_id) === "lead.trial_scheduled")
    .map((r) => leadOf(r)?.trial_calendar_event_id)
    .filter((id): id is string => Boolean(id)))];
  const trialById = new Map<string, TrialEventState>();
  if (trialIds.length > 0) {
    const { data: trials, error: trialError } = await supabase
      .from("calendar_events")
      .select("id, date, end_time, status")
      .eq("teacher_id", teacherId)
      .in("id", trialIds);
    if (trialError) throw trialError;
    (trials || []).forEach((e: any) => trialById.set(e.id, e));
  }

  return rows.filter((r) => {
    if (!r.automation_event_id) return true; // manual task
    const lead = leadOf(r);
    const trial = lead?.trial_calendar_event_id ? trialById.get(lead.trial_calendar_event_id) : null;
    return isAutoLeadTaskRelevant(typeById.get(r.automation_event_id), r.activity_type, lead, now, trial);
  });
}

export const LEAD_TASK_RELEVANCE_COLUMNS = "automation_event_id, activity_type, leads(stage, contacted_at, trial_scheduled_at, trial_calendar_event_id)";

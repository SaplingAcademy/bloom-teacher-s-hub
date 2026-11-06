import { supabase } from "@/lib/supabase";
import type { Lead } from "./automation-engine";
import { stageEvidence, confirmationKey, validateConfirmationDate, type PriorStep, type StageConfirmationEvent, type StepEvidence } from "./lead-stage-confirmation";

async function authenticatedLead(expectedOwner: string, leadId: string): Promise<Lead> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!expectedOwner || auth.user?.id !== expectedOwner) throw new Error("authentication_changed");
  const { data, error } = await supabase.from("leads").select("*").eq("teacher_id", expectedOwner).eq("id", leadId).maybeSingle();
  if (error) throw error; if (!data) throw new Error("lead_unavailable"); return data as Lead;
}
async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const result: T[] = [];
  for (let i = 0; ; i += 500) { const { data, error } = await query(i, i + 499); if (error) throw error; const rows = (data ?? []) as T[]; result.push(...rows); if (rows.length < 500) return result; }
}
export async function readStageEvidence(owner: string, leadId: string): Promise<{ lead: Lead; evidence: StepEvidence }> {
  const lead = await authenticatedLead(owner, leadId);
  const [interactions, events] = await Promise.all([
    readAll<{ type: string }>((a, b) => supabase.from("lead_interactions").select("id,type").eq("teacher_id", owner).eq("lead_id", leadId).order("id").range(a, b)),
    readAll<StageConfirmationEvent>((a, b) => supabase.from("automation_events").select("id,event_type,status,payload").eq("teacher_id", owner).eq("source_table", "leads").eq("source_id", leadId).in("event_type", ["lead.interaction", "lead.trial_scheduled", "lead.proposal_recorded", "lead.stage_confirmed"]).order("id").range(a, b)),
  ]);
  return { lead, evidence: stageEvidence(lead, interactions, events) };
}
/** Stable first-contact identity across retries/tabs; no timestamp-derived keys. */
export async function confirmationUuid(key: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key)));
  digest[6] = (digest[6] & 15) | 80; digest[8] = (digest[8] & 63) | 128;
  const hex = [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function contactRecorded(owner: string, leadId: string, id: string) {
  const { data, error } = await supabase.from("lead_interactions").select("id").eq("teacher_id", owner).eq("lead_id", leadId).eq("id", id).maybeSingle();
  if (error) throw error; if (!data) throw new Error("confirmation_unavailable");
}

/** Explicit user-confirmed facts only. No Rule B/C/D, calendar, task, or stage mutations here. */
export async function recordConfirmedStep(owner: string, leadId: string, step: PriorStep, occurredAt: string, description: string): Promise<void> {
  const issue = validateConfirmationDate(occurredAt); if (issue) throw new Error(issue);
  if (!description.trim()) throw new Error("description_required");
  const { evidence } = await readStageEvidence(owner, leadId);
  const key = confirmationKey(owner, leadId, step);
  const { data: prior, error: priorError } = await supabase.from("automation_events").select("id,payload").eq("teacher_id", owner).eq("source_table", "leads").eq("source_id", leadId).eq("event_type", "lead.stage_confirmed").eq("idempotency_key", key).maybeSingle();
  if (priorError) throw priorError;
  if (evidence[step] && !prior) return;
  if (step === "contact") {
    if (evidence.contact) return;
    const id = await confirmationUuid(key);
    // Minimal factual description, no invented channel or details. Trigger owns min/max contact dates.
    const { error } = await supabase.from("lead_interactions").insert({ id, teacher_id: owner, lead_id: leadId, type: "other", description, occurred_at: new Date(occurredAt).toISOString() });
    if (error && error.code !== "23505") throw error;
    await contactRecorded(owner, leadId, id);
    return;
  }
  let event = prior;
  if (!event) {
    const { error } = await supabase.from("automation_events").upsert({ teacher_id: owner, source_table: "leads", source_id: leadId, event_type: "lead.stage_confirmed", status: "completed", idempotency_key: key, payload: { step, occurred_at: new Date(occurredAt).toISOString(), description, origin: "manual_confirmation" }, processed_at: new Date().toISOString() }, { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) throw error;
    const { data, error: readError } = await supabase.from("automation_events").select("id,payload").eq("teacher_id", owner).eq("source_table", "leads").eq("source_id", leadId).eq("idempotency_key", key).maybeSingle();
    if (readError) throw readError; if (!data) throw new Error("confirmation_unavailable"); event = data;
  }
  // Same ID on uncertain retries prevents repeated history entries. Preserve original fact/date.
  const { error } = await supabase.from("automation_activity").upsert({ id: await confirmationUuid(`${key}:history`), teacher_id: owner, automation_event_id: event.id, action_type: "manual_stage_confirmation", target_table: "leads", target_id: leadId, description: String(event.payload?.description ?? description) }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
}
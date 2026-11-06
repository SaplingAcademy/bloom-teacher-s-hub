import type { Lead } from "./automation-engine";
export const FUNNEL_STAGES = ["Novo contato", "Em conversa", "Aula experimental agendada", "Proposta enviada", "Convertido"] as const;
export const PRIOR_STEPS = ["contact", "trial", "proposal"] as const;
export type PriorStep = typeof PRIOR_STEPS[number];
export type ConfirmationChoice = { happened: false } | { happened: true; occurredAt: string };
export interface StepEvidence { contact: boolean; trial: boolean; proposal: boolean }
export interface StageConfirmationEvent { id: string; event_type: string; status: string; payload?: Record<string, unknown> | null }
const STEP_STAGE: Record<PriorStep, number> = { contact: 1, trial: 2, proposal: 3 };

/** Profile fields and current stage are never proof that an event actually happened. */
export function stageEvidence(lead: Lead, interactions: { type: string }[], events: StageConfirmationEvent[]): StepEvidence {
  const completed = events.filter((e) => e.status === "completed");
  const confirmed = (step: PriorStep) => completed.some((e) => e.event_type === "lead.stage_confirmed" && e.payload?.step === step);
  return {
    contact: Boolean(lead.contacted_at || interactions.some((i) => ["whatsapp", "call", "email", "meeting", "other"].includes(i.type)) || completed.some((e) => e.event_type === "lead.interaction") || confirmed("contact")),
    trial: Boolean(lead.trial_scheduled_at || lead.trial_calendar_event_id || completed.some((e) => e.event_type === "lead.trial_scheduled") || confirmed("trial")),
    proposal: completed.some((e) => e.event_type === "lead.proposal_recorded") || confirmed("proposal"),
  };
}
export function missingPriorSteps(currentStage: string, targetStage: string, evidence: StepEvidence): PriorStep[] {
  const from = FUNNEL_STAGES.findIndex((s) => s === currentStage), to = FUNNEL_STAGES.findIndex((s) => s === targetStage);
  if (from < 0 || to <= from) return [];
  return PRIOR_STEPS.filter((step) => STEP_STAGE[step] < to && !evidence[step]);
}
export function validateConfirmationDate(value: string, now = new Date()): "dateRequired" | "dateInvalid" | "dateFuture" | null {
  if (!value) return "dateRequired";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "dateInvalid";
  return time > now.getTime() ? "dateFuture" : null;
}
export const confirmationKey = (teacherId: string, leadId: string, step: PriorStep) => `lead-stage-confirmed:${teacherId}:${leadId}:${step}`;
export function confirmedChoices(steps: PriorStep[], choices: Partial<Record<PriorStep, ConfirmationChoice>>): { step: PriorStep; occurredAt: string }[] {
  return steps.flatMap((step) => { const choice = choices[step]; if (!choice) throw new Error("choice_required"); if (!choice.happened) return []; const issue = validateConfirmationDate(choice.occurredAt); if (issue) throw new Error(issue); return [{ step, occurredAt: new Date(choice.occurredAt).toISOString() }]; });
}
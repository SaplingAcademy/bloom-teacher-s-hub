import { describe, expect, test } from "bun:test";
import { isAutoLeadTaskRelevant, trialFeedbackEligibleAt } from "../src/lib/lead-task-relevance";

const now = new Date("2026-11-10T12:00:00Z");
const lead = (stage: string, extra: Record<string, string | null> = {}) => ({ stage, contacted_at: null, trial_scheduled_at: null, ...extra });

describe("automatic lead tasks follow the lead's funnel stage", () => {
  test("first contact only while the lead is a new, uncontacted contact", () => {
    expect(isAutoLeadTaskRelevant("lead.created", "follow_up", lead("Novo contato"), now)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.created", "follow_up", lead("Novo contato", { contacted_at: "2026-11-01" }), now)).toBe(false);
    expect(isAutoLeadTaskRelevant("lead.created", "follow_up", lead("Em conversa"), now)).toBe(false);
    expect(isAutoLeadTaskRelevant("lead.created", "follow_up", lead("Aula experimental agendada"), now)).toBe(false);
  });

  test("trial confirmation only before the trial; feedback after it, until the lead moves on", () => {
    const upcoming = lead("Aula experimental agendada", { trial_scheduled_at: "2026-11-12T15:00:00Z" });
    const past = lead("Aula experimental agendada", { trial_scheduled_at: "2026-11-08T15:00:00Z" });
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "whatsapp", upcoming, now)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "whatsapp", past, now)).toBe(false);
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "follow_up", past, now)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "follow_up", lead("Proposta enviada"), now)).toBe(false);
  });

  test("proposal follow-up only while the proposal is the current step", () => {
    expect(isAutoLeadTaskRelevant("lead.proposal_recorded", "follow_up", lead("Proposta enviada"), now)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.proposal_recorded", "follow_up", lead("Convertido"), now)).toBe(false);
  });

  test("closed leads drop prospecting automation; inactivity re-contact stays while open", () => {
    for (const type of ["lead.created", "lead.trial_scheduled", "lead.proposal_recorded", "lead.inactive"]) {
      expect(isAutoLeadTaskRelevant(type, "follow_up", lead("Convertido"), now)).toBe(false);
      expect(isAutoLeadTaskRelevant(type, "follow_up", lead("Perdido"), now)).toBe(false);
    }
    expect(isAutoLeadTaskRelevant("lead.inactive", "follow_up", lead("Proposta enviada"), now)).toBe(true);
  });

  test("unknown event, missing lead or unknown stage never hides a task", () => {
    expect(isAutoLeadTaskRelevant(undefined, "follow_up", lead("Convertido"), now)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.created", "follow_up", null, now)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "whatsapp", lead("Etapa personalizada"), now)).toBe(true);
  });
  test("trial feedback waits for the linked event's real end and skips cancelled trials", () => {
    const stage = lead("Aula experimental agendada", { trial_scheduled_at: "2026-11-10T19:00:00", trial_calendar_event_id: "cal-1" });
    const event = { date: "2026-11-10", end_time: "20:00:00", status: "Scheduled" };
    const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00`);
    // Fixed 18:00 due date no longer matters: before the 20:00 end there is no cobrança.
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "follow_up", stage, at("18:30"), event)).toBe(false);
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "follow_up", stage, at("20:00"), event)).toBe(true);
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "follow_up", stage, at("21:00"), { ...event, status: "Cancelled" })).toBe(false);
    // Rescheduled to a later day: the linked event's new date governs.
    expect(isAutoLeadTaskRelevant("lead.trial_scheduled", "follow_up", stage, at("21:00"), { ...event, date: "2026-11-12" })).toBe(false);
  });

  test("missing trial data never invents an hour", () => {
    const stage = lead("Aula experimental agendada", { trial_scheduled_at: "2026-11-10T09:00:00" });
    // Event without end_time → end of that day.
    expect(trialFeedbackEligibleAt(stage, { date: "2026-11-10", end_time: null })).toEqual(new Date("2026-11-10T23:59:59"));
    // No linked event → end of the trial_scheduled_at day.
    expect(trialFeedbackEligibleAt(stage, null)).toEqual(new Date("2026-11-10T23:59:59"));
    // Nothing known → no extra gate (the task's own due date applies).
    expect(trialFeedbackEligibleAt(lead("Aula experimental agendada"), null)).toBeNull();
  });
});

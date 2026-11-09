import { describe, expect, test } from "bun:test";
import { isAutoLeadTaskRelevant } from "../src/lib/lead-task-relevance";

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
});

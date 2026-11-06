import { describe, expect, it } from "vitest";
import { confirmationKey, confirmedChoices, missingPriorSteps, stageEvidence, validateConfirmationDate } from "../src/lib/lead-stage-confirmation";
import { mergeLeadTimeline } from "../src/lib/lead-interactions";
import type { Lead } from "../src/lib/automation-engine";
const lead: Lead = { id: "lead", teacher_id: "teacher", full_name: "Júlia", stage: "Novo contato", level: "A1", package_id: "pkg", potential_value: 500 };
const absent = { contact: false, trial: false, proposal: false };
describe("Earlier lead step confirmation", () => {
  it("asks first contact before jumping to trial scheduling", () => expect(missingPriorSteps("Novo contato", "Aula experimental agendada", absent)).toEqual(["contact"]));
  it("asks each missing earlier step individually before proposal/conversion", () => {
    expect(missingPriorSteps("Novo contato", "Proposta enviada", absent)).toEqual(["contact", "trial"]);
    expect(missingPriorSteps("Novo contato", "Convertido", absent)).toEqual(["contact", "trial", "proposal"]);
  });
  it("does not treat stage or profile/commercial fields as proof of prior events", () => {
    expect(stageEvidence({ ...lead, stage: "Proposta enviada" }, [], [])).toEqual(absent);
    expect(missingPriorSteps("Proposta enviada", "Convertido", absent)).toEqual(["contact", "trial", "proposal"]);
  });
  it("does not prompt on same-stage updates, backward changes, loss or unknown stages", () => {
    for (const [from, to] of [["Proposta enviada", "Proposta enviada"], ["Proposta enviada", "Aula experimental agendada"], ["Novo contato", "Perdido"], ["Primeiro Registro", "Nivelamento concluído"]]) expect(missingPriorSteps(from, to, absent)).toEqual([]);
  });
  it("first contact requires real effective interaction or canonical dates/event", () => {
    expect(stageEvidence(lead, [{ type: "note" }], []).contact).toBe(false);
    expect(stageEvidence(lead, [{ type: "call" }], []).contact).toBe(true);
    expect(stageEvidence({ ...lead, contacted_at: "2026-11-01T14:30:00Z" }, [], []).contact).toBe(true);
  });
  it("uses actual trial records and completed proposal events only", () => {
    expect(stageEvidence({ ...lead, trial_scheduled_at: "2026-11-01T14:30:00Z" }, [], []).trial).toBe(true);
    expect(stageEvidence(lead, [], [{ id: "e", event_type: "lead.proposal_recorded", status: "failed" }]).proposal).toBe(false);
    expect(stageEvidence(lead, [], [{ id: "e", event_type: "lead.proposal_recorded", status: "completed" }]).proposal).toBe(true);
  });
  it("recognizes explicit earlier confirmations so they are not asked again", () => {
    const evidence = stageEvidence(lead, [], [{ id: "e", event_type: "lead.stage_confirmed", status: "completed", payload: { step: "trial" } }]);
    expect(missingPriorSteps("Novo contato", "Convertido", evidence)).toEqual(["contact", "proposal"]);
  });
  it("No does not create a fact or date, while Yes requires the supplied real date", () => {
    expect(confirmedChoices(["contact", "trial"], { contact: { happened: false }, trial: { happened: true, occurredAt: "2026-11-01T14:30:00Z" } })).toEqual([{ step: "trial", occurredAt: "2026-11-01T14:30:00.000Z" }]);
    expect(confirmedChoices(["contact"], { contact: { happened: false } })).toEqual([]);
    expect(() => confirmedChoices(["contact"], { contact: { happened: true, occurredAt: "" } })).toThrow("dateRequired");
  });
  it("does not auto-answer an intermediate step", () => expect(() => confirmedChoices(["contact", "trial"], { contact: { happened: false } })).toThrow("choice_required"));
  it("rejects future, invalid or absent real dates", () => {
    const now = new Date("2026-11-06T02:00:00Z");
    expect(validateConfirmationDate("", now)).toBe("dateRequired"); expect(validateConfirmationDate("invalid", now)).toBe("dateInvalid"); expect(validateConfirmationDate("2026-11-06T02:01:00Z", now)).toBe("dateFuture"); expect(validateConfirmationDate("2026-11-01T14:30:00Z", now)).toBeNull();
  });
  it("uses stable owner/lead/step identities, not retry dates", () => {
    expect(confirmationKey("teacher", "lead", "contact")).toBe("lead-stage-confirmed:teacher:lead:contact"); expect(confirmationKey("other", "lead", "contact")).not.toBe(confirmationKey("teacher", "lead", "contact"));
  });
  it("shows confirmed prior events as manual history at the supplied factual date", () => {
    const timeline = mergeLeadTimeline([], [{ id: "e", teacher_id: "teacher", action_type: "manual_stage_confirmation", description: "Confirmed proposal", created_at: "2026-11-01T14:30:00Z" }]);
    expect(timeline[0]).toEqual({ kind: "confirmation", id: "a-e", description: "Confirmed proposal", at: "2026-11-01T14:30:00Z" });
  });
});
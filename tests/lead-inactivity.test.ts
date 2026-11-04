import { describe, expect, it } from "vitest";
import { canCreateInactivityTask, inactivityCycleKey, inactivityPeriodDays, inactivityReference, isInactiveLead, type InactivityLead } from "../src/lib/lead-inactivity";

const now = new Date("2026-11-04T12:00:00Z");
const lead: InactivityLead = {
  id: "lead", teacher_id: "teacher", full_name: "Lead", stage: "Em conversa",
  created_at: "2026-10-01T12:00:00Z", last_interaction_at: "2026-10-25T12:00:00Z",
};

describe("Rule E commercial inactivity", () => {
  it("uses the configured period, inclusive at the exact contact anniversary", () => {
    expect(isInactiveLead(lead, 10, now)).toBe(true);
    expect(isInactiveLead(lead, 11, now)).toBe(false);
    expect(isInactiveLead(lead, 10, new Date("2026-11-04T11:59:59Z"))).toBe(false);
  });
  it("uses created_at only in the absence of commercial contact", () => {
    expect(inactivityReference({ ...lead, last_interaction_at: null })?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(inactivityReference({ ...lead, last_interaction_at: "invalid" })).toBeNull();
  });
  it("internal notes/profile edits cannot reset the period or cycle", () => {
    const edited = { ...lead, updated_at: now.toISOString(), notes: "Internal note" };
    expect(isInactiveLead(edited, 10, now)).toBe(true);
    expect(inactivityCycleKey(edited)).toBe(inactivityCycleKey(lead));
  });
  it("real contact resets the period and opens a different inactivity cycle", () => {
    const contacted = { ...lead, last_interaction_at: now.toISOString() };
    expect(isInactiveLead(contacted, 10, now)).toBe(false);
    expect(inactivityCycleKey(contacted)).not.toBe(inactivityCycleKey(lead));
  });
  it.each(["Convertido", "won", "Perdido", "lost"])("excludes closed stage %s", (stage) => {
    expect(isInactiveLead({ ...lead, stage }, 7, now)).toBe(false);
  });
  it("old inactive leads stay visible but cannot get retroactive activation tasks", () => {
    expect(isInactiveLead(lead, 7, now)).toBe(true);
    expect(canCreateInactivityTask(lead, 7, now, now.toISOString())).toBe(false);
    expect(canCreateInactivityTask(lead, 10, now, "2026-11-01T12:00:00Z")).toBe(true);
  });
  it("cycle keys are stable across periods/days and isolate teachers", () => {
    expect(inactivityCycleKey(lead)).toBe("inactive-lead:teacher:lead:2026-10-25T12:00:00.000Z");
    expect(inactivityCycleKey({ ...lead, teacher_id: "other" })).not.toBe(inactivityCycleKey(lead));
  });
  it.each([0, -1, null, undefined, "7", 1.5])("rejects invalid settings instead of silently assuming seven days (%s)", (value) => {
    expect(() => inactivityPeriodDays(value)).toThrow();
  });
});
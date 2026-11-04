import { describe, expect, it } from "vitest";
import { buildLeadProfilePatch, leadToProfileDraft, validateLeadProfileDraft } from "@/lib/lead-profile";
import type { Lead } from "@/lib/automation-engine";

const base: Lead = {
  id: "l1",
  teacher_id: "t1",
  full_name: "Ana",
  stage: "Novo contato",
  level: "lvl_b1",
  tags: ["vip"],
  potential_value: 300,
};

describe("lead profile", () => {
  it("does not invent defaults for empty pedagogical fields", () => {
    const d = leadToProfileDraft({ id: "x", teacher_id: "t", full_name: "B", stage: "Novo contato" });
    expect([d.language_studied, d.level, d.focus, d.modality, d.potential_value]).toEqual(["", "", "", "", ""]);
  });
  it("unchanged draft produces an empty patch", () => {
    expect(buildLeadProfilePatch(base, leadToProfileDraft(base))).toEqual({});
  });
  it("sends only changed fields and saves stable catalog IDs", () => {
    const d = { ...leadToProfileDraft(base), focus: "focus_business" };
    expect(buildLeadProfilePatch(base, d)).toEqual({ focus: "focus_business" });
  });
  it("cleared fields persist as null", () => {
    const d = { ...leadToProfileDraft(base), level: "", tags: "", potential_value: "" };
    expect(buildLeadProfilePatch(base, d)).toEqual({ level: null, tags: null, potential_value: null });
  });
  it("keeps an archived/historical catalog value untouched when not edited", () => {
    const lead = { ...base, modality: "Presencial legado" };
    const d = { ...leadToProfileDraft(lead), campaign: "Black Friday" };
    expect(buildLeadProfilePatch(lead, d)).toEqual({ campaign: "Black Friday" });
  });
  it("requires a name and a valid value", () => {
    expect(validateLeadProfileDraft({ ...leadToProfileDraft(base), full_name: " " })).toBe("nameRequired");
    expect(validateLeadProfileDraft({ ...leadToProfileDraft(base), potential_value: "abc" })).toBe("invalidValue");
  });
});

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

import { buildNewLeadInsert, emptyLeadProfileDraft, leadPedagogyParts } from "@/lib/lead-profile";

describe("new lead and card display", () => {
  const resolve = {
    language: (v: string) => (v === "English" ? "Inglês" : v),
    catalog: (_c: string, v: string) => (v === "lvl_b1" ? "Intermediário" : null),
  };
  it("new lead preselects no pedagogical value and saves blanks as null", () => {
    const row = buildNewLeadInsert("t1", { ...emptyLeadProfileDraft(), full_name: " Ana " });
    expect(row).toMatchObject({ full_name: "Ana", language_studied: null, level: null, focus: null, modality: null, tags: null, potential_value: null, stage: "Novo contato" });
  });
  it("new lead saves selected stable IDs", () => {
    const row = buildNewLeadInsert("t1", { ...emptyLeadProfileDraft(), full_name: "A", level: "lvl_b1", modality: "mod_online" });
    expect(row.level).toBe("lvl_b1");
    expect(row.modality).toBe("mod_online");
  });
  it("cards omit empty fields instead of showing Inglês/A1", () => {
    expect(leadPedagogyParts({}, resolve as any)).toEqual([]);
  });
  it("cards resolve custom labels and keep unknown historical values", () => {
    expect(leadPedagogyParts({ language_studied: "English", level: "lvl_b1", focus: "Legado" }, resolve as any)).toEqual(["Inglês", "Intermediário", "Legado"]);
  });
});

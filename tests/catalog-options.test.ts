import { describe, expect, it } from "vitest";
import {
  CatalogValidationError,
  getActiveCatalogOptions,
  getDefaultCatalogOptions,
  normalizeCatalogOptions,
  resolveCatalogLabel,
  resolveCatalogValue,
  resolveModalityNature,
  sortCatalogOptions,
  toCatalogSelectionId,
  validateCatalogOptions,
} from "../src/lib/catalog-options";

describe("pedagogical catalog defaults and empty selections", () => {
  it("supplies stable CEFR IDs and the three modality natures for empty settings", () => {
    for (const raw of [undefined, null, {}]) {
      const catalog = normalizeCatalogOptions(raw);
      expect(catalog.levels.map((option) => option.id)).toEqual(["a1", "a2", "b1", "b2", "c1", "c2"]);
      expect(catalog.focuses.find((option) => option.id === "general")?.label).toBe("General English");
      expect(catalog.modalities.map((option) => [option.id, option.nature])).toEqual([
        ["online", "online"], ["in_person", "in_person"], ["hybrid", "hybrid"],
      ]);
    }
  });

  it("never infers A1, General or Online for NULL, empty or whitespace fields", () => {
    const catalog = getDefaultCatalogOptions();
    for (const category of ["levels", "focuses", "modalities"] as const) {
      for (const value of [undefined, null, "", "   "]) {
        expect(resolveCatalogValue(catalog, category, value)).toBeNull();
        expect(resolveCatalogLabel(catalog, category, value)).toBeNull();
        expect(toCatalogSelectionId(catalog, category, value)).toBeNull();
      }
    }
    expect(resolveModalityNature(catalog, null)).toBeNull();
  });

  it("keeps explicitly empty categories empty rather than adding choices", () => {
    const catalog = normalizeCatalogOptions({ levels: [], focuses: [], modalities: [] });
    expect(catalog).toEqual({ levels: [], focuses: [], modalities: [] });
    const partial = normalizeCatalogOptions({ levels: [] });
    expect(partial.levels).toEqual([]);
    expect(partial.modalities.map((option) => option.id)).toEqual(["online", "in_person", "hybrid"]);
  });

  it("does not share mutable defaults between teachers", () => {
    const one = getDefaultCatalogOptions();
    const first = one.levels[0];
    if (first) first.label = "Changed";
    one.modalities.length = 0;
    expect(getDefaultCatalogOptions().levels[0]?.label).toBe("A1");
    expect(getDefaultCatalogOptions().modalities).toHaveLength(3);
  });
});

describe("stable IDs, renaming and inactive options", () => {
  it("resolves a renamed label for both the ID and its historical alias without changing the ID", () => {
    const raw = { levels: [{ id: "a1", label: "Beginner", active: true, order: 1 }] };
    const catalog = normalizeCatalogOptions(raw);
    expect(catalog.levels[0]?.id).toBe("a1");
    expect(resolveCatalogLabel(catalog, "levels", "a1")).toBe("Beginner");
    expect(resolveCatalogLabel(catalog, "levels", "A1")).toBe("Beginner");
    expect(raw.levels[0]?.label).toBe("Beginner");
    expect(toCatalogSelectionId(catalog, "levels", "a1")).toBe("a1");
  });

  it("preserves a teacher-created ID and explicit aliases through repeated renames", () => {
    const raw = { focuses: [{ id: "teacher-option-73", label: "Speaking", aliases: ["Old custom focus"], active: true, order: 4 }] };
    const before = JSON.stringify(raw);
    const first = normalizeCatalogOptions(raw);
    const renamed = normalizeCatalogOptions({ focuses: first.focuses.map((option) => ({ ...option, label: "Oral fluency" })) });
    expect(renamed.focuses[0]?.id).toBe("teacher-option-73");
    expect(resolveCatalogLabel(renamed, "focuses", "teacher-option-73")).toBe("Oral fluency");
    expect(resolveCatalogValue(renamed, "focuses", "Old custom focus")?.id).toBe("teacher-option-73");
    expect(JSON.stringify(raw)).toBe(before);
    expect(resolveCatalogLabel(renamed, "focuses", "Speaking")).toBe("Speaking");
  });

  it("excludes inactive choices from new selections while retaining existing ID and alias display", () => {
    const catalog = normalizeCatalogOptions({ focuses: [{ id: "business", label: "Professional English", active: false, order: 1 }] });
    expect(getActiveCatalogOptions(catalog, "focuses")).toEqual([]);
    expect(resolveCatalogValue(catalog, "focuses", "business")?.option?.active).toBe(false);
    expect(resolveCatalogLabel(catalog, "focuses", "business")).toBe("Professional English");
    expect(resolveCatalogLabel(catalog, "focuses", "Business English")).toBe("Professional English");
    expect(() => toCatalogSelectionId(catalog, "focuses", "business")).toThrow();
  });

  it("accepts only active IDs for new records, never labels or historical aliases", () => {
    const catalog = getDefaultCatalogOptions();
    expect(toCatalogSelectionId(catalog, "levels", "a1")).toBe("a1");
    expect(toCatalogSelectionId(catalog, "focuses", "general")).toBe("general");
    expect(toCatalogSelectionId(catalog, "modalities", "online")).toBe("online");
    for (const [category, label] of [["levels", "A1"], ["focuses", "General English"], ["modalities", "Online"]] as const) {
      expect(() => toCatalogSelectionId(catalog, category, label)).toThrow();
    }
  });
});

describe("historical and unknown values", () => {
  it.each([
    ["levels", "A1", "a1"], ["levels", "C2", "c2"],
    ["focuses", "General", "general"], ["focuses", "General English", "general"],
    ["focuses", "Business", "business"], ["focuses", "Business English", "business"],
    ["modalities", "Online", "online"], ["modalities", "In person", "in_person"],
  ] as const)("recognizes the historical %s value %s as %s", (category, value, id) => {
    const catalog = getDefaultCatalogOptions();
    expect(resolveCatalogValue(catalog, category, value)).toMatchObject({ value, id, isLegacy: true });
  });

  it("matches aliases case-insensitively without changing the literal input", () => {
    const resolved = resolveCatalogValue(getDefaultCatalogOptions(), "focuses", "  BUSINESS English  ");
    expect(resolved).toMatchObject({ value: "  BUSINESS English  ", id: "business", label: "Business English" });
  });

  it("preserves unknown historical text literally, including surrounding spaces", () => {
    const catalog = getDefaultCatalogOptions();
    for (const category of ["levels", "focuses", "modalities"] as const) {
      const text = "  Inglês Instrumental 2024  ";
      expect(resolveCatalogValue(catalog, category, text)).toMatchObject({ value: text, id: null, label: text, option: null });
    }
    expect(resolveModalityNature(catalog, "Custom unknown mode")).toBeNull();
  });

  it("treats prototype property names as literal unknown values and valid custom IDs", () => {
    const catalog = normalizeCatalogOptions({ focuses: [{ id: "constructor", label: "Custom course" }] });
    expect(resolveCatalogLabel(catalog, "focuses", "constructor")).toBe("Custom course");
    expect(resolveCatalogValue(catalog, "levels", "toString")).toMatchObject({ id: null, label: "toString" });
    expect(resolveCatalogValue(catalog, "modalities", "__proto__")).toMatchObject({ id: null, label: "__proto__" });
  });

  it("keeps historical built-ins readable when omitted from a customized category", () => {
    const catalog = normalizeCatalogOptions({ focuses: [] });
    expect(resolveCatalogValue(catalog, "focuses", "Business")).toMatchObject({ id: "business", label: "Business English", isHistoricalDefault: true });
    expect(getActiveCatalogOptions(catalog, "focuses")).toEqual([]);
    expect(() => toCatalogSelectionId(catalog, "focuses", "business")).toThrow();
  });

  it("uses configured nature for a renamed or inactive modality and known historical nature only", () => {
    const catalog = normalizeCatalogOptions({ modalities: [
      { id: "online", label: "Video room", nature: "online", active: false, order: 1 },
      { id: "local-visit", label: "Visit", nature: "in_person", active: true, order: 2 },
      { id: "mixed-course", label: "Mixed", nature: "hybrid", active: true, order: 3 },
    ] });
    expect(resolveModalityNature(catalog, "Online")).toBe("online");
    expect(resolveModalityNature(catalog, "local-visit")).toBe("in_person");
    expect(resolveModalityNature(catalog, "mixed-course")).toBe("hybrid");
    expect(resolveModalityNature(catalog, "In person")).toBe("in_person");
    expect(resolveModalityNature(catalog, "Video room")).toBeNull();
    expect(resolveModalityNature(catalog, "Private")).toBeNull();
    expect(resolveModalityNature(catalog, "Group")).toBeNull();
  });
});

describe("catalog normalization, validation and ordering", () => {
  it("fills only omitted option metadata and orders stably without mutating input", () => {
    const raw = { levels: [
      { id: "second", label: " Second ", order: 20 },
      { id: "first", label: "First", order: 10, active: false },
      { id: "tied", label: "Tied", order: 20 },
    ] };
    const before = JSON.stringify(raw);
    const result = normalizeCatalogOptions(raw);
    expect(result.levels.map((option) => option.id)).toEqual(["first", "second", "tied"]);
    expect(result.levels[1]).toMatchObject({ id: "second", label: "Second", active: true, order: 20 });
    expect(result.levels[0]?.active).toBe(false);
    expect(JSON.stringify(raw)).toBe(before);
    expect(sortCatalogOptions(result.levels)).not.toBe(result.levels);
    expect(normalizeCatalogOptions({ focuses: [{ id: "custom", label: "Custom" }] }).focuses[0]?.order).toBe(1);
  });

  it.each([
    ["wrong root", []],
    ["wrong category", { levels: null }],
    ["missing ID", { levels: [{ label: "A1" }] }],
    ["empty label", { focuses: [{ id: "x", label: " " }] }],
    ["ID whitespace", { focuses: [{ id: " x ", label: "X" }] }],
    ["wrong active type", { levels: [{ id: "x", label: "X", active: "false" }] }],
    ["non-finite order", { levels: [{ id: "x", label: "X", order: NaN }] }],
    ["missing nature", { modalities: [{ id: "custom", label: "Custom" }] }],
    ["unknown nature", { modalities: [{ id: "custom", label: "Custom", nature: "remote" }] }],
    ["wrong aliases", { focuses: [{ id: "x", label: "X", aliases: [null] }] }],
  ])("reports %s instead of silently substituting defaults", (_name, raw) => {
    expect(validateCatalogOptions(raw).length).toBeGreaterThan(0);
    expect(() => normalizeCatalogOptions(raw)).toThrow(CatalogValidationError);
  });

  it("rejects duplicate IDs and ambiguous aliases rather than redirecting history", () => {
    expect(validateCatalogOptions({ levels: [{ id: "a1", label: "One" }, { id: "a1", label: "Two" }] }))
      .toContainEqual({ path: "levels.1.id", code: "duplicate_id" });
    expect(validateCatalogOptions({ focuses: [{ id: "custom", label: "Custom", aliases: ["Business"] }] }))
      .toContainEqual({ path: "focuses.0", code: "ambiguous_alias" });
    expect(validateCatalogOptions({ focuses: [
      { id: "first", label: "First", aliases: ["Previous"] },
      { id: "second", label: "Second", aliases: ["previous"] },
    ] })).toContainEqual({ path: "focuses.1", code: "ambiguous_alias" });
  });
});
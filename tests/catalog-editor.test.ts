import { describe, expect, it } from "vitest";
import { CatalogValidationError, getActiveCatalogOptions, getDefaultCatalogOptions, normalizeCatalogOptions, resolveCatalogLabel } from "../src/lib/catalog-options";
import { addCatalogOption, moveCatalogOption, prepareCatalogForSave, removeCatalogOption, renameCatalogOption, restoreCatalogOption, setCatalogModalityNature, setCatalogOptionActive } from "../src/lib/catalog-editor";

describe("teaching options editing", () => {
  it("renames without changing stable IDs or historical aliases", () => {
    const before = normalizeCatalogOptions({ levels: [{ id: "custom-level", label: "Old", aliases: ["Legacy"], active: true, order: 1 }] });
    const after = renameCatalogOption(before, "levels", "custom-level", "New");
    expect(after.levels[0]).toEqual({ id: "custom-level", label: "New", aliases: ["Legacy"], active: true, order: 1 });
    expect(before.levels[0]?.label).toBe("Old");
  });

  it("deactivates and reactivates without physical deletion", () => {
    const before = getDefaultCatalogOptions();
    const inactive = setCatalogOptionActive(before, "focuses", "general", false);
    expect(inactive.focuses).toHaveLength(10);
    expect(inactive.focuses[0]).toMatchObject({ id: "general", active: false });
    expect(setCatalogOptionActive(inactive, "focuses", "general", true)).toEqual(before);
    expect(before.focuses[0]?.active).toBe(true);
  });

  it("reorders only the selected group and persists the order independently of IDs", () => {
    const before = getDefaultCatalogOptions();
    const reordered = moveCatalogOption(before, "levels", "a2", -1);
    expect(reordered.levels.map((option) => option.id)).toEqual(["a2", "a1", "b1", "b2", "c1", "c2"]);
    expect(reordered.levels.map((option) => option.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(reordered.focuses).toEqual(before.focuses);
    expect(prepareCatalogForSave(reordered).levels[0]?.id).toBe("a2");
    expect(moveCatalogOption(reordered, "levels", "a2", 1)).toEqual(before);
  });

  it("does not move beyond group boundaries", () => {
    const before = getDefaultCatalogOptions();
    expect(moveCatalogOption(before, "levels", "a1", -1)).toBe(before);
    expect(moveCatalogOption(before, "levels", "c2", 1)).toBe(before);
  });

  it("adds a teacher option without replacing defaults and retains the generated ID after rename", () => {
    const before = getDefaultCatalogOptions();
    const added = addCatalogOption(before, "focuses", "generated-123", "  Speaking  ");
    expect(added.focuses).toHaveLength(11);
    expect(added.focuses[10]).toEqual({ id: "generated-123", label: "Speaking", active: true, order: 11 });
    expect(renameCatalogOption(added, "focuses", "generated-123", "Fluency").focuses[10]?.id).toBe("generated-123");
    expect(before.focuses).toHaveLength(10);
  });

  it("rejects duplicate IDs on addition and before persistence", () => {
    const before = getDefaultCatalogOptions();
    expect(() => addCatalogOption(before, "levels", "a1", "Duplicate")).toThrow(CatalogValidationError);
    expect(() => prepareCatalogForSave({ ...before, levels: [...before.levels, { id: "a1", label: "Duplicate", active: true, order: 7 }] })).toThrow(CatalogValidationError);
  });

  it("rejects empty and whitespace-only names for both additions and edits", () => {
    const before = getDefaultCatalogOptions();
    for (const label of ["", "   "]) {
      expect(() => addCatalogOption(before, "levels", "new-id", label)).toThrow(CatalogValidationError);
      expect(() => prepareCatalogForSave(renameCatalogOption(before, "levels", "a1", label))).toThrow(CatalogValidationError);
    }
  });

  it("allows a valid addition while an unrelated rename is unfinished, but blocks saving that draft", () => {
    const draft = renameCatalogOption(getDefaultCatalogOptions(), "levels", "a1", "");
    const added = addCatalogOption(draft, "focuses", "speaking-id", "Speaking");
    expect(added.levels[0]?.label).toBe("");
    expect(added.focuses[10]?.id).toBe("speaking-id");
    expect(() => prepareCatalogForSave(added)).toThrow(CatalogValidationError);
  });

  it("requires explicit nature for additions and keeps nature independent of modality label", () => {
    const before = getDefaultCatalogOptions();
    expect(() => addCatalogOption(before, "modalities", "visit", "Visit")).toThrow(CatalogValidationError);
    const added = addCatalogOption(before, "modalities", "visit", "Visit", "in_person");
    const renamed = renameCatalogOption(added, "modalities", "visit", "Virtual-sounding name");
    expect(renamed.modalities[3]).toMatchObject({ id: "visit", label: "Virtual-sounding name", nature: "in_person" });
    expect(setCatalogModalityNature(renamed, "visit", "hybrid").modalities[3]).toMatchObject({ id: "visit", label: "Virtual-sounding name", nature: "hybrid" });
  });

  it("saves a complete catalog on first customization without losing untouched default options", () => {
    for (const empty of [null, {}]) {
      const first = prepareCatalogForSave(renameCatalogOption(normalizeCatalogOptions(empty), "levels", "a1", "Beginner"));
      expect(first.levels).toHaveLength(6);
      expect(first.focuses).toHaveLength(10);
      expect(first.modalities).toHaveLength(3);
      expect(first.levels[1]?.label).toBe("A2");
      expect(first.modalities.map((option) => option.nature)).toEqual(["online", "in_person", "hybrid"]);
    }
  });

  it("keeps teacher drafts isolated", () => {
    const first = renameCatalogOption(normalizeCatalogOptions({}), "levels", "a1", "Teacher one");
    const second = normalizeCatalogOptions({});
    expect(prepareCatalogForSave(first).levels[0]?.label).toBe("Teacher one");
    expect(second.levels[0]?.label).toBe("A1");
  });

  it.each([["levels", "a1"], ["focuses", "general"], ["modalities", "online"]] as const)("permanently removes an unused %s option without reintroducing it after normalization", (category, id) => {
    const before = getDefaultCatalogOptions();
    const removed = prepareCatalogForSave(removeCatalogOption(before, category, id, false));
    expect(removed[category].some((option) => option.id === id)).toBe(false);
    expect(normalizeCatalogOptions(JSON.parse(JSON.stringify(removed)))[category].some((option) => option.id === id)).toBe(false);
    expect(before[category].some((option) => option.id === id)).toBe(true);
  });

  it.each([["levels", "a1"], ["focuses", "general"], ["modalities", "online"]] as const)("archives a used %s option with its existing ID and metadata", (category, id) => {
    const before = getDefaultCatalogOptions();
    const previous = before[category].find((option) => option.id === id);
    const archived = prepareCatalogForSave(removeCatalogOption(before, category, id, true));
    expect(archived[category].find((option) => option.id === id)).toEqual({ ...previous, active: false });
    expect(getActiveCatalogOptions(archived, category).some((option) => option.id === id)).toBe(false);
    expect(resolveCatalogLabel(archived, category, id)).toBe(previous?.label);
    expect(normalizeCatalogOptions(JSON.parse(JSON.stringify(archived)))[category].find((option) => option.id === id)?.active).toBe(false);
  });

  it("recovers the same archived option without duplicate IDs, even on repeat recovery", () => {
    const before = getDefaultCatalogOptions();
    const archived = removeCatalogOption(before, "modalities", "online", true);
    const restored = restoreCatalogOption(archived, "modalities", "online");
    expect(restored).toEqual(before);
    expect(restoreCatalogOption(restored, "modalities", "online").modalities.filter((option) => option.id === "online")).toHaveLength(1);
    expect(restored.modalities[0]?.nature).toBe("online");
  });

  it("does not restore or remove unknown IDs", () => {
    const before = getDefaultCatalogOptions();
    expect(() => restoreCatalogOption(before, "levels", "missing")).toThrow();
    expect(() => removeCatalogOption(before, "levels", "missing", false)).toThrow();
  });

  it("reorders visible active options without using hidden inactive entries as neighbors", () => {
    const before = setCatalogOptionActive(getDefaultCatalogOptions(), "levels", "a2", false);
    const moved = moveCatalogOption(before, "levels", "a1", 1);
    expect(getActiveCatalogOptions(moved, "levels").map((option) => option.id)).toEqual(["b1", "a1", "b2", "c1", "c2"]);
    expect(moved.levels.find((option) => option.id === "a2")?.active).toBe(false);
    expect(moved.levels).toHaveLength(6);
  });
});
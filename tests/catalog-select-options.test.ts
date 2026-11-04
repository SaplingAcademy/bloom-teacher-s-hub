import { describe, expect, it } from "vitest";
import {
  getCatalogSelectOptions,
  getDefaultCatalogOptions,
  type CatalogOptions,
} from "@/lib/catalog-options";

function customCatalog(): CatalogOptions {
  const catalog = getDefaultCatalogOptions();
  return {
    ...catalog,
    levels: [
      { id: "starter", label: "Iniciante", active: true, order: 1 },
      { id: "fluent", label: "Fluente", active: true, order: 2 },
      { id: "b1", label: "B1", active: false, order: 3 },
    ],
  };
}

describe("getCatalogSelectOptions", () => {
  it("lists only active options in configured order for new records", () => {
    const options = getCatalogSelectOptions(customCatalog(), "levels", "");
    expect(options.map((o) => o.id)).toEqual(["starter", "fluent"]);
    expect(options.every((o) => !o.isHistorical)).toBe(true);
  });

  it("treats null and blank current values as empty", () => {
    expect(getCatalogSelectOptions(customCatalog(), "levels", null)).toHaveLength(2);
    expect(getCatalogSelectOptions(customCatalog(), "levels", "   ")).toHaveLength(2);
  });

  it("does not duplicate the current value when it is an active option", () => {
    const options = getCatalogSelectOptions(customCatalog(), "levels", "fluent");
    expect(options.map((o) => o.id)).toEqual(["starter", "fluent"]);
  });

  it("keeps an archived option visible with its current label", () => {
    const options = getCatalogSelectOptions(customCatalog(), "levels", "b1");
    const historical = options.find((o) => o.id === "b1");
    expect(historical).toEqual({ id: "b1", label: "B1", isHistorical: true });
  });

  it("reflects a renamed label for a stored stable ID", () => {
    const catalog = customCatalog();
    catalog.levels[0] = { ...catalog.levels[0], label: "Iniciante Total" };
    const options = getCatalogSelectOptions(catalog, "levels", "starter");
    expect(options.find((o) => o.id === "starter")?.label).toBe("Iniciante Total");
  });

  it("resolves historical default labels for removed built-ins", () => {
    const catalog = customCatalog(); // no "a1" configured at all
    const options = getCatalogSelectOptions(catalog, "levels", "A1");
    const historical = options.find((o) => o.id === "A1");
    expect(historical).toEqual({ id: "A1", label: "A1", isHistorical: true });
  });

  it("keeps unrecognized legacy literals visible under their raw value", () => {
    const options = getCatalogSelectOptions(customCatalog(), "focuses", "Old Custom Focus");
    const historical = options.find((o) => o.id === "Old Custom Focus");
    expect(historical).toEqual({
      id: "Old Custom Focus",
      label: "Old Custom Focus",
      isHistorical: true,
    });
  });

  it("resolves historical aliases to the configured option label", () => {
    const options = getCatalogSelectOptions(getDefaultCatalogOptions(), "focuses", "General English");
    // "General English" is an alias of the active "general" option: no extra entry.
    expect(options.some((o) => o.isHistorical && o.id === "General English")).toBe(true);
    const historical = options.find((o) => o.id === "General English");
    expect(historical?.label).toBe("General English");
  });

  it("includes modality options with their labels", () => {
    const options = getCatalogSelectOptions(getDefaultCatalogOptions(), "modalities", "");
    expect(options.map((o) => o.id)).toEqual(["online", "in_person", "hybrid"]);
  });
});

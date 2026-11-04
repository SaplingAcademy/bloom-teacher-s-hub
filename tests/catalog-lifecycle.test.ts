import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultCatalogOptions, normalizeCatalogOptions, type CatalogOptions } from "../src/lib/catalog-options";

const db = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), usage: vi.fn(), writes: [] as Record<string, unknown>[], filters: [] as [string, unknown][], raw: {} as unknown, writeError: null as unknown, conflict: false }));
vi.mock("../src/lib/supabase", () => ({ supabase: { auth: { getUser: db.getUser }, from: db.from } }));
vi.mock("../src/lib/catalog-usage", () => ({ hasCatalogOptionUsage: db.usage }));
import { changeCatalogOptionLifecycle } from "../src/lib/catalog-settings";

describe("catalog removal and recovery persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks(); db.writes.length = 0; db.filters.length = 0; db.writeError = null; db.conflict = false;
    db.raw = getDefaultCatalogOptions();
    db.getUser.mockResolvedValue({ data: { user: { id: "teacher-one" } }, error: null });
    db.usage.mockResolvedValue(false);
    db.from.mockImplementation((table: string) => {
      expect(table).toBe("settings");
      let writing = false;
      let patch: { catalog_options: CatalogOptions } | undefined;
      const query = {
        select: (selection: string) => { expect(selection).toBe("catalog_options"); return query; },
        eq: (field: string, value: unknown) => { db.filters.push([field, value]); return query; },
        is: (field: string, value: unknown) => { db.filters.push([field, value]); return query; },
        update: (payload: { catalog_options: CatalogOptions }) => { writing = true; patch = payload; db.writes.push(payload); return query; },
        maybeSingle: async () => {
          if (!writing) return { data: { catalog_options: db.raw }, error: null };
          if (db.writeError) return { data: null, error: db.writeError };
          if (db.conflict) return { data: null, error: null };
          if (patch) db.raw = structuredClone(patch.catalog_options);
          return { data: { catalog_options: db.raw }, error: null };
        },
      };
      return query;
    });
  });

  it.each([["levels", "a1"], ["focuses", "general"], ["modalities", "online"]] as const)("immediately persists unused %s removal in only catalog_options", async (category, id) => {
    const before = getDefaultCatalogOptions();
    const result = await changeCatalogOptionLifecycle("teacher-one", before, category, id, "remove");
    expect(result.action).toBe("removed");
    expect(result.catalog[category].some((entry) => entry.id === id)).toBe(false);
    expect(normalizeCatalogOptions(db.raw)[category].some((entry) => entry.id === id)).toBe(false);
    expect(db.writes).toHaveLength(1);
    expect(Object.keys(db.writes[0] ?? {})).toEqual(["catalog_options"]);
    expect(db.usage).toHaveBeenCalledWith("teacher-one", before, category, id);
    expect(db.filters).toContainEqual(["teacher_id", "teacher-one"]);
    expect(db.filters).toContainEqual(["catalog_options", JSON.stringify(before)]);
  });

  it("archives a used option, preserving metadata and historical aliases on readback", async () => {
    const before = normalizeCatalogOptions({ modalities: [{ id: "custom-room", label: "Room", aliases: ["Original room"], nature: "hybrid", active: true, order: 4 }] });
    db.raw = before; db.usage.mockResolvedValue(true);
    const result = await changeCatalogOptionLifecycle("teacher-one", before, "modalities", "custom-room", "remove");
    expect(result.action).toBe("archived");
    expect(normalizeCatalogOptions(db.raw).modalities[0]).toEqual({ ...before.modalities[0], active: false });
  });

  it("restores the existing ID and persists recovery without repeating usage reads", async () => {
    const before = getDefaultCatalogOptions(); before.levels = before.levels.map((entry) => ({ ...entry, active: entry.id !== "a1" })); db.raw = before;
    const result = await changeCatalogOptionLifecycle("teacher-one", before, "levels", "a1", "restore");
    expect(result.action).toBe("restored");
    expect(result.catalog.levels.find((entry) => entry.id === "a1")?.active).toBe(true);
    expect(result.catalog.levels.filter((entry) => entry.id === "a1")).toHaveLength(1);
    expect(db.usage).not.toHaveBeenCalled();
  });

  it("does not write when historical usage cannot be checked", async () => {
    db.usage.mockRejectedValue(new Error("usage unavailable"));
    await expect(changeCatalogOptionLifecycle("teacher-one", getDefaultCatalogOptions(), "levels", "a1", "remove")).rejects.toThrow("usage unavailable");
    expect(db.writes).toHaveLength(0);
  });

  it("does not write a first-account catalog after switching accounts", async () => {
    db.getUser.mockResolvedValueOnce({ data: { user: { id: "teacher-one" } }, error: null }).mockResolvedValueOnce({ data: { user: { id: "teacher-two" } }, error: null });
    await expect(changeCatalogOptionLifecycle("teacher-one", getDefaultCatalogOptions(), "levels", "a1", "remove")).rejects.toMatchObject({ reason: "authentication" });
    expect(db.writes).toHaveLength(0);
  });

  it("rejects another window's changed catalog before checking usage or overwriting it", async () => {
    const changed = getDefaultCatalogOptions(); const first = changed.levels[0]; if (first) first.label = "Other window"; db.raw = changed;
    await expect(changeCatalogOptionLifecycle("teacher-one", getDefaultCatalogOptions(), "levels", "a1", "remove")).rejects.toMatchObject({ reason: "changed" });
    expect(db.usage).not.toHaveBeenCalled(); expect(db.writes).toHaveLength(0);
  });

  it("does not report success when compare-and-set finds a concurrently changed catalog", async () => {
    db.conflict = true;
    await expect(changeCatalogOptionLifecycle("teacher-one", getDefaultCatalogOptions(), "levels", "a1", "remove")).rejects.toMatchObject({ reason: "changed" });
    expect(normalizeCatalogOptions(db.raw).levels.some((entry) => entry.id === "a1")).toBe(true);
  });

  it("propagates failed persistence while leaving the option present", async () => {
    db.writeError = new Error("write failed");
    await expect(changeCatalogOptionLifecycle("teacher-one", getDefaultCatalogOptions(), "levels", "a1", "remove")).rejects.toThrow("write failed");
    expect(normalizeCatalogOptions(db.raw).levels.some((entry) => entry.id === "a1")).toBe(true);
  });

  it("persists the complete normalized default catalog on a first deletion from empty settings", async () => {
    db.raw = null;
    const result = await changeCatalogOptionLifecycle("teacher-one", getDefaultCatalogOptions(), "levels", "a1", "remove");
    expect(db.filters).toContainEqual(["catalog_options", null]);
    expect(result.catalog.levels).toHaveLength(5);
    expect(result.catalog.focuses).toHaveLength(10);
    expect(result.catalog.modalities).toHaveLength(3);
  });
});
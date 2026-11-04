import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultCatalogOptions, normalizeCatalogOptions } from "../src/lib/catalog-options";

const db = vi.hoisted(() => ({ from: vi.fn(), calls: [] as { table: string; selection: string; teacher: string; cursor?: string }[], pages: {} as Record<string, Record<string, { data: unknown; error: unknown }>> }));
vi.mock("../src/lib/supabase", () => ({ supabase: { from: db.from } }));
import { CATALOG_USAGE_SOURCES, hasCatalogOptionUsage, matchesCatalogUsage } from "../src/lib/catalog-usage";

describe("teacher-scoped historical catalog usage", () => {
  beforeEach(() => {
    db.calls.length = 0;
    db.pages = {};
    db.from.mockReset();
    db.from.mockImplementation((table: string) => {
      const call = { table, selection: "", teacher: "", cursor: undefined as string | undefined };
      const query = {
        select: (selection: string) => { call.selection = selection; return query; },
        eq: (field: string, teacher: string) => { expect(field).toBe("teacher_id"); call.teacher = teacher; return query; },
        order: (field: string, config: unknown) => { expect(field).toBe("id"); expect(config).toEqual({ ascending: true }); return query; },
        limit: (size: number) => { expect(size).toBe(200); return query; },
        gt: (field: string, cursor: string) => { expect(field).toBe("id"); call.cursor = cursor; return query; },
        returns: async () => { db.calls.push({ ...call }); return db.pages[table]?.[call.cursor ?? "start"] ?? { data: [], error: null }; },
      };
      return query;
    });
  });

  it.each([
    ["levels", "a1", "A1"], ["focuses", "business", "Business"], ["modalities", "in_person", "In person"],
  ] as const)("counts the %s stable ID and its historical alias as usage", (category, id, legacy) => {
    const catalog = getDefaultCatalogOptions();
    expect(matchesCatalogUsage(catalog, category, id, id)).toBe(true);
    expect(matchesCatalogUsage(catalog, category, id, legacy)).toBe(true);
    expect(matchesCatalogUsage(catalog, category, id, null)).toBe(false);
    expect(matchesCatalogUsage(catalog, category, id, "Unrelated")).toBe(false);
  });

  it("counts custom aliases and conservatively treats an identical legacy display label as used", () => {
    const catalog = normalizeCatalogOptions({ focuses: [{ id: "teacher-focus", label: "Current name", aliases: ["Old name"] }] });
    expect(matchesCatalogUsage(catalog, "focuses", "teacher-focus", "Old name")).toBe(true);
    expect(matchesCatalogUsage(catalog, "focuses", "teacher-focus", "  CURRENT NAME ")).toBe(true);
  });

  it("includes retained historical sources without status or date exclusions and only this teacher", async () => {
    expect(await hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "levels", "a1")).toBe(false);
    expect(db.calls.map((call) => call.table)).toEqual(["students", "leads", "calendar_events", "classes", "lessons", "resources"]);
    expect(db.calls.every((call) => call.teacher === "teacher-one" && call.selection === "id,level")).toBe(true);
  });

  it("includes students.modality and canonical event delivery_mode but never students.type", async () => {
    await hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "modalities", "online");
    expect(db.calls.map((call) => [call.table, call.selection])).toEqual([["students", "id,modality"], ["leads", "id,modality"], ["calendar_events", "id,delivery_mode"]]);
    expect(CATALOG_USAGE_SOURCES.modalities.some((source) => source.field === "type")).toBe(false);
  });

  it("finds usage beyond a short first page instead of assuming the API returned all rows", async () => {
    db.pages.students = {
      start: { data: [{ id: "001", level: "B2" }], error: null },
      "001": { data: [{ id: "002", level: "A1" }], error: null },
    };
    expect(await hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "levels", "a1")).toBe(true);
    expect(db.calls).toContainEqual({ table: "students", selection: "id,level", teacher: "teacher-one", cursor: "001" });
  });

  it("requires every relevant read to succeed rather than treating failed reads as unused", async () => {
    const error = new Error("historical read denied");
    db.pages.classes = { start: { data: null, error } };
    await expect(hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "levels", "a1")).rejects.toBe(error);
  });

  it("fails closed if a later page fails", async () => {
    db.pages.leads = { start: { data: [{ id: "001", focus: "Other" }], error: null }, "001": { data: null, error: new Error("page failed") } };
    await expect(hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "focuses", "business")).rejects.toThrow("page failed");
  });

  it.each([null, [{ id: "001" }], [{ id: "001", level: 4 }]])("rejects incomplete or malformed historical reads", async (data) => {
    db.pages.students = { start: { data, error: null } };
    await expect(hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "levels", "a1")).rejects.toThrow();
  });

  it("rejects a nonadvancing page rather than silently truncating history", async () => {
    db.pages.students = { start: { data: [{ id: "001", level: "B2" }], error: null }, "001": { data: [{ id: "001", level: "B2" }], error: null } };
    await expect(hasCatalogOptionUsage("teacher-one", getDefaultCatalogOptions(), "levels", "a1")).rejects.toThrow("pagination");
  });
});
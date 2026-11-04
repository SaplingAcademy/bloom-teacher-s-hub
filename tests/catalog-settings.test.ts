import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultCatalogOptions, normalizeCatalogOptions, type CatalogOptions } from "../src/lib/catalog-options";
import { renameCatalogOption } from "../src/lib/catalog-editor";

const db = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn() }));
vi.mock("../src/lib/supabase", () => ({ supabase: { auth: { getUser: db.getUser }, from: db.from } }));
import { CatalogSettingsError, saveCatalogSettings } from "../src/lib/catalog-settings";

describe("authenticated teacher catalog persistence", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.getUser.mockResolvedValue({ data: { user: { id: "teacher-one" } }, error: null });
    db.from.mockReturnValue({ update: db.update });
    db.update.mockReturnValue({ eq: db.eq });
    db.eq.mockReturnValue({ select: db.select });
    db.select.mockReturnValue({ maybeSingle: db.maybeSingle });
    db.maybeSingle.mockResolvedValue({ data: { catalog_options: getDefaultCatalogOptions() }, error: null });
  });

  it("writes only the complete catalog for the authenticated teacher and reads persisted values back", async () => {
    const submitted = renameCatalogOption(getDefaultCatalogOptions(), "levels", "a1", "  Beginner  ");
    const normalized = normalizeCatalogOptions(submitted);
    const existing = { working_availability: { monday: ["09:00"] }, lesson_count_presets: [12], catalog_options: {} as unknown };
    db.update.mockImplementation((patch: { catalog_options: CatalogOptions }) => {
      Object.assign(existing, patch);
      return { eq: db.eq };
    });
    db.maybeSingle.mockImplementation(async () => ({ data: { catalog_options: existing.catalog_options }, error: null }));
    expect(await saveCatalogSettings("teacher-one", submitted)).toEqual(normalized);
    expect(db.from).toHaveBeenCalledWith("settings");
    expect(db.update).toHaveBeenCalledWith({ catalog_options: normalized });
    expect(db.eq).toHaveBeenCalledWith("teacher_id", "teacher-one");
    expect(db.select).toHaveBeenCalledWith("catalog_options");
    expect(existing.working_availability).toEqual({ monday: ["09:00"] });
    expect(existing.lesson_count_presets).toEqual([12]);
    expect(normalized.focuses).toHaveLength(10);
    expect(normalized.modalities).toHaveLength(3);
  });

  it("uses the authenticated teacher's scope for a second account", async () => {
    db.getUser.mockResolvedValue({ data: { user: { id: "teacher-two" } }, error: null });
    await saveCatalogSettings("teacher-two", getDefaultCatalogOptions());
    expect(db.eq).toHaveBeenCalledWith("teacher_id", "teacher-two");
    expect(db.eq).not.toHaveBeenCalledWith("teacher_id", "teacher-one");
  });

  it("blocks a stale first-account draft after account switch", async () => {
    db.getUser.mockResolvedValue({ data: { user: { id: "teacher-two" } }, error: null });
    await expect(saveCatalogSettings("teacher-one", getDefaultCatalogOptions())).rejects.toMatchObject({ reason: "authentication" });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("blocks signed-out saves", async () => {
    db.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(saveCatalogSettings("teacher-one", getDefaultCatalogOptions())).rejects.toBeInstanceOf(CatalogSettingsError);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("propagates authentication errors without attempting a write", async () => {
    const error = new Error("session expired");
    db.getUser.mockResolvedValue({ data: { user: null }, error });
    await expect(saveCatalogSettings("teacher-one", getDefaultCatalogOptions())).rejects.toBe(error);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("blocks blank names and duplicate IDs before any database write", async () => {
    const before = getDefaultCatalogOptions();
    const blank = renameCatalogOption(before, "levels", "a1", " ");
    const duplicate = { ...before, levels: [...before.levels, { id: "a1", label: "Repeated", active: true, order: 7 }] };
    for (const invalid of [blank, duplicate]) await expect(saveCatalogSettings("teacher-one", invalid)).rejects.toThrow("Invalid pedagogical catalog");
    expect(db.update).not.toHaveBeenCalled();
  });

  it("propagates failed writes without returning local success or mutating the draft", async () => {
    const draft = getDefaultCatalogOptions();
    const before = JSON.stringify(draft);
    const error = new Error("write denied");
    db.maybeSingle.mockResolvedValue({ data: null, error });
    await expect(saveCatalogSettings("teacher-one", draft)).rejects.toBe(error);
    expect(JSON.stringify(draft)).toBe(before);
  });

  it("fails explicitly when no settings row is updated rather than creating a partial row", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(saveCatalogSettings("teacher-one", getDefaultCatalogOptions())).rejects.toMatchObject({ reason: "missing_settings" });
    expect(db.from).toHaveBeenCalledTimes(1);
  });

  it("does not convert missing or invalid returned catalog data into a successful default save", async () => {
    db.maybeSingle.mockResolvedValue({ data: { catalog_options: null }, error: null });
    await expect(saveCatalogSettings("teacher-one", getDefaultCatalogOptions())).rejects.toMatchObject({ reason: "missing_settings" });
    db.maybeSingle.mockResolvedValue({ data: { catalog_options: { levels: [{ id: "x", label: "" }] } }, error: null });
    await expect(saveCatalogSettings("teacher-one", getDefaultCatalogOptions())).rejects.toThrow("Invalid pedagogical catalog");
  });
});
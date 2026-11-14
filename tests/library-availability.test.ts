import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: () => ({ select: (cols: string) => { mocks.select(cols); return { order: () => ({ range: async () => ({ data: [{ resource_id: "admin-invoice", access_level: "pro", availability: "soon" }], error: null }) }) }; } }),
  },
}));
import {
  fetchLibraryClassifications, isLibrarySoonError, parseLibraryClassifications, resourceAvailability, setLibraryAvailability, setLibraryClassification,
} from "../src/lib/library-access";

beforeEach(() => vi.clearAllMocks());

describe("Library availability (SOON)", () => {
  it("reads availability with the classification, independent of Free/Premium", async () => {
    expect(await fetchLibraryClassifications()).toEqual([{ resource_id: "admin-invoice", access_level: "pro", availability: "soon" }]);
    expect(mocks.select).toHaveBeenCalledWith("resource_id, access_level, availability");
  });
  it("is unknown before a successful read and available for unlisted resources", () => {
    expect(resourceAvailability("x", undefined)).toBeNull();
    expect(resourceAvailability("x", [])).toBe("available");
    expect(resourceAvailability("x", [{ resource_id: "x", access_level: "free", availability: "soon" }])).toBe("soon");
  });
  it("accepts older replies without availability but rejects invalid values", () => {
    expect(parseLibraryClassifications([{ resource_id: "a", access_level: "free" }])[0].availability).toBe("available");
    expect(() => parseLibraryClassifications([{ resource_id: "a", access_level: "free", availability: "later" }])).toThrow();
    expect(() => parseLibraryClassifications([{ resource_id: "a", access_level: "free", availability: null }])).toThrow();
  });
  it("saves availability only through the admin RPC and confirms the saved row", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ resource_id: "admin-invoice", access_level: "pro", availability: "soon" }], error: null });
    expect(await setLibraryAvailability("admin-invoice", "soon")).toMatchObject({ access_level: "pro", availability: "soon" });
    expect(mocks.rpc).toHaveBeenCalledWith("set_library_resource_availability", { _resource_id: "admin-invoice", _availability: "soon" });
    mocks.rpc.mockResolvedValueOnce({ data: [{ resource_id: "admin-invoice", access_level: "pro", availability: "available" }], error: null });
    await expect(setLibraryAvailability("admin-invoice", "soon")).rejects.toThrow("LIBRARY_SAVE_READBACK_FAILED");
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("ADMIN_ONLY") });
    await expect(setLibraryAvailability("admin-invoice", "soon")).rejects.toThrow("ADMIN_ONLY");
  });
  it("keeps the Free/Premium save working with the existing RPC reply shape", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ resource_id: "admin-invoice", access_level: "free" }], error: null });
    expect(await setLibraryClassification("admin-invoice", "free")).toMatchObject({ access_level: "free" });
    expect(mocks.rpc).toHaveBeenCalledWith("set_library_resource_access", { _resource_id: "admin-invoice", _access_level: "free" });
  });
  it("recognizes the server SOON refusal", () => {
    expect(isLibrarySoonError(new Error("LIBRARY_RESOURCE_SOON"))).toBe(true);
    expect(isLibrarySoonError(new Error("LIBRARY_PREMIUM_REQUIRED"))).toBe(false);
  });
});

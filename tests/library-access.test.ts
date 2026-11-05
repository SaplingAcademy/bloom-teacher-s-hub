import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { canUseLibraryResource, parseLibraryClassifications, resourceAccessLevel } from "@/lib/library-access";
import { LIBRARY_CATALOG, librarySourceId } from "@/lib/library-catalog";

describe("Library classifications", () => {
  it("all 23 existing resources start Free when no classifications have been changed", () => {
    expect(LIBRARY_CATALOG).toHaveLength(23);
    for (const resource of LIBRARY_CATALOG) expect(resourceAccessLevel(resource.id, [])).toBe("free");
  });
  it("new resource IDs default to Free only after a successful read", () => {
    expect(resourceAccessLevel("future-resource", [])).toBe("free");
    expect(resourceAccessLevel("future-resource", undefined)).toBeNull();
  });
  it("preserves each persisted classification", () => {
    expect(resourceAccessLevel("admin-invoice", [{ resource_id: "admin-invoice", access_level: "pro" }])).toBe("pro");
  });
  it("Free resources work independently of the plan read", () => {
    expect(canUseLibraryResource("free", null, false)).toBe(true);
  });
  it("Free teachers cannot use Premium resources", () => {
    expect(canUseLibraryResource("pro", "free", false)).toBe(false);
  });
  it("Pro and super admins access Premium even when admin plan is Free", () => {
    expect(canUseLibraryResource("pro", "pro", false)).toBe(true);
    expect(canUseLibraryResource("pro", "free", true)).toBe(true);
  });
  it("unknown permissions never grant Free/unknown-plan Premium access", () => {
    expect(canUseLibraryResource(null, "free", false)).toBe(false);
    expect(canUseLibraryResource("pro", null, false)).toBe(false);
  });
  it("invalid classification responses do not become Free", () => {
    expect(() => parseLibraryClassifications(null)).toThrow();
    expect(() => parseLibraryClassifications([{ resource_id: "admin-invoice", access_level: null }])).toThrow();
  });
  it("nested and legacy copies inherit their original Premium resource ID", () => {
    expect(librarySourceId("admin-invoice-copy-123-copy-456")).toBe("admin-invoice");
    expect(librarySourceId("ped-progress-report")).toBe("ped-progress-report");
  });
});
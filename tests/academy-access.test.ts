import { describe, expect, it } from "vitest";
import { ACADEMY_PUBLISHED, canEnterAcademy } from "@/lib/academy-access";
import { canAccessAcademy } from "@/lib/plans";

describe("Academy development access", () => {
  it("keeps Academy unpublished", () => {
    expect(ACADEMY_PUBLISHED).toBe(false);
  });
  it("does not release internal Academy to Free teachers", () => {
    expect(canEnterAcademy("free", false)).toBe(false);
  });
  it("does not release internal Academy to Pro teachers during development", () => {
    expect(canAccessAcademy("pro", false)).toBe(true);
    expect(canEnterAcademy("pro", false)).toBe(false);
  });
  it("grants super_admin access independently of the plan and publication", () => {
    expect(canEnterAcademy("free", true)).toBe(true);
    expect(canEnterAcademy("pro", true)).toBe(true);
    expect(canEnterAcademy(null, true)).toBe(true);
  });
  it("allows Pro entitlement after publication without changing the role rule", () => {
    expect(canEnterAcademy("pro", false, true)).toBe(true);
    expect(canEnterAcademy("free", false, true)).toBe(false);
  });
  it("never grants access from unknown plan or role", () => {
    expect(canEnterAcademy(null, false)).toBe(false);
    expect(canEnterAcademy(null, false, true)).toBe(false);
  });
});
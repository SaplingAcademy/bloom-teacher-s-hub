import { describe, expect, it } from "vitest";
import { getTopNav, isNavItemActive, navSections, topNavPrimary } from "../src/lib/navigation";

describe("top navigation", () => {
  it("shows every section exactly once (bar or 'Mais'), nothing removed", () => {
    const { primary, more } = getTopNav();
    const ids = [...primary.map((p) => p.item.id), ...more.map((i) => i.id)];
    const all = navSections.flatMap((s) => s.items.map((i) => i.id));
    expect([...ids].sort()).toEqual([...all].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the frequency order and per-breakpoint visibility of the main sections", () => {
    const { primary, more } = getTopNav();
    expect(primary.map((p) => p.item.id)).toEqual(topNavPrimary.map((p) => p.id));
    expect(primary.filter((p) => p.showFrom === "md").map((p) => p.item.id)).toEqual(["today", "calendar", "students", "leads"]);
    expect(more.map((i) => i.id)).toEqual(["workspaceHub", "growth", "academy", "marketplace"]);
    expect(more.find((i) => i.id === "marketplace")?.disabled).toBe(true);
  });

  it("uses the same active rule as before", () => {
    const byId = Object.fromEntries(navSections.flatMap((s) => s.items).map((i) => [i.id, i]));
    expect(isNavItemActive(byId.today, "/")).toBe(true);
    expect(isNavItemActive(byId.today, "/students")).toBe(false);
    expect(isNavItemActive(byId.students, "/students/abc")).toBe(true);
    expect(isNavItemActive(byId.marketplace, "/marketplace")).toBe(false);
  });
});

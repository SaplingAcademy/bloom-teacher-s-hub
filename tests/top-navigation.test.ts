import { describe, expect, it } from "vitest";
import { getNavGroups, isNavItemActive, navSections } from "../src/lib/navigation";

describe("top navigation (mega menu groups)", () => {
  it("shows every module exactly once, nothing removed", () => {
    const ids = getNavGroups().flatMap((g) => g.items.map((i) => i.id));
    const all = navSections.flatMap((s) => s.items.map((i) => i.id));
    expect([...ids].sort()).toEqual([...all].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("distributes the modules in the three requested columns, in order", () => {
    expect(getNavGroups().map((g) => [g.id, g.items.map((i) => i.id)])).toEqual([
      ["management", ["today", "calendar", "students", "leads"]],
      ["business", ["finance", "growth", "workspaceHub"]],
      ["resources", ["resources", "community", "academy", "marketplace"]],
    ]);
  });

  it("never drops a module missing from the groups (appended to the last column)", () => {
    const extra = { id: "extra", label: "Extra", to: "/extra", icon: navSections[0].items[0].icon, description: "" };
    const groups = getNavGroups([...navSections, { id: "x", label: "X", items: [extra] }]);
    expect(groups.at(-1)!.items.at(-1)!.id).toBe("extra");
  });

  it("uses the same active rule as before", () => {
    const byId = Object.fromEntries(navSections.flatMap((s) => s.items).map((i) => [i.id, i]));
    expect(isNavItemActive(byId.today, "/")).toBe(true);
    expect(isNavItemActive(byId.today, "/students")).toBe(false);
    expect(isNavItemActive(byId.students, "/students/abc")).toBe(true);
    expect(isNavItemActive(byId.marketplace, "/marketplace")).toBe(false);
  });
});

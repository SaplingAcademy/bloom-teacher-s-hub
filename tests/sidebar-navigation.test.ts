import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { accountNav, allNavItems, bottomNav, navSections } from "../src/lib/navigation";

const workspaceItems = navSections.find((s) => s.id === "workspace")!.items;
const workspaceIds = workspaceItems.map((i) => i.id);
const workspacePaths = workspaceItems.map((i) => i.to);

// Sidebar entries live in src/lib/navigation.ts and feed the desktop
// (expanded + collapsed) and the mobile drawer from one shared list.
const ROUTE_FILES: Record<string, string> = {
  "/": "_app.index.tsx",
  "/students": "_app.students.tsx",
  "/leads": "_app.leads.tsx",
  "/calendar": "_app.calendar.tsx",
  "/resources": "_app.resources.tsx",
  "/finance": "_app.finance.tsx",
  "/workspace": "_app.workspace.tsx",
  "/growth": "_app.growth.tsx",
  "/academy": "_app.academy.tsx",
  "/community": "_app.community.tsx",
  "/profile": "_app.profile.tsx",
  "/settings": "_app.settings.tsx",
};

describe("sidebar navigation after the Aulas tab was removed", () => {
  it("no longer lists the Aulas/Lessons entry", () => {
    expect(workspaceIds).not.toContain("lessons");
    expect(workspacePaths).not.toContain("/lessons");
    expect(allNavItems.map((i) => i.to)).not.toContain("/lessons");
  });

  it("keeps Bloom Academy right after Growth, unchanged", () => {
    expect(workspaceIds.indexOf("academy")).toBe(workspaceIds.indexOf("growth") + 1);
    const academy = workspaceItems.find((i) => i.id === "academy")!;
    expect(academy.to).toBe("/academy");
    expect((academy.icon as { displayName?: string }).displayName).toBe("GraduationCap");
  });

  it("keeps every remaining entry unique, labelled and routed", () => {
    expect(new Set(workspacePaths).size).toBe(workspacePaths.length);
    for (const item of workspaceItems) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.to.startsWith("/")).toBe(true);
      expect((item.icon as { displayName?: string }).displayName?.length).toBeGreaterThan(0);
    }
  });

  it("still resolves every remaining menu entry to its existing page", () => {
    for (const [path, file] of Object.entries(ROUTE_FILES)) {
      expect(existsSync(resolve("src/routes", file)), `missing page for ${path}`).toBe(true);
    }
  });

  it("keeps the old Aulas page reachable for internal links", () => {
    expect(existsSync(resolve("src/routes", "_app.lessons.tsx"))).toBe(true);
  });

  it("moves Profile and Settings from the sidebar rows to the account block, keeping their routes", () => {
    const sidebarRows = [...navSections.flatMap((s) => s.items), ...bottomNav].map((i) => i.to);
    expect(sidebarRows).not.toContain("/profile");
    expect(sidebarRows).not.toContain("/settings");
    expect(accountNav.map((i) => [i.id, i.to])).toEqual([["profile", "/profile"], ["settings", "/settings"]]);
    expect(allNavItems.map((i) => i.to)).toEqual(expect.arrayContaining(["/profile", "/settings"]));
  });
});

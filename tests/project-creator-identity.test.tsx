// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// useAuth().profile is the raw public.profiles row (full_name, avatar_url), not { name, photo }.
const auth = vi.hoisted(() => ({ value: { user: { id: "t1", email: "mariana@escola.com" }, profile: { id: "t1", full_name: "Mariana Albuquerque", avatar_url: null } as Record<string, unknown> } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => auth.value }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
import { useTeacherIdentity } from "../src/components/layout/TeacherAvatar";
import { ProjectSummary, projectCreator } from "../src/components/bloom/workspace/ProjectSummary";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
let root: Root;
function Harness({ ownerId }: { ownerId: string }) {
  const identity = useTeacherIdentity();
  return createElement(ProjectSummary, {
    project: { start_date: "2026-11-03", end_date: null }, progress: { done: 0, total: 0, percent: 0 }, pending: false,
    creator: projectCreator(ownerId, auth.value.user.id, identity), onSaveDates: async () => true,
  });
}
const mount = (ownerId = "t1") => act(async () => root.render(createElement(Harness, { ownerId })));
const text = () => document.body.textContent ?? "";

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  auth.value.profile = { id: "t1", full_name: "Mariana Albuquerque", avatar_url: null };
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("project summary creator", () => {
  it("shows the owner's real name from profiles.full_name with initials when there is no photo", async () => {
    await mount();
    expect(text()).toContain("Mariana Albuquerque");
    expect(text()).toContain("MA");
    expect(text()).not.toContain("workspace.project.summary.unnamed");
    expect(document.querySelector('[data-testid="project-summary"] img')).toBeNull();
  });
  it("shows the real profile photo from avatar_url", async () => {
    auth.value.profile = { id: "t1", full_name: "Mariana Albuquerque", avatar_url: "https://example.test/mariana.png" };
    await mount();
    expect(document.querySelector('[data-testid="project-summary"] img')!.getAttribute("src")).toBe("https://example.test/mariana.png");
  });
  it("uses the neutral label only when no name exists and for projects of another owner", async () => {
    auth.value.profile = { id: "t1", full_name: null, avatar_url: null };
    await mount();
    // Same rule as the header: no saved name (and e-mail-derived names are never used) → neutral label.
    expect(text()).toContain("workspace.project.summary.unnamed");
    await act(async () => root.unmount());
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await mount("someone-else");
    expect(text()).toContain("workspace.project.summary.unnamed");
  });
});

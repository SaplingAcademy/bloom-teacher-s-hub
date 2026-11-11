// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/",
  lang: "pt",
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (opts: { select: (s: { location: { pathname: string } }) => unknown }) =>
    opts.select({ location: { pathname: mocks.pathname } }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) =>
    createElement("a", { href: to, ...rest }, children),
}));

vi.mock("@/hooks/use-plan", () => ({ usePlan: () => ({ isSuperAdmin: false }) }));
// The sidebar account block (SidebarAccountMenu → useTeacherIdentity) reads the signed-in teacher.
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { email: "ana@escola.com" }, profile: { full_name: "Ana Lima", avatar_url: null }, signOut: vi.fn() }),
}));

const PT: Record<string, string> = {
  "nav.workspace": "Workspace",
  "nav.communitySection": "Comunidade",
  "nav.today": "Visão Geral",
  "nav.students": "Alunos",
  "nav.leads": "Leads",
  "nav.calendar": "Agenda",
  "nav.resources": "Biblioteca",
  "nav.finance": "Financeiro",
  "nav.workspaceHub": "Workspace",
  "nav.growth": "Crescimento",
  "academy.nav": "Bloom Academy",
  "nav.community": "Feed",
  "nav.marketplace": "Marketplace",
  "nav.soon": "Em breve",
  "nav.profile": "Perfil",
  "nav.settings": "Configurações",
  "nav.askBloomAi": "Perguntar à Bloom AI",
  "sidebarAccount.menu": "Menu da conta",
  "sidebarAccount.myProfile": "Meu perfil",
  "sidebarAccount.settings": "Configurações",
};

const EN: Record<string, string> = {
  "academy.nav": "Bloom Academy",
  "nav.soon": "Soon",
  "nav.askBloomAi": "Ask Bloom AI",
  "sidebarAccount.menu": "Account menu",
  "sidebarAccount.myProfile": "My profile",
  "sidebarAccount.settings": "Settings",
};

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({
    lang: mocks.lang,
    t: (key: string, fallback?: string) =>
      mocks.lang === "pt" ? PT[key] ?? fallback ?? key : EN[key] ?? fallback ?? key,
  }),
}));

import { AppSidebar } from "../src/components/layout/AppSidebar";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

function renderSidebar(props: { isMobile?: boolean; isPinned?: boolean } = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mountedRoot = root;
  act(() => mountedRoot.render(createElement(AppSidebar, props)));
  return container;
}

function cleanup() {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
}

function navLinks(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
}

/**
 * Since the sidebar account block (PR #19), "Perfil"/"Configurações" live in its popover menu,
 * rendered in a portal on document.body. Open it so the original checks see every destination.
 */
function openAccountMenu(container: HTMLElement) {
  const trigger = container.querySelector<HTMLButtonElement>("aside button[aria-haspopup='dialog']");
  if (!trigger) throw new Error("account menu trigger not found");
  act(() => trigger.click());
  return document.body;
}

beforeEach(() => {
  mocks.pathname = "/";
  mocks.lang = "pt";
});

afterEach(cleanup);

describe("AppSidebar without the Aulas entry", () => {
  it("drops Aulas from the expanded menu in PT while keeping the rest", () => {
    const c = openAccountMenu(renderSidebar({ isMobile: true }));
    const text = c.textContent ?? "";
    expect(text).not.toContain("Aulas");
    expect(text).not.toContain("Lessons");
    for (const label of ["Visão Geral", "Alunos", "Leads", "Agenda", "Biblioteca", "Financeiro", "Crescimento", "Bloom Academy", "Comunidade", "Feed", "Meu perfil", "Configurações"]) {
      expect(text, `missing ${label}`).toContain(label);
    }
  });

  it("drops Lessons from the expanded menu in EN", () => {
    mocks.lang = "en";
    const c = openAccountMenu(renderSidebar({ isMobile: true }));
    const text = c.textContent ?? "";
    expect(text).not.toContain("Lessons");
    expect(text).not.toContain("Aulas");
    for (const label of ["Overview", "Students", "Leads", "Calendar", "Resources", "Finance", "Growth", "Bloom Academy", "Community", "Feed", "My profile", "Settings"]) {
      expect(text, `missing ${label}`).toContain(label);
    }
  });

  it("never links to /lessons and keeps every other destination", () => {
    const c = openAccountMenu(renderSidebar({ isMobile: true }));
    const hrefs = navLinks(c);
    expect(hrefs).not.toContain("/lessons");
    expect(hrefs).toEqual([
      "/", "/students", "/leads", "/calendar", "/resources", "/finance",
      "/workspace", "/growth", "/academy", "/community", "/profile", "/settings",
    ]);
  });

  it("keeps the same destinations when collapsed, with no visible labels", () => {
    const c = renderSidebar({ isMobile: false, isPinned: false });
    const text = c.textContent ?? "";
    expect(text).not.toContain("Aulas");
    expect(text).not.toContain("Lessons");
    const libraryLabel = c.querySelector('a[href="/resources"] > span');
    expect(libraryLabel?.getAttribute("aria-hidden")).toBe("true");
    // Opening the account menu keeps the sidebar expanded, so it is opened only after the
    // collapsed-label check.
    expect(navLinks(openAccountMenu(c))).toEqual([
      "/", "/students", "/leads", "/calendar", "/resources", "/finance",
      "/workspace", "/growth", "/academy", "/community", "/profile", "/settings",
    ]);
  });
});

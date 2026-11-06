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

const PT: Record<string, string> = {
  "nav.workspace": "Workspace",
  "nav.communitySection": "Comunidade",
  "nav.today": "Hoje",
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
};

const EN: Record<string, string> = {
  "academy.nav": "Bloom Academy",
  "nav.soon": "Soon",
  "nav.askBloomAi": "Ask Bloom AI",
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
  act(() => root!.render(createElement(AppSidebar, props)));
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

beforeEach(() => {
  mocks.pathname = "/";
  mocks.lang = "pt";
});

afterEach(cleanup);

describe("AppSidebar without the Aulas entry", () => {
  it("drops Aulas from the expanded menu in PT while keeping the rest", () => {
    const c = renderSidebar({ isMobile: true });
    const text = c.textContent ?? "";
    expect(text).not.toContain("Aulas");
    expect(text).not.toContain("Lessons");
    for (const label of ["Hoje", "Alunos", "Leads", "Agenda", "Biblioteca", "Financeiro", "Crescimento", "Bloom Academy", "Comunidade", "Feed", "Perfil", "Configurações"]) {
      expect(text, `missing ${label}`).toContain(label);
    }
  });

  it("drops Lessons from the expanded menu in EN", () => {
    mocks.lang = "en";
    const c = renderSidebar({ isMobile: true });
    const text = c.textContent ?? "";
    expect(text).not.toContain("Lessons");
    expect(text).not.toContain("Aulas");
    for (const label of ["Today", "Students", "Leads", "Calendar", "Resources", "Finance", "Growth", "Bloom Academy", "Community", "Feed", "Profile", "Settings"]) {
      expect(text, `missing ${label}`).toContain(label);
    }
  });

  it("never links to /lessons and keeps every other destination", () => {
    const c = renderSidebar({ isMobile: true });
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
    expect(text).not.toContain("Biblioteca");
    expect(navLinks(c)).toEqual([
      "/", "/students", "/leads", "/calendar", "/resources", "/finance",
      "/workspace", "/growth", "/academy", "/community", "/profile", "/settings",
    ]);
  });
});

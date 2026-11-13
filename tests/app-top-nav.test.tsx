// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/finance", superAdmin: false, lang: "pt" as "pt" | "en" }));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: (opts: { select: (s: { location: { pathname: string } }) => unknown }) =>
    opts.select({ location: { pathname: mocks.pathname } }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) =>
    createElement("a", { href: to, ...rest, onClick: (e: MouseEvent) => { (rest as any).onClick?.(e); e.preventDefault(); } }, children),
}));
vi.mock("@/hooks/use-plan", () => ({ usePlan: () => ({ isSuperAdmin: mocks.superAdmin }) }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: { email: "ana@escola.com" }, profile: { full_name: "Ana Lima", avatar_url: null }, signOut: vi.fn() }),
}));
vi.mock("@/components/layout/NotificationBell", () => ({
  NotificationBell: () => createElement("button", { type: "button", "aria-label": "Notificações" }),
}));
vi.mock("@/hooks/use-language", async () => {
  const { t } = await import("../src/lib/i18n");
  return { useLanguage: () => ({ lang: mocks.lang, setLang: vi.fn(), t: (k: string, f?: string) => t(k, mocks.lang, f) }) };
});

import { AppTopNav } from "../src/components/layout/AppTopNav";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  mocks.pathname = "/finance";
  mocks.superAdmin = false;
  mocks.lang = "pt";
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const render = () => act(() => root.render(createElement(AppTopNav)));
const tab = () => container.querySelector<HTMLButtonElement>("button[aria-controls]:not([aria-haspopup])")!;
const panel = () => document.getElementById(tab().getAttribute("aria-controls")!)!;
const isOpen = () => tab().getAttribute("aria-expanded") === "true" && !panel().hidden;
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const pointerDown = (el: Element) => act(() => { el.dispatchEvent(new Event("pointerdown", { bubbles: true })); });

describe("AppTopNav mega menu", () => {
  it("starts closed and has no horizontal bar or 'Mais' option", () => {
    render();
    expect(isOpen()).toBe(false);
    expect(tab().getAttribute("aria-label")).toBe("Abrir menu de navegação");
    expect(container.textContent).not.toMatch(/\bMais\b/);
  });

  it("opens only on click (not on hover) and toggles with a second click", () => {
    render();
    act(() => { tab().dispatchEvent(new MouseEvent("mouseover", { bubbles: true })); tab().dispatchEvent(new MouseEvent("mouseenter")); });
    expect(isOpen()).toBe(false);
    click(tab());
    expect(isOpen()).toBe(true);
    expect(tab().getAttribute("aria-label")).toBe("Fechar menu de navegação");
    click(tab());
    expect(isOpen()).toBe(false);
  });

  it("closes on a click outside and on Esc (focus back on the tab), but not on clicks inside the panel", () => {
    render();
    click(tab());
    pointerDown(panel().querySelector("h2")!);
    expect(isOpen()).toBe(true);
    pointerDown(document.body);
    expect(isOpen()).toBe(false);
    click(tab());
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(tab());
  });

  it("shows the three columns with the modules, highlights the active one and closes after navigating", () => {
    render();
    click(tab());
    const sections = [...panel().querySelectorAll("section")].map((s) => ({
      title: s.querySelector("h2")!.textContent,
      items: [...s.querySelectorAll("li")].map((li) => li.textContent),
    }));
    expect(sections).toEqual([
      { title: "Gestão", items: ["Visão Geral", "Agenda", "Alunos", "Leads"] },
      { title: "Negócio", items: ["Financeiro", "Crescimento", "Workspace"] },
      { title: "Recursos", items: ["Biblioteca", "Comunidade", "Bloom AcademyEm breve", "MercadoEm breve"] },
    ]);
    const current = panel().querySelectorAll('[aria-current="page"]');
    expect([...current].map((a) => a.getAttribute("href"))).toEqual(["/finance"]);
    expect(panel().querySelector('[aria-disabled="true"]')!.textContent).toContain("Mercado");
    expect(panel().querySelector('a[href="/marketplace"]')).toBeNull();
    // 20 × 20 icons
    expect([...panel().querySelectorAll("li svg")].every((svg) => svg.getAttribute("class")!.includes("h-5 w-5"))).toBe(true);
    click(panel().querySelector('a[href="/students"]')!);
    expect(isOpen()).toBe(false);
  });

  it("shows Administração only for super_admin; English badges follow the language", () => {
    render();
    click(tab());
    expect(panel().querySelector('a[href="/admin"]')).toBeNull();
    act(() => root.unmount());
    mocks.superAdmin = true;
    mocks.lang = "en";
    root = createRoot(container);
    render();
    click(tab());
    expect(panel().querySelector('a[href="/admin"]')!.textContent).toContain("Administration");
    expect(panel().textContent).toContain("MarketplaceComing Soon");
    expect(panel().textContent).not.toContain("Bloom AcademyComing Soon"); // super_admin sees Academy without the badge
  });
});

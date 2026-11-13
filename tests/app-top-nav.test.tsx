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

import { AppTopNav, HOVER_CLOSE_DELAY } from "../src/components/layout/AppTopNav";

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

  it("keeps Administração out of the mega menu; it stays in the account menu only for super_admin", () => {
    const accountTrigger = () => container.querySelector<HTMLButtonElement>('button[aria-haspopup="dialog"]')!;
    render();
    click(tab());
    expect(panel().querySelector('a[href="/admin"]')).toBeNull();
    click(accountTrigger());
    expect(document.querySelector('a[href="/admin"]')).toBeNull();
    act(() => root.unmount());
    mocks.superAdmin = true;
    mocks.lang = "en";
    root = createRoot(container);
    render();
    click(tab());
    expect(panel().querySelector('a[href="/admin"]')).toBeNull();
    expect(panel().textContent).toContain("MarketplaceComing Soon");
    expect(panel().textContent).not.toContain("Bloom AcademyComing Soon"); // super_admin sees Academy without the badge
    click(accountTrigger());
    expect(document.querySelector('a[href="/admin"]')!.textContent).toContain("Administration");
  });
});

/** React derives onPointerEnter/Leave from pointerover/pointerout + relatedTarget. */
function pointer(type: "pointerover" | "pointerout", target: Element, related: Element, pointerType = "mouse") {
  act(() => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget: related });
    Object.defineProperty(event, "pointerType", { value: pointerType });
    target.dispatchEvent(event);
  });
}
const hoverIn = (el: Element, pointerType = "mouse") => pointer("pointerover", el, document.body, pointerType);
const moveOut = (el: Element, to: Element = document.body) => pointer("pointerout", el, to);

describe("AppTopNav mega menu — desktop hover", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("opens when the mouse enters the tab (no click) and closes 200 ms after leaving it", () => {
    render();
    hoverIn(tab());
    expect(isOpen()).toBe(true);
    moveOut(tab());
    act(() => { vi.advanceTimersByTime(HOVER_CLOSE_DELAY - 1); });
    expect(isOpen()).toBe(true);
    act(() => { vi.advanceTimersByTime(1); });
    expect(isOpen()).toBe(false);
  });

  it("cancels the close when the pointer returns within 200 ms", () => {
    render();
    hoverIn(tab());
    moveOut(tab());
    act(() => { vi.advanceTimersByTime(150); });
    hoverIn(tab());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(isOpen()).toBe(true);
  });

  it("stays open while moving from the tab into the panel and while over the panel; closes after leaving it", () => {
    render();
    hoverIn(tab());
    moveOut(tab(), panel());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(isOpen()).toBe(true);
    const link = panel().querySelector('a[href="/students"]')!;
    moveOut(panel().querySelector("h2")!, link);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(isOpen()).toBe(true);
    moveOut(link, document.body);
    act(() => { vi.advanceTimersByTime(HOVER_CLOSE_DELAY); });
    expect(isOpen()).toBe(false);
  });

  it("does not open when hovering other header areas, nor on touch pointers", () => {
    render();
    hoverIn(container.querySelector("header a")!);
    hoverIn(container.querySelector('button[aria-label="Notificações"]')!);
    hoverIn(container.querySelector('button[aria-haspopup="dialog"]')!);
    expect(isOpen()).toBe(false);
    hoverIn(tab(), "touch");
    expect(isOpen()).toBe(false);
  });

  it("a click on a hover-opened menu keeps it open (no auto-close); the next click closes it", () => {
    render();
    hoverIn(tab());
    click(tab());
    expect(isOpen()).toBe(true);
    moveOut(tab());
    act(() => { vi.advanceTimersByTime(1000); });
    expect(isOpen()).toBe(true);
    click(tab());
    expect(isOpen()).toBe(false);
  });

  it("Esc, an outside click and choosing a module still close a hover-opened menu (no late reopen)", () => {
    render();
    hoverIn(tab());
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(isOpen()).toBe(false);
    moveOut(tab());
    hoverIn(tab());
    pointerDown(document.body);
    expect(isOpen()).toBe(false);
    moveOut(tab());
    hoverIn(tab());
    moveOut(tab(), panel());
    click(panel().querySelector('a[href="/leads"]')!);
    expect(isOpen()).toBe(false);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(isOpen()).toBe(false);
  });
});

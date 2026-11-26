// @vitest-environment happy-dom
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) => createElement("a", { href: to, ...rest }, children) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1" }, session: { user: { id: "t1" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (key: string) => key }) }));
// Worst case for the shortcut: every library resource is SOON and locked for this teacher.
vi.mock("@/hooks/use-library-access", () => ({ useLibraryAccess: () => ({ data: undefined, isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn(),
  fullAccess: false, isAdmin: false, level: () => "free", availability: () => "soon", soonLocked: () => true }) }));
vi.mock("@/lib/library-content.functions", () => ({ accessLibraryResource: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock("@/components/resources/ReceiptGenerator", () => ({ ReceiptGenerator: () => null }));
vi.mock("@/components/bloom/PremiumGate", () => ({ PremiumBenefitsDialog: () => null }));
import { Route } from "../src/routes/_app.resources";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

async function renderPage() {
  const Page = Route.options.component as () => JSX.Element;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Suspense, { fallback: null }, createElement(Page)))));
  for (let i = 0; i < 20 && !document.body.textContent; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
}

describe("Recursos e Modelos — Novo Teste de Nivelamento shortcut", () => {
  it("is a plain link to /placement, without the SOON tag or the locked state", async () => {
    await renderPage();
    const card = document.querySelector<HTMLAnchorElement>('[data-testid="resources-placement-shortcut"]');
    expect(card).not.toBeNull();
    expect(card!.tagName).toBe("A");
    expect(card!.getAttribute("href")).toBe("/placement");
    expect(card!.textContent).toContain("Novo Teste de Nivelamento");
    expect(card!.textContent).toContain("Iniciar teste de nivelamento");
    expect(card!.querySelector('[data-testid="library-soon-badge"]')).toBeNull();
    expect(card!.getAttribute("aria-disabled")).toBeNull();
    expect(card!.className).not.toContain("opacity-55");
    // The icon stays.
    expect(card!.querySelector("svg")).not.toBeNull();
  });

  it("leaves the other quick actions with their library classification", async () => {
    await renderPage();
    const quick = document.querySelector('[data-testid="resources-placement-shortcut"]')!.parentElement!;
    const others = Array.from(quick.children).filter((el) => el.getAttribute("data-testid") !== "resources-placement-shortcut");
    expect(others.length).toBeGreaterThan(0);
    for (const el of others) {
      expect(el.querySelector('[data-testid="library-soon-badge"]')).not.toBeNull();
      expect(el.getAttribute("aria-disabled")).toBe("true");
    }
  });
});

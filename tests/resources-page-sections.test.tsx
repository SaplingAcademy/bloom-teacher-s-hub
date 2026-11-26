// @vitest-environment happy-dom
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) => createElement("a", { href: to, ...rest }, children) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1" }, session: { user: { id: "t1" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (key: string) => key }) }));
vi.mock("@/hooks/use-library-access", () => ({ useLibraryAccess: () => ({ data: undefined, isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn(),
  fullAccess: false, isAdmin: false, level: () => "free", availability: () => "available", soonLocked: () => false }) }));
vi.mock("@/lib/library-content.functions", () => ({ accessLibraryResource: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
vi.mock("@/components/resources/ReceiptGenerator", () => ({ ReceiptGenerator: () => null }));
vi.mock("@/components/bloom/PremiumGate", () => ({ PremiumBenefitsDialog: () => null }));
import { Route } from "../src/routes/_app.resources";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

describe("Recursos e Modelos page", () => {
  it("no longer shows the Recursos Pedagógicos section; the other sections stay", async () => {
    const Page = Route.options.component as () => JSX.Element;
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Suspense, { fallback: null }, createElement(Page)))));
    for (let i = 0; i < 20 && !document.body.textContent; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Recursos Pedagógicos");
    expect(text).not.toContain("Nivelamento, objetivos dos alunos, cronogramas e relatórios.");
    expect(text).toContain("Recursos Administrativos");
    expect(text).toContain("Ações Rápidas");
    expect(text).toContain("Favoritos");
    expect(text).toContain("Usados Recentemente");
  });
});

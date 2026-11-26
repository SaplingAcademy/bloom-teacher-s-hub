// @vitest-environment happy-dom
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => ({ ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, ...rest }: { to: string; children?: React.ReactNode }) => createElement("a", { href: to, ...rest }, children) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1" }, session: { user: { id: "t1" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (key: string) => key }) }));
vi.mock("@/hooks/use-library-access", () => ({ useLibraryAccess: () => ({ data: undefined, isLoading: false, isPending: false, isError: false, error: null, refetch: vi.fn(),
  fullAccess: false, isAdmin: false, level: () => "free", availability: () => "available", soonLocked: () => false }) }));
vi.mock("@/lib/library-content.functions", () => ({ accessLibraryResource: mocks.access }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok", user: { id: "t1" } } } }) } } }));
// The real generator is reused as is; here it only reports whether it was opened.
vi.mock("@/components/resources/ReceiptGenerator", () => ({ ReceiptGenerator: ({ open }: { open: boolean }) => open ? createElement("div", { "data-testid": "receipt-generator" }) : null }));
vi.mock("@/components/bloom/PremiumGate", () => ({ PremiumBenefitsDialog: () => null }));
import { Route } from "../src/routes/_app.resources";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root | undefined;
const q = (sel: string) => document.querySelector(sel);
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 25)); });
async function mount() {
  const Page = Route.options.component as () => JSX.Element;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Suspense, { fallback: null }, createElement(Page)))));
  for (let i = 0; i < 20 && !document.body.textContent; i++) await flush();
}
const typeSearch = (value: string) => act(async () => {
  const input = document.querySelector('input[placeholder="Buscar contratos, políticas, avaliações..."]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = "";
  localStorage.clear();
  mocks.access.mockReset().mockResolvedValue({ accessLevel: "free", template: { id: "admin-receipt", title: "Recibo", description: "", category: "finance", section: "administrative", content: "", placeholders: [] } });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

describe("Gerador de Recibos card", () => {
  it("replaces the Finanças card and opens the existing generator directly (authorized like any template)", async () => {
    await mount();
    const card = q('[data-testid="resource-category-finance"]') as HTMLButtonElement;
    expect(card.textContent).toContain("Gerador de Recibos");
    expect(card.textContent).not.toContain("Finanças");
    await act(async () => card.click());
    await flush();
    expect(mocks.access).toHaveBeenCalledWith({ data: expect.objectContaining({ resourceId: expect.stringContaining("admin-receipt"), operation: "open" }) });
    expect(q('[data-testid="receipt-generator"]')).not.toBeNull();
    // No intermediate Finance category page.
    expect(document.body.textContent).not.toContain("Invoice Template");
  });
  it("other finance templates are no longer listed in favorites or recent items; the receipt still is", async () => {
    localStorage.setItem("bloom.resources.favorites", JSON.stringify(["admin-invoice", "admin-receipt"]));
    localStorage.setItem("bloom.resources.recent", JSON.stringify(["admin-refund-form", "admin-payment-agreement", "admin-price-list"]));
    await mount();
    const text = document.body.textContent ?? "";
    expect(text).not.toContain("Invoice Template");
    expect(text).not.toContain("Refund Form");
    expect(text).not.toContain("Price List");
    expect(text).not.toContain("Payment Agreement");
    expect(text).toContain("receipts.libraryTitle");
    // Stored preferences are left untouched (only hidden from the interface).
    expect(JSON.parse(localStorage.getItem("bloom.resources.favorites")!)).toEqual(["admin-invoice", "admin-receipt"]);
  });
});

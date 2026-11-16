// @vitest-environment happy-dom
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ upsert: vi.fn(), navigate: vi.fn() }));
vi.mock("@tanstack/react-router", async (original) => ({ ...(await original<object>()), useNavigate: () => m.navigate }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt", setLang: vi.fn() }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1", email: "t@x.com" }, session: { user: { id: "t1" } }, loading: false, error: null,
  profile: { id: "t1", onboarding_completed: false, onboarding_status: "not_started", diagnostic_required: false }, signOut: vi.fn(), updateProfileState: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit"]) chain[op] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.upsert = (...args: unknown[]) => { m.upsert(...args); return Promise.resolve({ error: null }); };
  return chain;
} } }));
import { Route } from "../src/routes/onboarding";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; localStorage.clear(); m.upsert.mockReset(); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

async function mount() {
  const Page = Route.options.component as () => JSX.Element;
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Suspense, { fallback: null }, createElement(Page)))));
  for (let i = 0; i < 20 && !document.querySelector('[data-testid="onboarding-welcome"]'); i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
}

describe("onboarding welcome (after the Diagnóstico Inicial)", () => {
  it("shows only the new title, one short sentence and the button", async () => {
    await mount();
    const welcome = document.querySelector('[data-testid="onboarding-welcome"]')!;
    expect(welcome.querySelector("h1")!.textContent).toBe("onboardingUi.welcomeTitle");
    expect([...welcome.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["onboardingUi.welcomeSubtitle"]);
    expect(welcome.textContent).not.toMatch(/itWillBeQuick|nextStepsSimpleQuestions|donTWorryYouCan|welcomeToBloom|🌱/);
    expect(welcome.querySelectorAll("button")).toHaveLength(1);
    expect(welcome.querySelector("button")!.textContent).toContain("onboardingUi.customizeMyBloom");
  });
  it("the button still starts step 1 and saves progress as before", async () => {
    await mount();
    await act(async () => (document.querySelector('[data-testid="onboarding-welcome"] button') as HTMLButtonElement).click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(document.querySelector('[data-testid="onboarding-welcome"]')).toBeNull();
    expect(m.upsert).toHaveBeenCalled();
  });
  it("questionnaire steps use the shared hierarchy: one title style, wider column, footer right after the content", async () => {
    await mount();
    expect(document.querySelector("main")!.className).toContain("max-w-xl");
    await act(async () => (document.querySelector('[data-testid="onboarding-welcome"] button') as HTMLButtonElement).click());
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const main = document.querySelector("main")!;
    expect(main.className).toContain("max-w-2xl");
    expect(main.className).not.toContain("justify-between");
    const label = main.querySelector("label.block")!;
    expect(label.className).toContain("text-xl sm:text-2xl font-extrabold font-outfit text-stone-900");
  });
});

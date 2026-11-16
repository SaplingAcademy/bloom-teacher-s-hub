// @vitest-environment happy-dom
import { act, createElement, Suspense } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt", setLang: vi.fn() }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1", email: "t@x.com" }, session: { user: { id: "t1" } }, loading: false, error: null,
  profile: { id: "t1", onboarding_completed: false, onboarding_status: "in_progress", diagnostic_required: false }, signOut: vi.fn(), updateProfileState: vi.fn() }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => {
  const chain: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "limit"]) chain[op] = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.upsert = () => Promise.resolve({ error: null });
  return chain;
} } }));
import { Route } from "../src/routes/onboarding";
import { setUserItem } from "../src/lib/user-storage";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root | undefined;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; localStorage.clear(); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

describe("onboarding step 5 — Finanças", () => {
  it("no longer asks the monthly expense, keeps the monthly goal and hourly-rate questions", async () => {
    setUserItem("bloom.onboarding.step", "5", "t1");
    // A draft from before the change (with an expense value) still loads without errors.
    setUserItem("bloom.onboarding.draft", JSON.stringify({ monthlyGoal: "8000", monthlyExpense: "1500" }), "t1");
    const Page = Route.options.component as () => JSX.Element;
    root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Suspense, { fallback: null }, createElement(Page)))));
    for (let i = 0; i < 20 && !document.body.textContent?.includes("onboardingUi.step5Finances"); i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    const text = document.querySelector("main")!.textContent!;
    expect(text).toContain("onboardingUi.whatIsYourMonthlyIncome");
    expect(text).toContain("onboardingUi.doYouKnowYourHourly");
    expect(text).not.toMatch(/approximatelyHowMuchDoYou|donTWorryIfYou/);
    expect(document.querySelector('input[placeholder="onboardingUi.optionalAmountPh"]')).toBeNull();
    expect((document.querySelector('input[placeholder="12.000"]') as HTMLInputElement).value).toBe("8000");
  });
});

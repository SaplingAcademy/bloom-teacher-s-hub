// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ rpc: vi.fn(), navigate: vi.fn(), update: vi.fn(), state: null as unknown }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: m.rpc } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => m.navigate }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1" }, loading: false, error: null, signOut: vi.fn(), updateProfileState: m.update,
  profile: { onboarding_completed: false, onboarding_status: "not_started", diagnostic_required: true } }) }));
vi.mock("@/components/bloom/Logo", () => ({ BloomLogo: () => null }));
import { DiagnosticFlow } from "../src/components/bloom/diagnostic/DiagnosticFlow";

let root: Root | undefined;
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); });
const q = (sel: string) => document.querySelector(sel);
const byText = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;
const click = (el: Element | null) => act(async () => { (el as HTMLElement).click(); });
const pick = (question: string, option: string) => click(q(`[data-question="${question}"] [data-option="${option}"]`));
const type = (selector: string, value: string) => act(async () => {
  const el = q(selector) as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
const state = (over: Record<string, unknown> = {}) => ({ required: true, status: "not_started", current_step: 1, answers: {}, consent_accepted_at: null, ...over });
function rpcPlan(plan: Record<string, unknown>) {
  m.rpc.mockImplementation(async (name: string) => {
    const value = typeof plan[name] === "function" ? (plan[name] as () => unknown)() : plan[name];
    return value instanceof Error ? { data: null, error: { message: value.message } } : { data: value ?? null, error: null };
  });
}
async function mount() {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(DiagnosticFlow))));
  await flush();
}
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; m.rpc.mockReset(); m.navigate.mockReset(); m.update.mockReset(); });
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

describe("Diagnóstico Inicial flow", () => {
  it("a failed load shows an error with retry and never leaves to the platform", async () => {
    rpcPlan({ get_my_teacher_diagnostic: new Error("Failed to fetch") });
    await mount();
    expect(q('[data-testid="diagnostic-load-error"]')).not.toBeNull();
    expect(m.navigate).not.toHaveBeenCalled();
    rpcPlan({ get_my_teacher_diagnostic: [state()] });
    await click(byText("diagnostic.retry"));
    await flush();
    expect(q('[data-testid="diagnostic-intro"]')).not.toBeNull();
  });
  it("consent is not pre-checked; starting requires it and records it in the database", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state()], accept_teacher_diagnostic_consent: "2026-11-16T10:00:00Z" });
    await mount();
    expect(q("#diagnostic-consent")!.getAttribute("data-state")).toBe("unchecked");
    expect(document.body.textContent).toContain("diagnostic.intro");
    await click(byText("diagnostic.start"));
    expect(document.body.textContent).toContain("diagnostic.consentRequired");
    expect(m.rpc).not.toHaveBeenCalledWith("accept_teacher_diagnostic_consent");
    await click(q("#diagnostic-consent"));
    await click(byText("diagnostic.start"));
    await flush();
    expect(m.rpc).toHaveBeenCalledWith("accept_teacher_diagnostic_consent", undefined);
    expect(q('[data-testid="diagnostic-step"]')!.getAttribute("data-step")).toBe("1");
  });
  it("validates the step (incl. conditional), saves on Continue and keeps answers when going back", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c" })], save_teacher_diagnostic_step: 2 });
    await mount();
    await click(q('[data-testid="diagnostic-next"]'));
    expect(document.body.textContent).toContain("diagnostic.stepIncomplete");
    expect(m.rpc).not.toHaveBeenCalledWith("save_teacher_diagnostic_step", expect.anything());
    await pick("experience", "3_5"); await pick("main_activity", "no"); await pick("students", "6_10"); await pick("team", "solo");
    await click(q('[data-testid="diagnostic-next"]'));
    expect(q('[data-question="other_activity"]')).not.toBeNull(); // conditional shown and required
    expect(m.rpc).not.toHaveBeenCalledWith("save_teacher_diagnostic_step", expect.anything());
    await type("#diagnostic-other_activity", "Tradutora");
    await click(q('[data-testid="diagnostic-next"]'));
    await flush();
    expect(m.rpc).toHaveBeenCalledWith("save_teacher_diagnostic_step", { p_step: 2, p_answers: { experience: "3_5", main_activity: "no", other_activity: "Tradutora", students: "6_10", team: "solo" } });
    expect(q('[data-testid="diagnostic-step"]')!.getAttribute("data-step")).toBe("2");
    await click(byText("diagnostic.back"));
    expect(q('[data-question="experience"] [data-option="3_5"]')!.getAttribute("aria-checked")).toBe("true");
  });
  it("a failed save shows the error, keeps the step and allows retrying", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c" })], save_teacher_diagnostic_step: new Error("Failed to fetch") });
    await mount();
    await pick("experience", "lt1"); await pick("main_activity", "yes"); await pick("students", "0_5"); await pick("team", "solo");
    await click(q('[data-testid="diagnostic-next"]'));
    await flush();
    expect(q('[data-testid="diagnostic-save-error"]')!.textContent).toBe("diagnostic.saveError");
    expect(q('[data-testid="diagnostic-step"]')!.getAttribute("data-step")).toBe("1");
    expect(m.navigate).not.toHaveBeenCalled();
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c" })], save_teacher_diagnostic_step: 2 });
    await click(q('[data-testid="diagnostic-next"]'));
    await flush();
    expect(q('[data-testid="diagnostic-step"]')!.getAttribute("data-step")).toBe("2");
  });
  it("resumes at the saved step and finishing goes to the standard onboarding", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", current_step: 5, answers: { business_view: "partly", professionalism: 7, improve: "organizar", wish: "nada" } })],
      complete_teacher_diagnostic: "2026-11-16T10:00:00Z" });
    await mount();
    expect(q('[data-testid="diagnostic-step"]')!.getAttribute("data-step")).toBe("5");
    expect(q('[data-question="professionalism"] [data-option="7"]')!.getAttribute("aria-checked")).toBe("true");
    await click(byText("diagnostic.finish"));
    await flush();
    expect(m.rpc).toHaveBeenCalledWith("complete_teacher_diagnostic", { p_answers: { business_view: "partly", professionalism: 7, improve: "organizar", wish: "nada" } });
    expect(m.update).toHaveBeenCalledWith({ diagnostic_required: false });
    expect(m.navigate).toHaveBeenCalledWith({ to: "/onboarding", replace: true });
  });
  it("accounts that do not need it (exempt/completed/admin) continue without seeing it", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ required: false, status: "exempt" })] });
    await mount();
    expect(q('[data-testid="diagnostic-intro"]')).toBeNull();
    expect(m.navigate).toHaveBeenCalledWith({ to: "/onboarding", replace: true });
  });
});

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
const next = () => click(q('[data-testid="diagnostic-next"]'));
const screen = () => { const el = q('[data-testid="diagnostic-step"]')!; return { step: el.getAttribute("data-step"), index: el.getAttribute("data-question-index") }; };
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
  it("welcome shows title, purpose, estimated time, saving info; consent stays mandatory and is recorded", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state()], accept_teacher_diagnostic_consent: "2026-11-16T10:00:00Z" });
    await mount();
    const intro = q('[data-testid="diagnostic-intro"]')!;
    expect(intro.textContent).toContain("diagnostic.welcomeTitle");
    expect(intro.textContent).toContain("diagnostic.welcomeBody");
    expect(q('[data-testid="diagnostic-estimated-time"]')!.textContent).toContain("diagnostic.estimatedTime");
    expect(intro.textContent).toContain("diagnostic.savedInfo");
    expect(intro.textContent).toContain("diagnostic.intro");
    expect(q("#diagnostic-consent")!.getAttribute("data-state")).toBe("unchecked");
    await click(byText("diagnostic.startDiagnostic"));
    expect(document.body.textContent).toContain("diagnostic.consentRequired");
    expect(m.rpc).not.toHaveBeenCalledWith("accept_teacher_diagnostic_consent", undefined);
    await click(q("#diagnostic-consent"));
    await click(byText("diagnostic.startDiagnostic"));
    await flush();
    expect(m.rpc).toHaveBeenCalledWith("accept_teacher_diagnostic_consent", undefined);
    expect(screen()).toEqual({ step: "1", index: "0" });
  });
  it("one question at a time: local navigation inside the step, one save at the end of the step", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c" })], save_teacher_diagnostic_step: 2 });
    await mount();
    expect(q('[data-question="experience"]')).not.toBeNull();
    expect(q('[data-question="students"]')).toBeNull(); // only the current question is on screen
    expect(q('[data-testid="diagnostic-question-counter"]')!.textContent).toBe("diagnostic.questionCounter");
    await next();
    expect(document.body.textContent).toContain("diagnostic.required"); // current question validated
    expect(screen()).toEqual({ step: "1", index: "0" });
    await pick("experience", "3_5"); await next();
    await pick("main_activity", "no"); await next();
    expect(q('[data-question="other_activity"]')).not.toBeNull(); // conditional as its own question
    await next();
    expect(document.body.textContent).toContain("diagnostic.required");
    await type("#diagnostic-other_activity", "Tradutora"); await next();
    await pick("students", "6_10"); await next();
    await pick("team", "solo");
    expect(m.rpc.mock.calls.filter(([name]) => name === "save_teacher_diagnostic_step")).toHaveLength(0); // nothing saved yet
    await next();
    await flush();
    const saves = m.rpc.mock.calls.filter(([name]) => name === "save_teacher_diagnostic_step");
    expect(saves).toEqual([["save_teacher_diagnostic_step", { p_step: 2, p_answers: { experience: "3_5", main_activity: "no", other_activity: "Tradutora", students: "6_10", team: "solo" } }]]);
    expect(screen()).toEqual({ step: "2", index: "0" });
    // Back from the first question of step 2 returns to the last question of step 1, answers kept.
    await click(byText("diagnostic.back"));
    expect(screen()).toEqual({ step: "1", index: "4" });
    expect(q('[data-question="team"] [data-option="solo"]')!.getAttribute("aria-checked")).toBe("true");
    await click(byText("diagnostic.back")); await click(byText("diagnostic.back"));
    expect(q('[data-question="other_activity"] input')!.getAttribute("value") ?? (q("#diagnostic-other_activity") as HTMLInputElement).value).toBe("Tradutora");
    expect(m.rpc.mock.calls.filter(([name]) => name === "save_teacher_diagnostic_step")).toHaveLength(1);
  });
  it("'Outro' detail is validated with its question", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", current_step: 2 })] });
    await mount();
    await pick("student_info_tools", "other");
    await next();
    expect(document.body.textContent).toContain("diagnostic.otherRequired");
    await type('[data-other="student_info_tools_other"]', "Trello");
    await next();
    expect(q('[data-question="payment_tracking"]')).not.toBeNull();
  });
  it("a failed save shows the error, keeps the question and allows retrying", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", answers: { experience: "lt1", main_activity: "yes", students: "0_5", team: "solo" } })],
      save_teacher_diagnostic_step: new Error("Failed to fetch") });
    await mount();
    for (let i = 0; i < 3; i++) await next(); // answers restored: walk to the last question (main_activity=yes hides the conditional)
    expect(screen()).toEqual({ step: "1", index: "3" });
    await next();
    await flush();
    expect(q('[data-testid="diagnostic-save-error"]')!.textContent).toBe("diagnostic.saveError");
    expect(screen()).toEqual({ step: "1", index: "3" });
    expect(m.navigate).not.toHaveBeenCalled();
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c" })], save_teacher_diagnostic_step: 2 });
    await next();
    await flush();
    expect(screen()).toEqual({ step: "2", index: "0" });
  });
  it("resumes at the saved step and finishing goes to the standard onboarding", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", current_step: 5, answers: { business_view: "partly", professionalism: 7, improve: "organizar", wish: "nada" } })],
      complete_teacher_diagnostic: "2026-11-16T10:00:00Z" });
    await mount();
    expect(screen()).toEqual({ step: "5", index: "0" });
    await next(); // business_view
    expect(q('[data-question="professionalism"] [data-option="7"]')!.getAttribute("aria-checked")).toBe("true");
    await next(); await next();
    expect(byText("diagnostic.finish")).toBeTruthy();
    expect(m.rpc).not.toHaveBeenCalledWith("complete_teacher_diagnostic", expect.anything());
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

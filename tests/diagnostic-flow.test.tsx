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
  it("intro shows the estimated time (3–5 min) and that progress is saved", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state()] });
    await mount();
    expect(q('[data-testid="diagnostic-estimated-time"]')!.textContent).toBe("diagnostic.estimatedTime");
    expect(q('[data-testid="diagnostic-intro"]')!.textContent).toContain("diagnostic.savedInfo");
  });
  it("groups follow-ups inside their question, numbers the blocks and highlights the current one", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", answers: { experience: "3_5" } })] });
    await mount();
    const blocks = [...document.querySelectorAll("[data-question-block]")].map((b) => b.getAttribute("data-question-block"));
    expect(blocks).toEqual(["experience", "main_activity", "students", "team"]); // other_activity is not a separate block
    expect(q("[data-active]")!.getAttribute("data-question-block")).toBe("main_activity"); // first unanswered
    await pick("main_activity", "no");
    expect(q('[data-question-block="main_activity"] [data-question="other_activity"]')).not.toBeNull();
    await act(async () => { q('[data-question-block="team"]')!.dispatchEvent(new Event("pointerdown", { bubbles: true })); });
    expect(q("[data-active]")!.getAttribute("data-question-block")).toBe("team");
  });
  it("quick suggestions fill the free-text answer (still text, editable) and are saved as before", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", current_step: 2 })], save_teacher_diagnostic_step: 3 });
    await mount();
    await pick("student_info_tools", "spreadsheet");
    await pick("payment_tracking", "bank");
    const chip = (qid: string, slug: string) => q(`[data-quick="${qid}"] [data-quick-option="${slug}"]`);
    await click(chip("makeup_control", "calendar"));
    await click(chip("makeup_control", "whatsapp"));
    expect((q("#diagnostic-makeup_control") as HTMLTextAreaElement).value).toBe("diagnostic.q.makeup_control.quick.calendar; diagnostic.q.makeup_control.quick.whatsapp");
    expect(chip("makeup_control", "calendar")!.getAttribute("aria-pressed")).toBe("true");
    await click(chip("makeup_control", "calendar")); // toggles off
    expect((q("#diagnostic-makeup_control") as HTMLTextAreaElement).value).toBe("diagnostic.q.makeup_control.quick.whatsapp");
    await type("#diagnostic-admin_tools", "Planilha própria e Trello");
    await click(q('[data-testid="diagnostic-next"]'));
    await flush();
    expect(m.rpc).toHaveBeenCalledWith("save_teacher_diagnostic_step", { p_step: 3, p_answers: {
      student_info_tools: ["spreadsheet"], student_info_tools_other: "", payment_tracking: ["bank"], payment_tracking_other: "",
      makeup_control: "diagnostic.q.makeup_control.quick.whatsapp", admin_tools: "Planilha própria e Trello" } });
  });
  it("progress grows gradually with answers, does not jump between steps and is 100% only after completion", async () => {
    const percent = () => q('[data-testid="diagnostic-progress-percent"]')!.textContent;
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c" })], save_teacher_diagnostic_step: 2 });
    await mount();
    expect(percent()).toBe("0%");
    await pick("experience", "3_5");
    expect(percent()).toBe("4%"); // 1 of 21 applicable questions
    await pick("main_activity", "no"); // follow-up becomes applicable: 2 of 22
    expect(percent()).toBe("9%");
    await type("#diagnostic-other_activity", "Tradutora");
    await pick("students", "6_10"); await pick("team", "solo");
    expect(percent()).toBe("22%"); // 5 of 22
    await click(q('[data-testid="diagnostic-next"]'));
    await flush();
    expect(q('[data-testid="diagnostic-step"]')!.getAttribute("data-step")).toBe("2");
    expect(percent()).toBe("22%"); // no artificial jump when the step changes
    await pick("student_info_tools", "spreadsheet");
    expect(percent()).toBe("27%");
    await pick("student_info_tools", "spreadsheet"); // removing the answer lowers it again
    expect(percent()).toBe("22%");
    await click(byText("diagnostic.back"));
    expect(percent()).toBe("22%"); // consistent when going back
  });
  it("reaches 100% only when completion succeeds", async () => {
    const answers = { experience: "3_5", main_activity: "yes", students: "6_10", team: "solo", student_info_tools: ["spreadsheet"], payment_tracking: ["bank"],
      makeup_control: "agenda", admin_tools: "planilha", pain_points: ["payments"], eliminate_one: "cobrar", most_time: "agenda", avoided_task: "não",
      forgot_info: "no", admin_hours: "1_2", day_organization: "agenda", prioritization: "prazo", admin_control: 6, business_view: "partly",
      professionalism: 5, improve: "organizar", wish: "nada" };
    rpcPlan({ get_my_teacher_diagnostic: [state({ consent_accepted_at: "c", current_step: 5, answers })], complete_teacher_diagnostic: new Error("Failed to fetch") });
    await mount();
    const percent = () => q('[data-testid="diagnostic-progress-percent"]')!.textContent;
    expect(percent()).toBe("99%"); // everything answered, not yet completed
    await click(byText("diagnostic.finish"));
    await flush();
    expect(percent()).toBe("99%"); // failed completion: still not 100%
    rpcPlan({ get_my_teacher_diagnostic: [state()], complete_teacher_diagnostic: "2026-11-16T10:00:00Z" });
    await click(q('[data-testid="diagnostic-next"]'));
    await flush();
    expect(percent()).toBe("100%");
  });
  it("accounts that do not need it (exempt/completed/admin) continue without seeing it", async () => {
    rpcPlan({ get_my_teacher_diagnostic: [state({ required: false, status: "exempt" })] });
    await mount();
    expect(q('[data-testid="diagnostic-intro"]')).toBeNull();
    expect(m.navigate).toHaveBeenCalledWith({ to: "/onboarding", replace: true });
  });
});

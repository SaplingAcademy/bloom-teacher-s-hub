import { describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));
import {
  DIAGNOSTIC_STEPS, OBJECTIVE_QUESTIONS, diagnosticProgress, QUICK_ANSWERS, hasQuickAnswer, toggleQuickAnswer, completeDiagnostic, diagnosticsCsv, distribution, isDiagnosticNotDeployed, missingInStep,
  saveDiagnosticStep, stepOf, stepPayload, type DiagnosticRow,
} from "../src/lib/teacher-diagnostic";

const full = {
  experience: "3_5", main_activity: "yes", students: "6_10", team: "solo",
  student_info_tools: ["spreadsheet"], payment_tracking: ["bank"], makeup_control: "agenda", admin_tools: "planilha",
  pain_points: ["payments", "collections"], eliminate_one: "cobrar", most_time: "agenda", avoided_task: "não", forgot_info: "no",
  admin_hours: "1_2", day_organization: "agenda", prioritization: "prazo", admin_control: 6,
  business_view: "partly", professionalism: 5, improve: "organizar", wish: "nada",
};

describe("diagnostic structure and step validation", () => {
  it("has the 5 steps: 22 numbered questions plus the Q14 follow-up", () => {
    expect(DIAGNOSTIC_STEPS.map((s) => s.key)).toEqual(["profile", "lessons", "difficulties", "time", "expectations"]);
    expect(DIAGNOSTIC_STEPS.flatMap((s) => s.questions)).toHaveLength(23);
  });
  it("complete answers pass every step", () => {
    for (let step = 1; step <= 5; step++) expect(missingInStep(full, step)).toEqual([]);
  });
  it("objective questions are required; open answers need only a short text (2+ chars)", () => {
    expect(missingInStep({ ...full, experience: undefined as never }, 1)).toEqual(["experience"]);
    expect(missingInStep({ ...full, makeup_control: " a " }, 2)).toEqual(["makeup_control"]);
    expect(missingInStep({ ...full, makeup_control: "ok" }, 2)).toEqual([]);
    expect(missingInStep({ ...full, admin_control: 11 }, 4)).toEqual(["admin_control"]);
  });
  it("conditional questions apply only when relevant", () => {
    expect(missingInStep({ ...full, main_activity: "no" }, 1)).toEqual(["other_activity"]);
    expect(missingInStep({ ...full, main_activity: "no", other_activity: "Tradutora" }, 1)).toEqual([]);
    expect(missingInStep({ ...full, forgot_info: "yes" }, 3)).toEqual(["forgot_info_detail"]);
  });
  it("'Outro' requires a description", () => {
    expect(missingInStep({ ...full, student_info_tools: ["other"] }, 2)).toEqual(["student_info_tools_other"]);
    expect(missingInStep({ ...full, student_info_tools: ["other"], student_info_tools_other: "Trello" }, 2)).toEqual([]);
    expect(stepOf("student_info_tools_other")).toBe(2);
    expect(stepOf("wish")).toBe(5);
  });
  it("saved step payload clears hidden conditionals and unselected 'Outro' details", () => {
    expect(stepPayload({ ...full, other_activity: "antigo" }, 1)).toMatchObject({ main_activity: "yes", other_activity: "" });
    expect(stepPayload({ ...full, student_info_tools: ["paper"], student_info_tools_other: "antigo" }, 2)).toMatchObject({ student_info_tools_other: "" });
    expect(stepPayload({ ...full, makeup_control: "  agenda  " }, 2)).toMatchObject({ makeup_control: "agenda" });
  });
});

describe("diagnostic RPCs", () => {
  it("save sends the next step and the step answers; server errors are mapped", async () => {
    rpc.mockResolvedValueOnce({ data: 2, error: null });
    await saveDiagnosticStep(2, { experience: "lt1" });
    expect(rpc).toHaveBeenCalledWith("save_teacher_diagnostic_step", { p_step: 2, p_answers: { experience: "lt1" } });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "diagnostic_incomplete:forgot_info_detail" } });
    await expect(completeDiagnostic({})).rejects.toMatchObject({ code: "diagnostic_incomplete", field: "forgot_info_detail" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "diagnostic_closed" } });
    await expect(completeDiagnostic({})).rejects.toMatchObject({ code: "diagnostic_closed" });
  });
  it("only a missing function means 'not deployed'; network errors do not", () => {
    expect(isDiagnosticNotDeployed({ code: "PGRST202" })).toBe(true);
    expect(isDiagnosticNotDeployed({ message: "Could not find the function public.get_my_teacher_diagnostic" })).toBe(true);
    expect(isDiagnosticNotDeployed({ message: "Failed to fetch" })).toBe(false);
  });
});

describe("admin analysis", () => {
  const row = (status: DiagnosticRow["status"], answers: Record<string, unknown>, name = "Ana"): DiagnosticRow =>
    ({ teacher_id: name, full_name: name, status, current_step: 5, answers, schema_version: 1, consent_accepted_at: "c", started_at: "s", updated_at: "u", completed_at: status === "completed" ? "d" : null } as DiagnosticRow);
  it("distribution counts completed diagnostics only (multi counts each selection)", () => {
    const pains = OBJECTIVE_QUESTIONS.find((q) => q.id === "pain_points")!;
    const data = distribution([row("completed", { pain_points: ["payments", "collections"] }), row("completed", { pain_points: ["payments"] }, "Bia"), row("in_progress", { pain_points: ["materials"] }, "Caio")], pains);
    expect(data.total).toBe(2);
    expect(data.items.find((i) => i.option === "payments")!.count).toBe(2);
    expect(data.items.find((i) => i.option === "materials")!.count).toBe(0);
  });
  it("CSV has one column per question and neutralizes spreadsheet formulas", () => {
    const csv = diagnosticsCsv([row("completed", { ...full, wish: "=HYPERLINK(\"x\")", pain_points: ["payments"] })], (k) => k, (q, o) => `${q}:${o}`);
    const [header, line] = csv.split("\r\n");
    expect(header.split(",")).toHaveLength(5 + 23 + 3);
    expect(line).toContain("'=HYPERLINK");
    expect(line).toContain("pain_points:payments");
  });
});

describe("quick suggestions (presentation only)", () => {
  it("add/remove a suggestion in free text without touching the teacher's own words", () => {
    expect(toggleQuickAnswer("", "Planilha")).toBe("Planilha");
    expect(toggleQuickAnswer("Planilha", "WhatsApp")).toBe("Planilha; WhatsApp");
    expect(toggleQuickAnswer("Planilha; uso também o Trello", "planilha")).toBe("uso também o Trello");
    expect(hasQuickAnswer("Planilha; WhatsApp", "whatsapp")).toBe(true);
  });
  it("only open questions get suggestions; strategic ones stay fully open", () => {
    const textIds = DIAGNOSTIC_STEPS.flatMap((s) => s.questions).filter((q) => q.type === "text").map((q) => q.id);
    for (const id of Object.keys(QUICK_ANSWERS)) expect(textIds).toContain(id);
    for (const id of ["eliminate_one", "improve", "wish"]) expect(QUICK_ANSWERS[id]).toBeUndefined();
  });
});

describe("overall progress", () => {
  it("counts every applicable question of the 5 steps and grows as answers are given or removed", () => {
    expect(diagnosticProgress({})).toEqual({ answered: 0, total: 21, percent: 0 });
    expect(diagnosticProgress({ experience: "lt1" })).toMatchObject({ answered: 1, total: 21, percent: 4 });
    expect(diagnosticProgress({ experience: "lt1", admin_control: 5 })).toMatchObject({ answered: 2 });
    expect(diagnosticProgress({ experience: "" })).toMatchObject({ answered: 0 }); // removed answer
  });
  it("follow-ups and 'Outro' count only when applicable", () => {
    expect(diagnosticProgress({ main_activity: "no" })).toMatchObject({ answered: 1, total: 22 }); // follow-up now applicable, unanswered
    expect(diagnosticProgress({ main_activity: "no", other_activity: "Tradutora" })).toMatchObject({ answered: 2, total: 22 });
    expect(diagnosticProgress({ student_info_tools: ["other"] })).toMatchObject({ answered: 0 });
    expect(diagnosticProgress({ student_info_tools: ["other"], student_info_tools_other: "Trello" })).toMatchObject({ answered: 1 });
  });
  it("shows 100% only after a confirmed completion", () => {
    expect(diagnosticProgress(full)).toMatchObject({ answered: 21, total: 21, percent: 99 });
    expect(diagnosticProgress(full, true).percent).toBe(100);
  });
});

import { supabase } from "@/lib/supabase";

/**
 * Diagnóstico Inicial das teachers (before the standard onboarding). Question ids, options and the
 * required/conditional rules mirror the database validation (teacher_diagnostic_clean/_missing);
 * the database is the authority: it cleans answers, validates completion and owns status/dates.
 * Labels live in i18n (diagnostic.q.<id>.label / .options.<value>).
 */
export type Answers = Record<string, string | string[] | number>;

type Base = { id: string; showIf?: (answers: Answers) => boolean };
export type Question =
  | (Base & { type: "single"; options: readonly string[] })
  | (Base & { type: "multi"; options: readonly string[]; otherKey: string })
  | (Base & { type: "text"; short?: boolean })
  | (Base & { type: "scale" });

export const DIAGNOSTIC_SCHEMA_VERSION = 1;
export const TEXT_MIN = 2;
export const TEXT_MAX = 1000;

export const DIAGNOSTIC_STEPS: readonly { key: string; questions: readonly Question[] }[] = [
  { key: "profile", questions: [
    { id: "experience", type: "single", options: ["lt1", "1_2", "3_5", "6_10", "gt10"] },
    { id: "main_activity", type: "single", options: ["yes", "no"] },
    { id: "other_activity", type: "text", short: true, showIf: (a) => a.main_activity === "no" },
    { id: "students", type: "single", options: ["0_5", "6_10", "11_20", "21_40", "gt40"] },
    { id: "team", type: "single", options: ["solo", "with_others"] },
  ] },
  { key: "lessons", questions: [
    { id: "student_info_tools", type: "multi", otherKey: "student_info_tools_other",
      options: ["paper", "spreadsheet", "google_calendar", "whatsapp", "notion", "app", "none", "other"] },
    { id: "payment_tracking", type: "multi", otherKey: "payment_tracking_other",
      options: ["spreadsheet", "notebook", "finance_app", "bank", "whatsapp", "memory", "other"] },
    { id: "makeup_control", type: "text" },
    { id: "admin_tools", type: "text" },
  ] },
  { key: "difficulties", questions: [
    { id: "pain_points", type: "multi", otherKey: "pain_points_other",
      options: ["schedule", "makeups", "payments", "collections", "forecast", "lesson_count", "student_info", "materials", "progress", "communication", "priorities", "other"] },
    { id: "eliminate_one", type: "text" },
    { id: "most_time", type: "text" },
    { id: "avoided_task", type: "text" },
    { id: "forgot_info", type: "single", options: ["yes", "no"] },
    { id: "forgot_info_detail", type: "text", showIf: (a) => a.forgot_info === "yes" },
  ] },
  { key: "time", questions: [
    { id: "admin_hours", type: "single", options: ["lt1", "1_2", "2_4", "4_6", "gt6"] },
    { id: "day_organization", type: "text" },
    { id: "prioritization", type: "text" },
    { id: "admin_control", type: "scale" },
  ] },
  { key: "expectations", questions: [
    { id: "business_view", type: "single", options: ["yes", "partly", "no"] },
    { id: "professionalism", type: "scale" },
    { id: "improve", type: "text" },
    { id: "wish", type: "text" },
  ] },
];

/**
 * Presentation only (no data change): quick suggestions for some open questions. Tapping one adds
 * its text to the answer, which stays free text (same storage and validation); teachers can keep
 * typing their own words. Strategic open questions (eliminate_one, improve, wish) stay fully open.
 */
export const QUICK_ANSWERS: Readonly<Record<string, readonly string[]>> = {
  makeup_control: ["calendar", "whatsapp", "notebook", "no_makeup", "charge_anyway"],
  admin_tools: ["spreadsheet", "google_calendar", "whatsapp", "notebook", "app"],
  most_time: ["scheduling", "payments", "collections", "planning", "messages"],
  avoided_task: ["collections", "finances", "planning", "reports", "none"],
  day_organization: ["calendar_app", "paper", "spreadsheet", "routine", "no_plan"],
  prioritization: ["deadlines", "lessons_first", "messages_first", "payments", "no_criteria"],
};
const QUICK_SEPARATOR = "; ";
/** Adds or removes a quick suggestion in a free-text answer (comparison ignores case/spaces). */
export function toggleQuickAnswer(text: string, suggestion: string): string {
  const parts = text.split(/;\s*/).map((part) => part.trim()).filter(Boolean);
  const exists = parts.some((part) => part.toLocaleLowerCase() === suggestion.toLocaleLowerCase());
  const next = exists ? parts.filter((part) => part.toLocaleLowerCase() !== suggestion.toLocaleLowerCase()) : [...parts, suggestion];
  return next.join(QUICK_SEPARATOR);
}
export const hasQuickAnswer = (text: string, suggestion: string) =>
  text.split(/;\s*/).some((part) => part.trim().toLocaleLowerCase() === suggestion.toLocaleLowerCase());

/** Follow-up questions shown inside their parent's block (same data, grouped visually). */
export const FOLLOW_UP_OF: Readonly<Record<string, string>> = { other_activity: "main_activity", forgot_info_detail: "forgot_info" };

const textOk = (value: unknown) => typeof value === "string" && value.trim().length >= TEXT_MIN;
export const isVisible = (question: Question, answers: Answers) => !question.showIf || question.showIf(answers);

/** Required fields still missing in a step (1–5): question ids or "<multi>_other". */
export function missingInStep(answers: Answers, step: number): string[] {
  const missing: string[] = [];
  for (const question of DIAGNOSTIC_STEPS[step - 1]?.questions ?? []) {
    if (!isVisible(question, answers)) continue;
    const value = answers[question.id];
    if (question.type === "single" && !(typeof value === "string" && question.options.includes(value))) missing.push(question.id);
    if (question.type === "multi") {
      if (!Array.isArray(value) || value.length === 0) missing.push(question.id);
      else if (value.includes("other") && !textOk(answers[question.otherKey])) missing.push(question.otherKey);
    }
    if (question.type === "text" && !textOk(value)) missing.push(question.id);
    if (question.type === "scale" && !(typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10)) missing.push(question.id);
  }
  return missing;
}

/**
 * Overall progress: every applicable question of the 5 steps (follow-ups count only while their
 * condition holds). A question counts as answered when it passes the same rules as the step
 * validation (including its "Outro" detail). 100% only after a confirmed completion.
 */
export function diagnosticProgress(answers: Answers, completed = false): { answered: number; total: number; percent: number } {
  let answered = 0;
  let total = 0;
  DIAGNOSTIC_STEPS.forEach((step, index) => {
    const missing = missingInStep(answers, index + 1);
    for (const question of step.questions) {
      if (!isVisible(question, answers)) continue;
      total += 1;
      const keys = question.type === "multi" ? [question.id, question.otherKey] : [question.id];
      if (!keys.some((key) => missing.includes(key))) answered += 1;
    }
  });
  if (completed) return { answered: total, total, percent: 100 };
  return { answered, total, percent: Math.min(99, Math.floor((answered / Math.max(1, total)) * 100)) };
}

/** Step of a question id (or of a "<multi>_other" key); 0 when unknown. */
export function stepOf(key: string): number {
  const index = DIAGNOSTIC_STEPS.findIndex((step) => step.questions.some((q) => q.id === key || (q.type === "multi" && q.otherKey === key)));
  return index + 1;
}

/**
 * Answers of one step to save: hidden conditionals and unselected "Other" details are sent empty,
 * so stale text never stays attached to an answer that no longer applies.
 */
export function stepPayload(answers: Answers, step: number): Answers {
  const payload: Answers = {};
  for (const question of DIAGNOSTIC_STEPS[step - 1]?.questions ?? []) {
    const value = answers[question.id];
    if (!isVisible(question, answers)) { payload[question.id] = ""; continue; }
    if (value !== undefined) payload[question.id] = typeof value === "string" ? value.trim().slice(0, TEXT_MAX) : value;
    if (question.type === "multi") {
      const selected = Array.isArray(value) ? value : [];
      payload[question.otherKey] = selected.includes("other") ? String(answers[question.otherKey] ?? "").trim().slice(0, TEXT_MAX) : "";
    }
  }
  return payload;
}

// ---- Database access (RPCs; the client never writes the table directly) ----

export interface MyDiagnostic { required: boolean; status: string; current_step: number; answers: Answers; consent_accepted_at: string | null }

/** PostgREST "function not found": the migration is not applied yet (diagnostic not active). */
export function isDiagnosticNotDeployed(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return e?.code === "PGRST202" || e?.code === "42883" || /could not find the function/i.test(e?.message ?? "");
}

export class DiagnosticError extends Error {
  constructor(readonly code: string, readonly field?: string) { super(code); }
}
function toDiagnosticError(error: { message?: string } | null): DiagnosticError {
  const message = error?.message ?? "";
  const incomplete = message.match(/diagnostic_incomplete:(\w+)/);
  if (incomplete) return new DiagnosticError("diagnostic_incomplete", incomplete[1]);
  const known = ["diagnostic_closed", "diagnostic_consent_required", "diagnostic_invalid_step", "not_authenticated"].find((code) => message.includes(code));
  if (known) return new DiagnosticError(known);
  const invalid = message.match(/diagnostic_invalid_answer:(\w+)/);
  if (invalid) return new DiagnosticError("diagnostic_invalid_answer", invalid[1]);
  return new DiagnosticError("generic");
}

export async function fetchMyDiagnostic(): Promise<MyDiagnostic> {
  const { data, error } = await supabase.rpc("get_my_teacher_diagnostic");
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as Partial<MyDiagnostic> | undefined;
  return { required: row?.required === true, status: row?.status ?? "not_started", current_step: Math.min(5, Math.max(1, Number(row?.current_step) || 1)),
    answers: (row?.answers ?? {}) as Answers, consent_accepted_at: row?.consent_accepted_at ?? null };
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toDiagnosticError(error);
  return data as T;
}
export const acceptDiagnosticConsent = () => call<string>("accept_teacher_diagnostic_consent");
export const saveDiagnosticStep = (nextStep: number, answers: Answers) => call<number>("save_teacher_diagnostic_step", { p_step: nextStep, p_answers: answers });
export const completeDiagnostic = (answers: Answers) => call<string>("complete_teacher_diagnostic", { p_answers: answers });

// ---- Admin analysis ----

export interface DiagnosticRow {
  teacher_id: string; full_name: string | null; status: "in_progress" | "completed"; current_step: number; answers: Answers;
  schema_version: number; consent_accepted_at: string | null; started_at: string; updated_at: string; completed_at: string | null;
}
export async function listDiagnostics(): Promise<DiagnosticRow[]> {
  const { data, error } = await supabase.rpc("list_teacher_diagnostics");
  if (error) throw error;
  return (data ?? []) as DiagnosticRow[];
}

export const OBJECTIVE_QUESTIONS = DIAGNOSTIC_STEPS.flatMap((step) => step.questions)
  .filter((q): q is Extract<Question, { type: "single" | "multi" | "scale" }> => q.type !== "text");

/** Count of each option (scales: 0–10) among completed diagnostics; multi counts each selection. */
export function distribution(rows: readonly DiagnosticRow[], question: (typeof OBJECTIVE_QUESTIONS)[number]) {
  const done = rows.filter((row) => row.status === "completed");
  const options = question.type === "scale" ? Array.from({ length: 11 }, (_, i) => String(i)) : [...question.options];
  const counts = new Map(options.map((option) => [option, 0]));
  for (const row of done) {
    const value = row.answers[question.id];
    const values = Array.isArray(value) ? value : value === undefined || value === "" ? [] : [String(value)];
    for (const v of values) if (counts.has(v)) counts.set(v, counts.get(v)! + 1);
  }
  return { total: done.length, items: options.map((option) => ({ option, count: counts.get(option)! })) };
}

/** CSV with one column per question (and "Other" details), formula-injection safe. */
export function diagnosticsCsv(rows: readonly DiagnosticRow[], label: (key: string) => string, optionLabel: (questionId: string, option: string) => string): string {
  const columns = DIAGNOSTIC_STEPS.flatMap((step) => step.questions.flatMap((q) => (q.type === "multi" ? [q.id, q.otherKey] : [q.id])));
  const cell = (value: unknown) => {
    let text = value === undefined || value === null ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = [label("teacher"), label("status"), label("consent"), label("started"), label("completed"), ...columns.map((c) => label(`q.${c}`))];
  const lines = rows.map((row) => {
    const values = columns.map((column) => {
      const value = row.answers[column];
      const question = OBJECTIVE_QUESTIONS.find((q) => q.id === column);
      if (Array.isArray(value)) return value.map((v) => optionLabel(column, v)).join("; ");
      if (question && question.type === "single" && typeof value === "string" && value) return optionLabel(column, value);
      return value;
    });
    return [row.full_name ?? "", label(`statusValue.${row.status}`), row.consent_accepted_at ?? "", row.started_at, row.completed_at ?? "", ...values].map(cell).join(",");
  });
  return [header.map(cell).join(","), ...lines].join("\r\n");
}

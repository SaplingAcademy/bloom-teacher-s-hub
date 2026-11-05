import { beforeEach, describe, expect, it, vi } from "vitest";
import { conversionLanguageOptions, leadToConversionDraft } from "@/lib/lead-conversion";
import { getCatalogSelectOptions, normalizeCatalogOptions } from "@/lib/catalog-options";

const calls = vi.hoisted(() => ({ rpc: vi.fn(), insertSchedules: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: calls.rpc } }));
vi.mock("@/lib/calendar-sync", () => ({ syncStudentSchedulesToSupabaseEvents: calls.sync }));
vi.mock("@/lib/student-schedules", () => ({ insertStudentSchedules: calls.insertSchedules }));
import { convertLeadToStudentAutomation } from "@/lib/automation-engine";

const lead = { id: "lead-1", teacher_id: "teacher-1", full_name: "Ana", stage: "Proposta enviada" };
const params = { leadId: lead.id, teacherId: lead.teacher_id, fullName: lead.full_name };

beforeEach(() => {
  vi.clearAllMocks();
  calls.rpc.mockResolvedValue({ data: { success: true, student_id: "student-1" }, error: null });
  calls.insertSchedules.mockResolvedValue([{ id: "schedule-1" }]);
});

describe("Lead conversion pedagogy", () => {
  it("starts empty without English/A1 or a package default", () => {
    expect(leadToConversionDraft(lead)).toMatchObject({ language_studied: "", level: "", focus: "", modality: "", package_id: "" });
  });
  it("copies personal, commercial and custom pedagogical values without altering the lead", () => {
    const original = { ...lead, email: "ana@example.test", phone: "11999999999", language_studied: "Korean", level: "custom-level", focus: "custom-focus", modality: "custom-mode", package_id: "package-1", notes: "Existing notes" };
    const before = { ...original };
    expect(leadToConversionDraft(original)).toMatchObject({ full_name: "Ana", email: original.email, phone: original.phone, language_studied: "Korean", level: "custom-level", focus: "custom-focus", modality: "custom-mode", package_id: "package-1", notes: "Existing notes" });
    expect(original).toEqual(before);
  });
  it("retains an unconfigured historical language without adding defaults", () => {
    expect(conversionLanguageOptions(["Korean"], "Latim legado")).toEqual(["Korean", "Latim legado"]);
    expect(conversionLanguageOptions([], "")).toEqual([]);
  });
  it("keeps archived and unknown historical values while allowing active custom selections", () => {
    const catalog = normalizeCatalogOptions({ levels: [{ id: "old-id", label: "Archived", active: false }, { id: "new-id", label: "Custom", active: true }] });
    expect(getCatalogSelectOptions(catalog, "levels", "old-id").map((o) => o.id)).toEqual(["new-id", "old-id"]);
    expect(getCatalogSelectOptions(catalog, "levels", "Legado desconhecido").map((o) => o.id)).toEqual(["new-id", "Legado desconhecido"]);
  });
  it("passes explicit NULL pedagogy to the single transactional RPC", async () => {
    expect(await convertLeadToStudentAutomation(params)).toEqual({ success: true, studentId: "student-1" });
    expect(calls.rpc).toHaveBeenCalledTimes(1);
    expect(calls.rpc).toHaveBeenCalledWith("convert_lead_to_student", expect.objectContaining({ p_lead_id: "lead-1", p_teacher_id: "teacher-1", p_language_studied: null, p_level: null, p_focus: null, p_modality: null, p_package_id: null }));
  });
  it("sends teacher changes as stable IDs and blank choices as NULL, never labels", async () => {
    await convertLeadToStudentAutomation({ ...params, languageStudied: "Japanese", level: "custom-level", focus: "", modality: "custom-mode", packageId: "package-1" });
    expect(calls.rpc).toHaveBeenCalledWith("convert_lead_to_student", expect.objectContaining({ p_language_studied: "Japanese", p_level: "custom-level", p_focus: null, p_modality: "custom-mode", p_package_id: "package-1" }));
  });
  it("sends legacy values literally rather than rewriting historical IDs", async () => {
    await convertLeadToStudentAutomation({ ...params, level: "A1", focus: "General English", modality: "Presencial legado" });
    expect(calls.rpc).toHaveBeenCalledWith("convert_lead_to_student", expect.objectContaining({ p_level: "A1", p_focus: "General English", p_modality: "Presencial legado" }));
  });
});

describe("Conversion transaction boundary and retries", () => {
  const schedules = [{ weekday: "Monday", startTime: "10:00", duration: 60 }];
  it("does not recreate schedules/calendar for an already-converted lead", async () => {
    calls.rpc.mockResolvedValue({ data: { success: true, already_converted: true, student_id: "existing-student" }, error: null });
    expect(await convertLeadToStudentAutomation({ ...params, schedules })).toEqual({ success: true, studentId: "existing-student" });
    expect(calls.insertSchedules).not.toHaveBeenCalled();
    expect(calls.sync).not.toHaveBeenCalled();
  });
  it("preserves the saved student's association during first conversion", async () => {
    await convertLeadToStudentAutomation({ ...params, schedules });
    expect(calls.insertSchedules).toHaveBeenCalledWith("student-1", expect.any(Array));
    expect(calls.sync).toHaveBeenCalledWith("student-1", "teacher-1", "Ana", undefined, undefined, "Private", [{ id: "schedule-1" }]);
  });
  it("does not run schedule writes when the RPC rejects the conversion", async () => {
    calls.rpc.mockResolvedValue({ data: { success: false, error: "Conversion rolled back" }, error: null });
    expect(await convertLeadToStudentAutomation({ ...params, schedules })).toEqual({ success: false, error: "Conversion rolled back" });
    expect(calls.insertSchedules).not.toHaveBeenCalled();
  });
});
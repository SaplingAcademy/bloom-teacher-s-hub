import { beforeEach, describe, expect, it, vi } from "vitest";
const { query, client, savePlans } = vi.hoisted(() => {
  const query: Record<string, any> = {};
  for (const method of ["eq", "select", "in", "insert"]) query[method] = vi.fn(() => query);
  query.then = (resolve: (result: unknown) => void) => resolve({ data: [{ id: "event-ana", student_id: "ana", lesson_number: 4 }, { id: "event-bia", student_id: "bia", lesson_number: 7 }], error: null });
  return { query, client: { from: vi.fn(() => query) }, savePlans: vi.fn(async () => ({ success: true })) };
});
vi.mock("@/lib/supabase", () => ({ supabase: client }));
vi.mock("@/lib/lesson-plans", () => ({ saveLessonPlans: savePlans }));
import { lessonDuration, manualLessonRows, saveManualLessons, ManualLessonPlanError, manualLessonErrorKey } from "@/lib/manual-lesson-scheduling";
const input = {
  students: [{ id: "ana", full_name: "Ana" }, { id: "bia", full_name: "Bia" }],
  date: "2026-10-20", startTime: "10:00", endTime: "11:15", type: "Private" as const,
  level: "B2" as const, focus: "Conversation" as const, mode: "Online" as const,
  link: "https://meet.example/lesson", tags: ["conversation", "makeup", "exam", "Preparação IELTS"],
};
beforeEach(() => { vi.clearAllMocks(); savePlans.mockResolvedValue({ success: true }); });
describe("manual one-time lessons", () => {
  it("keeps two student identities and creates no class or recurring schedule", async () => {
    await saveManualLessons("teacher", input);
    expect(query.insert).toHaveBeenCalledWith([
      expect.objectContaining({ teacher_id: "teacher", event_type: "individual", student_id: "ana", student_name: "Ana", class_id: null, schedule_id: null, class_schedule_id: null, is_recurring: false }),
      expect.objectContaining({ teacher_id: "teacher", event_type: "individual", student_id: "bia", student_name: "Bia", class_id: null, schedule_id: null, class_schedule_id: null, is_recurring: false }),
    ]);
    expect(client.from.mock.calls.map(call => call[0])).toEqual(["lesson_plans", "calendar_events"]);
    expect(savePlans).toHaveBeenCalledWith("teacher", [
      expect.objectContaining({ event_id: "event-ana", student_id: "ana", lesson_number: 5, duration: 75 }),
      expect.objectContaining({ event_id: "event-bia", student_id: "bia", lesson_number: 8, duration: 75 }),
    ]);
  });
  it("requires at least one existing student", () => {
    expect(() => manualLessonRows("teacher", { ...input, students: [] })).toThrow("requiredStudents");
  });
  it("calculates 75 minutes from 10:00 to 11:15", () => {
    expect(lessonDuration("10:00", "11:15")).toBe(75);
  });
  it("rejects end times at or before the start", () => {
    expect(() => lessonDuration("10:00", "10:00")).toThrow("invalidInterval");
    expect(() => lessonDuration("10:00", "09:59")).toThrow("invalidInterval");
  });
  it("stores multiple canonical and custom tags without translating values", () => {
    expect(manualLessonRows("teacher", input)[0].lesson_tags).toEqual(["conversation", "makeup", "exam", "Preparação IELTS"]);
  });
  it("omits the optional column for untagged scheduling before manual SQL", () => {
    expect(manualLessonRows("teacher", { ...input, tags: [] })[0]).not.toHaveProperty("lesson_tags");
  });
  it("deduplicates student selection instead of creating duplicate occurrences", () => {
    expect(manualLessonRows("teacher", { ...input, students: [input.students[0], input.students[0]] })).toHaveLength(1);
  });
  it("retries failed plans against the saved event IDs without another insertion", async () => {
    savePlans.mockResolvedValueOnce({ success: false });
    let failure: ManualLessonPlanError | undefined;
    try { await saveManualLessons("teacher", input); } catch (error) { if (error instanceof ManualLessonPlanError) failure = error; }
    expect(failure?.events.map(event => event.id)).toEqual(["event-ana", "event-bia"]);
    await saveManualLessons("teacher", input, failure?.events);
    expect(query.insert).toHaveBeenCalledTimes(1);
    expect(savePlans).toHaveBeenCalledTimes(2);
    expect(savePlans.mock.calls[1]).toEqual(savePlans.mock.calls[0]);
  });
  it("reports missing tag schema rather than dropping selected tags", () => {
    expect(manualLessonErrorKey({ code: "PGRST204", message: "Could not find the lesson_tags column" })).toBe("tagsSchemaRequired");
  });
});
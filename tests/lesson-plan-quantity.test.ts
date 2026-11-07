import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { generateLessonPlanOccurrences } from "../src/lib/lesson-plan-sync";
import { generateOccurrences } from "../src/lib/lesson-plans";
import { InsufficientLessonPeriodError, lessonPlanQuantity, requireLessonQuantity, validateLessonPeriod } from "../src/lib/lesson-plan-quantity";
import type { TeacherTimeOff } from "../src/lib/time-off-engine";

const monday = { weekday: "Monday", startTime: "10:15", endTime: "11:00", duration: 45 };
const wednesday = { weekday: "Wednesday", startTime: "14:00", duration: 90 };
const block = (startDate: string, endDate: string, type: TeacherTimeOff["type"]): TeacherTimeOff => ({
  id: startDate, teacherId: "t", startDate, endDate, type, createdAt: "2026-01-01",
});
const generators = {
  student: (start: string, end: string, slots = [monday], off: TeacherTimeOff[] = [], count = 20) =>
    generateLessonPlanOccurrences(start, slots, count, "s", "t", off, end).map((l) => l.scheduled_date),
  class: (start: string, end: string, slots = [monday], off: TeacherTimeOff[] = [], count = 20) =>
    generateOccurrences(start, slots, count, off, null, end).map((l) => l.date),
};
for (const [kind, generate] of Object.entries(generators)) describe(`${kind}: exact period quantity`, () => {
  it("includes both endpoints and accepts exactly 20 lessons", () => {
    const eligible = generate("2026-01-05", "2026-05-18");
    expect(eligible).toHaveLength(20);
    expect(eligible[0]).toBe("2026-01-05"); expect(eligible.at(-1)).toBe("2026-05-18");
    expect(requireLessonQuantity(eligible, 20)).toHaveLength(20);
  });
  it("counts the full period but selects only the requested 20", () => {
    const eligible = generate("2026-01-05", "2026-06-01");
    expect(lessonPlanQuantity(eligible, 20)).toEqual({ requested: 20, possible: 22, missing: 0 });
    expect(requireLessonQuantity(eligible, 20).at(-1)).toBe("2026-05-18");
  });
  it("20 requested and 17 possible yields 3 missing and rejects", () => {
    const eligible = generate("2026-01-05", "2026-04-27");
    expect(lessonPlanQuantity(eligible, 20)).toEqual({ requested: 20, possible: 17, missing: 3 });
    expect(() => requireLessonQuantity(eligible, 20)).toThrow(InsufficientLessonPeriodError);
  });
  it("zero eligible dates yields 20 missing", () => {
    expect(lessonPlanQuantity(generate("2026-01-06", "2026-01-11"), 20)).toEqual({ requested: 20, possible: 0, missing: 20 });
  });
  it("registered holidays, vacations and recesses reduce real dates inclusively", () => {
    const eligible = generate("2026-01-05", "2026-02-02", [monday], [
      block("2026-01-05", "2026-01-05", "Feriado"), block("2026-01-12", "2026-01-19", "Férias"),
      block("2026-01-26", "2026-01-26", "Recesso"),
    ]);
    expect(eligible).toEqual(["2026-02-02"]);
  });
  it("counts 1, 2 and 3 weekly slots including two different slots on Monday", () => {
    const extra = { ...monday, startTime: "12:00", endTime: "12:45" };
    expect(generate("2026-01-05", "2026-01-18", [monday])).toHaveLength(2);
    expect(generate("2026-01-05", "2026-01-18", [monday, { ...wednesday, endTime: "15:30" }])).toHaveLength(4);
    expect(generate("2026-01-05", "2026-01-18", [extra, monday, { ...wednesday, endTime: "15:30" }])).toHaveLength(6);
  });
  it("identical date/start blocks never inflate the quantity", () => {
    expect(generate("2026-01-05", "2026-01-05", [monday, { ...monday }])).toHaveLength(1);
  });
  it("a bounded period longer than 730 days is scanned to its actual end", () => {
    expect(generate("2026-01-05", "2028-01-10", [monday], [], 1)).toHaveLength(106);
  });
});
describe("existing unbounded/advisory semantics", () => {
  it("still selects just the requested count with no end date", () => {
    expect(generateOccurrences("2026-01-05", [monday], 20)).toHaveLength(20);
    expect(generateLessonPlanOccurrences("2026-01-05", [monday], 20, "s", "t")).toHaveLength(20);
  });
  it("rejects when the existing safety ceiling leaves fewer lessons", () => {
    const off = [block("2026-01-05", "2029-01-05", "Férias")];
    expect(() => requireLessonQuantity(generateOccurrences("2026-01-05", [monday], 20, off), 20)).toThrow(InsufficientLessonPeriodError);
  });
  it("working hours, weekly days off and rest remain advisory", () => {
    const availability = { teacherId: "t", isConfigured: true, fetchedAt: 0, days: [], restBlocks: [], timeOff: [], timezone: "America/Sao_Paulo", defaultDuration: 45 };
    expect(generateOccurrences("2026-01-05", [monday], 2, [], availability)).toHaveLength(2);
  });
  it.each(["2026-02-30", "2026-01-01"])("rejects an invalid/inverted end date %s", (end) => {
    expect(() => validateLessonPeriod("2026-01-05", end)).toThrow();
  });
});
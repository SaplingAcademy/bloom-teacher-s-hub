import { describe, expect, it } from "bun:test";
import { coursePeriodFromStudent, initialLessonPlanPeriod, clipToPeriod } from "../src/lib/lesson-plan-period";

describe("lesson plan reuses the student's course period", () => {
  it("start and end -> both prefilled", () => {
    const c = coursePeriodFromStudent({ course_start_date: "2026-10-01", course_end_date: "2027-03-31" });
    expect(initialLessonPlanPeriod(c)).toEqual({ startDate: "2026-10-01", endDate: "2027-03-31" });
  });
  it("only start -> only start prefilled", () => {
    expect(initialLessonPlanPeriod(coursePeriodFromStudent({ course_start_date: "2026-10-01", course_end_date: null })))
      .toEqual({ startDate: "2026-10-01", endDate: "" });
  });
  it("no dates -> fields stay empty for manual input (no today substitution)", () => {
    expect(initialLessonPlanPeriod(coursePeriodFromStudent({}))).toEqual({ startDate: "", endDate: "" });
  });
  it("manual change inside the plan is respected", () => {
    let period = initialLessonPlanPeriod({ startDate: "2026-10-01", endDate: "2027-03-31" });
    period = { ...period, startDate: "2026-11-01" };
    const items = [{ scheduled_date: "2027-03-30" }, { scheduled_date: "2027-04-02" }];
    expect(clipToPeriod(items, period.endDate)).toEqual([{ scheduled_date: "2027-03-30" }]);
    expect(period.startDate).toBe("2026-11-01");
  });
  it("switching students replaces dates instead of keeping the previous ones", () => {
    const a = initialLessonPlanPeriod(coursePeriodFromStudent({ course_start_date: "2026-10-01", course_end_date: "2027-03-31" }));
    const b = initialLessonPlanPeriod(coursePeriodFromStudent({ course_start_date: "2026-12-01" }));
    expect(a.endDate).toBe("2027-03-31");
    expect(b).toEqual({ startDate: "2026-12-01", endDate: "" });
  });
});

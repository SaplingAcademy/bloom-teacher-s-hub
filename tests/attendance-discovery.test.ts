import { describe, expect, test } from "bun:test";
import { buildAttendanceItems } from "../src/lib/daily-priorities";

const today = "2026-10-20";
const row = (p: any) => ({ id: "e1", event_type: "individual", student_id: "s1", class_id: null, student_name: "Ana", date: "2026-10-19", start_time: "10:00", end_time: "11:00", ...p });

describe("attendance discovery from attendance_recorded=false rows", () => {
  test("past individual lesson becomes a normal priority", () => {
    const [i] = buildAttendanceItems([row({})], today, "09:00");
    expect(i.urgency).toBe("today");
    expect(i.title).toBe("Ana");
  });
  test("more than 5 days overdue is critical, old ones kept", () => {
    expect(buildAttendanceItems([row({ date: "2026-10-14" })], today, "09:00")[0].urgency).toBe("critical");
    expect(buildAttendanceItems([row({ date: "2025-01-01" })], today, "09:00")).toHaveLength(1);
  });
  test("lesson later today is not yet a priority", () => {
    expect(buildAttendanceItems([row({ date: today })], today, "10:30")).toHaveLength(0);
    expect(buildAttendanceItems([row({ date: today })], today, "11:00")).toHaveLength(1);
  });
  test("custom events and orphan occurrences are excluded", () => {
    expect(buildAttendanceItems([row({ event_type: "custom" }), row({ student_id: null }), row({ event_type: "class", class_id: null })], today, "09:00")).toHaveLength(0);
  });
  test("class occurrence yields one item titled with class name", () => {
    const items = buildAttendanceItems([row({ event_type: "class", student_id: null, class_id: "c1", classes: { name: "B1" } })], today, "09:00");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("B1");
    expect(items[0].ref.classId).toBe("c1");
  });
});

import { describe, expect, test } from "bun:test";
import {
  normalizeMeetingUrl, planScheduleDiff, planEventReconcile, rowToFormInput, findInvalidMeetingUrl, formInputToPayload,
} from "../src/lib/student-schedules";

const base = { weekday: "Monday", startTime: "09:00", duration: 60, deliveryMode: "Online" as const, locationLink: "" };

describe("normalizeMeetingUrl", () => {
  test("empty → null", () => expect(normalizeMeetingUrl("  ")).toEqual({ ok: true, value: null }));
  test("keeps http and https", () => {
    expect(normalizeMeetingUrl("http://zoom.us/j/1").value).toBe("http://zoom.us/j/1");
    expect(normalizeMeetingUrl("https://meet.google.com/abc").value).toBe("https://meet.google.com/abc");
  });
  test("adds https to bare host", () => expect(normalizeMeetingUrl("meet.google.com/abc").value).toBe("https://meet.google.com/abc"));
  test("rejects invalid", () => {
    expect(normalizeMeetingUrl("sala 3").ok).toBe(false);
    expect(normalizeMeetingUrl("ftp://x.com").ok).toBe(false);
    expect(normalizeMeetingUrl("javascript:alert(1)").ok).toBe(false);
    expect(findInvalidMeetingUrl([base, { ...base, locationLink: "foo" }])).toBe(1);
  });
});

describe("planScheduleDiff", () => {
  test("update by id, insert new, delete removed; same weekday allowed", () => {
    const diff = planScheduleDiff(["a", "b"], [
      { ...base, id: "a", locationLink: "https://zoom.us/j/1" },
      { ...base, startTime: "18:00" },
    ]);
    expect(diff.toUpdate.map((u) => u.id)).toEqual(["a"]);
    expect(diff.toUpdate[0].payload.meeting_url).toBe("https://zoom.us/j/1");
    expect(diff.toInsert).toHaveLength(1);
    expect(diff.toInsert[0].weekday).toBe("Monday");
    expect(diff.toDeleteIds).toEqual(["b"]);
  });
  test("payload carries duration, mode and end time", () => {
    const p = formInputToPayload({ ...base, duration: 90, deliveryMode: "In person" }, 0);
    expect(p).toMatchObject({ start_time: "09:00:00", end_time: "10:30:00", duration_minutes: 90, delivery_mode: "In person", meeting_url: null });
  });
});

describe("rowToFormInput legacy compatibility", () => {
  test("NULL columns load without error", () => {
    const f = rowToFormInput({ id: "x", student_id: "s", weekday: "Tuesday", start_time: "10:00:00", end_time: "10:45:00", meeting_url: null, delivery_mode: null, duration_minutes: null });
    expect(f).toMatchObject({ duration: 45, deliveryMode: "Online", locationLink: "", startTime: "10:00" });
  });
});

describe("planEventReconcile", () => {
  test("updates open matches in place, keeps completed, deletes orphans, inserts missing", () => {
    const plan = planEventReconcile(
      [
        { id: "e1", date: "2026-10-12", status: "Scheduled", schedule_id: "a" },
        { id: "e2", date: "2026-10-19", status: "Completed", schedule_id: "a" },
        { id: "e3", date: "2026-10-12", status: "Scheduled", schedule_id: "removed" },
        { id: "e4", date: "2026-10-13", status: "Scheduled", schedule_id: null, is_recurring: false },
      ],
      [
        { scheduleId: "a", date: "2026-10-12" },
        { scheduleId: "a", date: "2026-10-19" },
        { scheduleId: "b", date: "2026-10-12" },
      ],
    );
    expect(plan.updateIds).toEqual([{ id: "e1", scheduleId: "a" }]);
    expect(plan.deleteIds).toEqual(["e3"]);
    expect(plan.insert).toEqual([{ scheduleId: "b", date: "2026-10-12" }]);
  });
});

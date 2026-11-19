import { describe, expect, it } from "vitest";
import { nextTodayLesson, zonedNow } from "../src/lib/next-today-lesson";
import type { CalendarEvent } from "../src/lib/calendar-sync";

const ev = (id: string, date: string, startTime: string) => ({ id, date, startTime }) as CalendarEvent;
// 2026-11-19 14:30 in America/Sao_Paulo (UTC-3) = 17:30 UTC.
const NOW = new Date("2026-11-19T17:30:00Z");

describe("nextTodayLesson", () => {
  it("uses the America/Sao_Paulo date and time", () => {
    expect(zonedNow(NOW)).toEqual({ date: "2026-11-19", time: "14:30" });
    // 01:00 UTC on the 20th is still the 19th in São Paulo.
    expect(zonedNow(new Date("2026-11-20T01:00:00Z"))).toEqual({ date: "2026-11-19", time: "22:00" });
  });

  it("skips past lessons and returns the earliest future one", () => {
    const events = [ev("a", "2026-11-19", "09:00"), ev("c", "2026-11-19", "18:00"), ev("b", "2026-11-19", "15:00")];
    expect(nextTodayLesson(events, NOW)?.id).toBe("b");
  });

  it("treats a lesson starting this minute as already started", () => {
    expect(nextTodayLesson([ev("a", "2026-11-19", "14:30"), ev("b", "2026-11-19", "14:31")], NOW)?.id).toBe("b");
  });

  it("returns null when every lesson today has passed or belongs to another day", () => {
    expect(nextTodayLesson([ev("a", "2026-11-19", "08:00"), ev("b", "2026-11-18", "20:00")], NOW)).toBeNull();
  });

  it("advances as time passes without new data", () => {
    const events = [ev("a", "2026-11-19", "15:00"), ev("b", "2026-11-19", "16:00")];
    expect(nextTodayLesson(events, NOW)?.id).toBe("a");
    expect(nextTodayLesson(events, new Date("2026-11-19T18:00:30Z"))?.id).toBe("b");
    expect(nextTodayLesson(events, new Date("2026-11-19T19:00:00Z"))).toBeNull();
  });
});

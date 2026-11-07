import { describe, expect, it } from "vitest";
import { calendarGridHours, calendarInitialHour } from "../src/lib/calendar-grid";

describe("Calendar full-day endpoint", () => {
  it("always includes every hour from midnight through the entire 23h row without events or availability", () => {
    expect(calendarGridHours()).toEqual(Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`));
  });
});

describe("Calendar initial viewport", () => {
  it("uses the earliest enabled start, including before 08h, without mutating availability", () => {
    const days = Object.freeze([Object.freeze({ enabled: false, startTime: "00:00" }), Object.freeze({ enabled: true, startTime: "10:00" }), Object.freeze({ enabled: true, startTime: "05:45:00" })]);
    expect(calendarInitialHour(days)).toBe("05:00");
  });
  it("falls back to 08h when availability is absent, disabled or invalid", () => {
    expect(calendarInitialHour([])).toBe("08:00");
    expect(calendarInitialHour([{ enabled: false, startTime: "03:00" }])).toBe("08:00");
    expect(calendarInitialHour([{ enabled: true, startTime: "24:00" }, { enabled: true, startTime: "07:99" }, { enabled: true, startTime: "" }])).toBe("08:00");
  });
  it("accepts both midnight and night availability without imposing an 08h–21h limit", () => {
    expect(calendarInitialHour([{ enabled: true, startTime: "00:15" }])).toBe("00:00");
    expect(calendarInitialHour([{ enabled: true, startTime: "23:15" }])).toBe("23:00");
  });
});
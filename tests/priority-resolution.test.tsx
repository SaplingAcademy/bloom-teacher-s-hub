// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  saveAttendanceRecords: vi.fn(),
  fetchAttendanceForEvents: vi.fn(),
  fetchCalendarClassAttendance: vi.fn(),
  saveHomeworkStatus: vi.fn(),
  homeworkRow: { event_id: "ev-hw", homework: "Workbook p. 12", homework_posted: null as boolean | null },
  priorities: { items: [] as any[], failed: [] as string[] },
}));

vi.mock("@/lib/lesson-plans", () => ({
  ATTENDANCE_STATUSES: ["present", "absent", "late", "excused"],
  saveAttendanceRecords: mocks.saveAttendanceRecords,
  fetchAttendanceForEvents: mocks.fetchAttendanceForEvents,
}));
vi.mock("@/lib/calendar-class-attendance", () => ({ fetchCalendarClassAttendance: mocks.fetchCalendarClassAttendance }));
vi.mock("@/lib/homework-status", async (orig) => ({
  ...(await orig<typeof import("../src/lib/homework-status")>()),
  saveHomeworkStatus: mocks.saveHomeworkStatus,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const chain: any = { select: () => chain, eq: () => chain, single: async () => ({ data: mocks.homeworkRow, error: null }) };
      return chain;
    },
  },
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => k }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/use-daily-priorities-query", () => ({
  useDailyPrioritiesQuery: () => ({ data: mocks.priorities, isLoading: false, isError: false }),
}));

import { saveRosterAttendance, markHomeworkSent } from "../src/lib/priority-resolution";
import { DailyPrioritiesCard } from "../src/components/bloom/DailyPrioritiesCard";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.clearAllMocks();
});
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const attendanceItem = {
  id: "attendance:ev-class", category: "attendance", urgency: "critical", reason: "attendance_missing", title: "Turma B1",
  params: { date: "2026-11-09", time: "10:00", daysLate: 1 }, date: "2026-11-09", time: "10:00:00",
  ref: { eventId: "ev-class", classId: "c1" }, action: { route: "/students", params: { classId: "c1", eventId: "ev-class" } },
};
const homeworkItem = {
  id: "homework:ev-hw", category: "task", urgency: "critical", reason: "homework_not_posted", title: "Ana",
  params: { date: "2026-11-08", lesson: 4 }, date: "2026-11-08",
  ref: { eventId: "ev-hw", studentId: "s1" }, action: { route: "/students", params: { studentId: "s1", tab: "Lessons" } },
};
const classAttendance = {
  status: "Scheduled",
  members: [{ student_id: "s1", student_name: "Ana" }, { student_id: "s2", student_name: "Bruno" }],
  records: [],
};

function renderCard() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  act(() => mounted.render(createElement(QueryClientProvider, { client }, createElement(DailyPrioritiesCard, { teacherId: "t-1" }))));
  return invalidate;
}
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const byText = (text: string) => Array.from(document.querySelectorAll("button, [role=button]")).find((b) => b.textContent?.includes(text));

describe("priority resolution reuses the canonical save flows", () => {
  it("class attendance saves only expected students through saveAttendanceRecords and blocks cancelled lessons", async () => {
    mocks.fetchCalendarClassAttendance.mockResolvedValue({ ...classAttendance, members: [classAttendance.members[0]] });
    const roster = { eventId: "ev-class", classId: "c1", entries: [
      { studentId: "s1", name: "Ana", status: null, notes: "keep" },
      { studentId: "s2", name: "Bruno", status: null, notes: "" },
    ] };
    await saveRosterAttendance("t-1", roster, { s1: "present", s2: "absent" });
    expect(mocks.saveAttendanceRecords).toHaveBeenCalledWith("t-1", "ev-class", [{ student_id: "s1", status: "present", notes: "keep" }]);

    mocks.fetchCalendarClassAttendance.mockResolvedValue({ ...classAttendance, status: "Cancelled" });
    await expect(saveRosterAttendance("t-1", roster, { s1: "present" })).rejects.toThrow("Cancelled occurrence");
  });

  it("homework is recorded as sent with saveHomeworkStatus('posted'), never a fake publication", async () => {
    mocks.saveHomeworkStatus.mockResolvedValue(true);
    await markHomeworkSent("t-1", "ev-hw");
    expect(mocks.saveHomeworkStatus).toHaveBeenCalledWith("t-1", "ev-hw", "posted");
    mocks.saveHomeworkStatus.mockResolvedValue(null);
    await expect(markHomeworkSent("t-1", "ev-hw")).rejects.toThrow();
  });
});

describe("DailyPrioritiesCard inline resolution", () => {
  it("records per-student class attendance inline and re-reads priorities after saving", async () => {
    mocks.priorities = { items: [attendanceItem], failed: [] };
    mocks.fetchCalendarClassAttendance.mockResolvedValue(classAttendance);
    const invalidate = renderCard();
    click(byText("Turma B1"));
    await flush();
    const radios = (name: string) => Array.from(document.querySelectorAll(`[role=radiogroup][aria-label="${name}"] [role=radio]`));
    expect(radios("Ana").map((r) => r.textContent)).toEqual([
      "today.resolve.status_present", "today.resolve.status_late", "today.resolve.status_absent", "today.resolve.status_excused",
    ]);
    click(radios("Ana")[0]);
    click(radios("Bruno")[2]);
    click(byText("today.resolve.saveAttendance"));
    await flush();
    expect(mocks.saveAttendanceRecords).toHaveBeenCalledWith("t-1", "ev-class", [
      { student_id: "s1", status: "present", notes: "" },
      { student_id: "s2", status: "absent", notes: "" },
    ]);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["daily-priorities", "t-1"] });
  });

  it("a failed save keeps the card open with the selections and shows an error, without refreshing", async () => {
    mocks.priorities = { items: [attendanceItem], failed: [] };
    mocks.fetchCalendarClassAttendance.mockResolvedValue(classAttendance);
    mocks.saveAttendanceRecords.mockRejectedValueOnce(new Error("network"));
    const invalidate = renderCard();
    click(byText("Turma B1"));
    await flush();
    const ana = () => document.querySelectorAll('[role=radiogroup][aria-label="Ana"] [role=radio]')[1];
    click(ana());
    click(byText("today.resolve.saveAttendance"));
    await flush();
    expect(document.querySelector("[role=alert]")?.textContent).toBe("today.resolve.attendanceError");
    expect(ana().getAttribute("aria-checked")).toBe("true");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("shows planned homework with its recorded status and marks it as sent", async () => {
    mocks.priorities = { items: [homeworkItem], failed: [] };
    mocks.saveHomeworkStatus.mockResolvedValue(true);
    const invalidate = renderCard();
    click(byText("Ana"));
    await flush();
    expect(document.body.textContent).toContain("Workbook p. 12");
    expect(document.body.textContent).toContain("today.resolve.homeworkStatus_unrecorded");
    expect(document.body.textContent).toContain("today.resolve.homeworkNote");
    click(byText("today.resolve.markSent"));
    await flush();
    expect(mocks.saveHomeworkStatus).toHaveBeenCalledWith("t-1", "ev-hw", "posted");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["daily-priorities", "t-1"] });
  });
});

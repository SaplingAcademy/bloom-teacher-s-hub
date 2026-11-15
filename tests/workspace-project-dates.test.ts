import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), insert: vi.fn(), update: vi.fn(), profile: { data: null as unknown, error: null as unknown }, tables: [] as string[] }));
vi.mock("@/lib/supabase", () => {
  const chain = (table: string) => {
    mocks.tables.push(table);
    const self: any = {
      select: () => self, eq: () => self,
      insert: (row: unknown) => { mocks.insert(row); return self; },
      update: (patch: unknown) => { mocks.update(patch); return self; },
      single: async () => ({ data: { id: "p" }, error: null }),
      maybeSingle: async () => (table === "profiles" ? mocks.profile : { data: { id: "p" }, error: null }),
    };
    return self;
  };
  return { supabase: { auth: { getUser: mocks.getUser }, from: chain } };
});
import { applyDetailCommand, formatCalendarDate, isCalendarDate, localCalendarDate, prepareProjectDates, type ProjectDetail } from "../src/lib/workspace-projects";
import { persistDetailCommand, persistListCommand, teacherToday } from "../src/lib/workspace-projects-data";

const P = "aaaaaaaa-1111-4111-8111-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: "teacher" } }, error: null });
  mocks.profile = { data: { timezone: "Asia/Tokyo" }, error: null };
});

describe("project dates (calendar days)", () => {
  it("accepts only real YYYY-MM-DD days", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("15/11/2026")).toBe(false);
  });
  it("keeps the database rule: start required, end optional and not before start", () => {
    expect(prepareProjectDates("2026-11-15", null)).toEqual({ start_date: "2026-11-15", end_date: null });
    expect(prepareProjectDates("2026-11-15", "")).toEqual({ start_date: "2026-11-15", end_date: null });
    expect(prepareProjectDates("2026-11-15", "2026-11-15").end_date).toBe("2026-11-15");
    expect(() => prepareProjectDates("2026-11-15", "2026-11-14")).toThrow("end_before_start");
    expect(() => prepareProjectDates("", null)).toThrow("invalid_start_date");
  });
  it("computes today in the IANA zone, falling back to the browser zone when invalid", () => {
    const instant = new Date("2026-11-02T20:00:00Z");
    expect(localCalendarDate("Asia/Tokyo", instant)).toBe("2026-11-03");
    expect(localCalendarDate("America/New_York", instant)).toBe("2026-11-02");
    const browser = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
    expect(localCalendarDate("Not/AZone", instant)).toBe(browser);
    expect(localCalendarDate(null, instant)).toBe(browser);
  });
  it("displays the stored day in the interface language without shifting it", () => {
    expect(formatCalendarDate("2026-11-03", "pt")).toBe("03/11/2026");
    expect(formatCalendarDate("2026-11-03", "en")).toBe("11/03/2026");
    expect(formatCalendarDate("2026-01-01", "pt")).toBe("01/01/2026");
  });
  it("applies date changes optimistically", () => {
    const detail = { project: { id: P, start_date: "2026-11-01", end_date: null }, phases: [], items: [] } as unknown as ProjectDetail;
    expect(applyDetailCommand(detail, { type: "setDates", start_date: "2026-11-05", end_date: "2026-12-01" }, "now").project)
      .toMatchObject({ start_date: "2026-11-05", end_date: "2026-12-01" });
  });
});

describe("project dates persistence", () => {
  it("creates projects with the teacher's local day from the profile time zone", async () => {
    expect(await teacherToday("teacher")).toBe(localCalendarDate("Asia/Tokyo"));
    await persistListCommand("teacher", { type: "create", id: P, draft: { title: "Projeto", description: "", color: "lilac", icon: "folder" } as never });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ id: P, user_id: "teacher", start_date: localCalendarDate("Asia/Tokyo") }));
  });
  it("uses the browser zone when the profile has no readable zone", async () => {
    mocks.profile = { data: { timezone: null }, error: null };
    expect(await teacherToday("teacher")).toBe(localCalendarDate());
    mocks.profile = { data: null, error: { message: "rls" } };
    expect(await teacherToday("teacher")).toBe(localCalendarDate());
  });
  it("saves only the dates, owner/project scoped, and rejects an end before the start before any request", async () => {
    await persistDetailCommand("teacher", P, { type: "setDates", start_date: "2026-11-05", end_date: null });
    expect(mocks.update).toHaveBeenCalledWith({ start_date: "2026-11-05", end_date: null });
    mocks.update.mockClear();
    await expect(persistDetailCommand("teacher", P, { type: "setDates", start_date: "2026-11-05", end_date: "2026-11-01" })).rejects.toThrow("end_before_start");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

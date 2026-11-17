import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ working: { data: null as unknown, error: null as unknown }, calls: 0 }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => {
  const c: Record<string, unknown> = {};
  for (const op of ["select", "eq", "order", "is", "gte", "lte"]) c[op] = () => c;
  c.maybeSingle = async () => {
    if (table === "settings") { m.calls++; return m.working; }
    return { data: null, error: null };
  };
  c.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return c;
} } }));
vi.mock("@/lib/time-off-engine", async (original) => ({ ...(await original<object>()), fetchTeacherTimeOff: async () => [] }));
import { fetchTeacherWorkingAvailability } from "../src/lib/availability-engine";
import { availabilityNotice, getTeacherAvailability, invalidateTeacherAvailability } from "../src/lib/teacher-availability";

const monday = [{ day: "Monday", enabled: true, start: "08:00", end: "18:00" }];
beforeEach(() => { m.working = { data: null, error: null }; m.calls = 0; invalidateTeacherAvailability?.("t1"); });

describe("Agenda notice: loading / configured / not configured / error", () => {
  it("configured teacher: no 'not configured' notice while loading, nor after", () => {
    expect(availabilityNotice("loading", [])).toBe("none"); // initial empty state is not a verdict
    expect(availabilityNotice("ready", monday)).toBe("none");
  });
  it("teacher without working hours: the notice appears only after a successful read", () => {
    expect(availabilityNotice("loading", [])).toBe("none");
    expect(availabilityNotice("ready", [])).toBe("not_configured");
    expect(availabilityNotice("ready", [{ ...monday[0], enabled: false }])).toBe("not_configured");
  });
  it("failed read: error state, never 'not configured'", () => {
    expect(availabilityNotice("error", [])).toBe("error");
  });
});

describe("strict working-hours read (Agenda)", () => {
  it("a failed read rejects instead of looking like 'no working hours'", async () => {
    m.working = { data: null, error: { message: "network" } };
    await expect(fetchTeacherWorkingAvailability("t1", { strict: true })).rejects.toMatchObject({ message: "network" });
    await expect(getTeacherAvailability("t1", { force: true, strict: true })).rejects.toMatchObject({ message: "network" });
  });
  it("other modules keep the lenient read (unchanged)", async () => {
    m.working = { data: null, error: { message: "network" } };
    expect(await fetchTeacherWorkingAvailability("t1")).toEqual([]);
  });
  it("a successful strict read reports configured / not configured", async () => {
    m.working = { data: { working_availability: monday }, error: null };
    expect((await getTeacherAvailability("t1", { force: true, strict: true })).isConfigured).toBe(true);
    m.working = { data: { working_availability: [] }, error: null };
    expect((await getTeacherAvailability("t1", { force: true, strict: true })).isConfigured).toBe(false);
  });
  it("a failed strict read is not cached as an empty schedule", async () => {
    m.working = { data: null, error: { message: "network" } };
    await expect(getTeacherAvailability("t1", { force: true, strict: true })).rejects.toBeTruthy();
    m.working = { data: { working_availability: monday }, error: null };
    expect((await getTeacherAvailability("t1")).isConfigured).toBe(true); // no cached empty snapshot
  });
});

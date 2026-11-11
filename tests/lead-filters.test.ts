import { describe, expect, it } from "vitest";
import {
  applyLeadFilters,
  EMPTY_LEAD_FILTERS,
  findDuplicateLeads,
  isContactPending,
  isTaskFilterUnavailable,
  pendingContactAge,
  summarizeLeadTasks,
} from "@/lib/lead-filters";
import type { Lead } from "@/lib/automation-engine";

const now = new Date("2026-11-04T12:00:00Z");
const lead = (p: Partial<Lead>): Lead => ({ id: "x", teacher_id: "t1", full_name: "X", stage: "Novo contato", ...p });
const leads = [
  lead({ id: "a", full_name: "Ana", source: "instagram", tags: ["VIP"], level: "lvl_b1", potential_value: 300, created_at: "2026-10-01T12:00:00Z", contacted_at: "2026-10-02T12:00:00Z", campaign: "Black Friday" }),
  lead({ id: "b", full_name: "Bruno", source: "instagram", level: "B1", potential_value: 100, created_at: "2026-11-01T12:00:00Z" }),
  lead({ id: "c", full_name: "Carla", source: "whatsapp", stage: "Em conversa", created_at: "2026-11-03T12:00:00Z" }),
];
const tasks = summarizeLeadTasks(
  [
    { lead_id: "b", status: "pending", due_date: "2026-11-01T00:00:00Z" },
    { lead_id: "c", status: "pending", due_date: "2026-12-01T00:00:00Z" },
    { lead_id: "a", status: "done", due_date: "2026-01-01T00:00:00Z" },
  ],
  now,
);
const ctx = { search: "", now, tasks, catalogId: (_c: string, v: string) => (v === "B1" ? "lvl_b1" : v) };
const ids = (f: Partial<typeof EMPTY_LEAD_FILTERS>, search = "") =>
  applyLeadFilters(leads, { ...EMPTY_LEAD_FILTERS, ...f }, { ...ctx, search } as any).map((l) => l.id);

describe("lead filters", () => {
  it("no filters returns everything", () => expect(ids({})).toEqual(["a", "b", "c"]));
  it("filters combine with AND and keep text search", () => {
    expect(ids({ source: "instagram", contact: "pending" })).toEqual(["b"]);
    expect(ids({ source: "instagram" }, "ana")).toEqual(["a"]);
  });
  it("catalog filter matches legacy literals via resolved ID", () => expect(ids({ level: "lvl_b1" })).toEqual(["a", "b"]));
  it("value range excludes leads without value", () => expect(ids({ valueMin: "150" })).toEqual(["a"]));
  it("created period is inclusive", () => expect(ids({ createdFrom: "2026-11-01", createdTo: "2026-11-03" })).toEqual(["b", "c"]));
  it("tags and campaign", () => {
    expect(ids({ tag: "vip" })).toEqual(["a"]);
    expect(ids({ campaign: "black" })).toEqual(["a"]);
  });
  it("pending vs overdue tasks ignore completed ones", () => {
    expect(ids({ tasks: "pending" })).toEqual(["b", "c"]);
    expect(ids({ tasks: "overdue" })).toEqual(["b"]);
  });
});

describe("pending contact", () => {
  it("stage change alone is not proof of contact", () => {
    expect(isContactPending(lead({ stage: "Em conversa" }))).toBe(true);
  });
  it("elapsed time since creation", () => {
    expect(pendingContactAge(leads[2], now)).toEqual({ days: 1, hours: 24 });
    expect(pendingContactAge(leads[0], now)).toBeNull();
  });
});

describe("duplicates", () => {
  const existing = [
    lead({ id: "p", phone: "(11) 99999-1234", email: "Ana@Mail.com" }),
    lead({ id: "o", teacher_id: "t2", phone: "11999991234", email: "ana@mail.com" }),
  ];
  it("normalized phone matches", () => expect(findDuplicateLeads("t1", existing, { phone: "11 99999 1234" }).map((l) => l.id)).toEqual(["p"]));
  it("email is case-insensitive", () => expect(findDuplicateLeads("t1", existing, { email: " ANA@mail.com " }).map((l) => l.id)).toEqual(["p"]));
  it("never returns another teacher's leads", () => expect(findDuplicateLeads("t2", existing, { email: "x@y.z" })).toEqual([]));
  it("empty contact data never flags duplicates", () => expect(findDuplicateLeads("t1", existing, { phone: "", email: "" })).toEqual([]));
});

describe("task filter unavailability", () => {
  it("failed task load with an active task filter is not a valid empty result", () => {
    expect(isTaskFilterUnavailable(true, "pending")).toBe(true);
    expect(isTaskFilterUnavailable(true, "overdue")).toBe(true);
  });
  it("failed task load without a task filter does not block results", () => {
    expect(isTaskFilterUnavailable(true, "all")).toBe(false);
  });
  it("no failure never blocks, even with an active task filter", () => {
    expect(isTaskFilterUnavailable(false, "pending")).toBe(false);
    expect(isTaskFilterUnavailable(false, "all")).toBe(false);
  });
});

describe("active filter chips helpers", () => {
  it("lists only the active filter keys and clears one at a time", async () => {
    const { activeLeadFilterKeys, clearLeadFilter } = await import("@/lib/lead-filters");
    const f = { ...EMPTY_LEAD_FILTERS, stage: "Em conversa", tasks: "overdue" as const, valueMin: "100" };
    expect(activeLeadFilterKeys(EMPTY_LEAD_FILTERS)).toEqual([]);
    expect(activeLeadFilterKeys(f)).toEqual(["stage", "valueMin", "tasks"]);
    const next = clearLeadFilter(f, "tasks");
    expect(next).toEqual({ ...f, tasks: "all" });
    expect(activeLeadFilterKeys(next)).toEqual(["stage", "valueMin"]);
  });
});

import { describe, expect, it } from "vitest";
import { buildLeadTaskInsert, resolveLeadActivityType } from "@/lib/lead-tasks";
import { applyLeadFilters, EMPTY_LEAD_FILTERS, isTaskFilterUnavailable, summarizeLeadTasks } from "@/lib/lead-filters";

const now = new Date("2026-11-04T12:00:00Z");
const lead = (id: string) => ({ id, full_name: id, stage: "Novo", created_at: "2026-11-01T00:00:00Z" }) as any;
const leads = [lead("a"), lead("b"), lead("c")];
const tasks = [
  { lead_id: "a", status: "pending", due_date: "2026-11-01T00:00:00Z", activity_type: "whatsapp" },
  { lead_id: "b", status: "pending", due_date: "2026-12-01T00:00:00Z", activity_type: null },
  { lead_id: "c", status: "completed", due_date: "2026-10-01T00:00:00Z", activity_type: "call" },
];
const run = (f: Partial<typeof EMPTY_LEAD_FILTERS>) =>
  applyLeadFilters(leads, { ...EMPTY_LEAD_FILTERS, ...f }, { search: "", now, tasks: summarizeLeadTasks(tasks, now) }).map((l: any) => l.id);

describe("lead activity types", () => {
  it("persists the selected type and defaults are explicit", () => {
    const row = buildLeadTaskInsert("t1", "l1", { title: "Ligar", description: "", due: "2026-11-05T10:00", activityType: "call" });
    expect(row.activity_type).toBe("call");
    expect(buildLeadTaskInsert("t1", "l1", { title: "X", description: "", due: "2026-11-05T10:00", activityType: "general" }).activity_type).toBe("general");
  });
  it("shows NULL and unknown as general", () => {
    expect(resolveLeadActivityType(null)).toBe("general");
    expect(resolveLeadActivityType("fax")).toBe("general");
    expect(resolveLeadActivityType("meeting")).toBe("meeting");
  });
  it("filters by type, treating NULL as general and including completed tasks", () => {
    expect(run({ activityType: "whatsapp" })).toEqual(["a"]);
    expect(run({ activityType: "general" })).toEqual(["b"]);
    expect(run({ activityType: "call" })).toEqual(["c"]);
  });
  it("combines type with pending/overdue without changing their meaning", () => {
    expect(run({ tasks: "pending" })).toEqual(["a", "b"]);
    expect(run({ tasks: "overdue" })).toEqual(["a"]);
    expect(run({ tasks: "overdue", activityType: "general" })).toEqual([]);
    expect(run({ tasks: "pending", activityType: "call" })).toEqual([]);
  });
  it("marks results unavailable when tasks failed and a type filter is active", () => {
    expect(isTaskFilterUnavailable(true, "all", "email")).toBe(true);
    expect(isTaskFilterUnavailable(true, "all", "")).toBe(false);
  });
});

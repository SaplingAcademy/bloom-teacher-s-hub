import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
import { buildLeadTaskInsert, groupLeadTasks, validateLeadTaskDraft, type LeadTask } from "@/lib/lead-tasks";

const task = (id: string, status: string, due: string | null, auto = false): LeadTask => ({
  id, lead_id: "L", title: id, description: null, status, due_date: due, created_at: null,
  automation_event_id: auto ? "ev" : null,
});
const now = new Date("2026-11-04T12:00:00Z");

describe("lead tasks", () => {
  it("separates overdue, pending and completed", () => {
    const g = groupLeadTasks([
      task("late", "pending", "2026-11-03T10:00:00Z"),
      task("soon", "pending", "2026-11-05T10:00:00Z"),
      task("nodue", "pending", null),
      task("done", "completed", "2026-11-01T10:00:00Z"),
    ], now);
    expect(g.overdue.map((t) => t.id)).toEqual(["late"]);
    expect(g.pending.map((t) => t.id)).toEqual(["soon", "nodue"]);
    expect(g.completed.map((t) => t.id)).toEqual(["done"]);
  });
  it("keeps automated tasks in the groups", () => {
    const g = groupLeadTasks([task("a", "pending", "2026-11-01T00:00:00Z", true)], now);
    expect(g.overdue[0].automation_event_id).toBe("ev");
  });
  it("requires title and due date", () => {
    expect(validateLeadTaskDraft({ title: " ", description: "", due: "2026-11-05T10:00" })).toBe("titleRequired");
    expect(validateLeadTaskDraft({ title: "Ligar", description: "", due: "" })).toBe("dueRequired");
    expect(validateLeadTaskDraft({ title: "Ligar", description: "", due: "2026-11-05T10:00" })).toBeNull();
  });
  it("builds a teacher/lead scoped pending insert with null blank description", () => {
    const row = buildLeadTaskInsert("T", "L", { title: " Ligar ", description: "  ", due: "2026-11-05T10:00" });
    expect(row).toMatchObject({ teacher_id: "T", lead_id: "L", title: "Ligar", description: null, status: "pending" });
    expect(row.due_date).toBe(new Date("2026-11-05T10:00").toISOString());
  });
});

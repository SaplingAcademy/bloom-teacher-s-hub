import { describe, expect, it } from "vitest";
import { planAutoTasks, type AutoTaskRow } from "@/lib/automation-task-plan";

const spec = (activity_type: string) => ({ activity_type, title: "T", description: "D", due_date: "2026-11-10T00:00:00Z" });
const row = (id: string, status: string, ev: string | null, type: string | null): AutoTaskRow =>
  ({ id, status, automation_event_id: ev, activity_type: type });

describe("automation task planning", () => {
  it("inserts on first run", () => {
    expect(planAutoTasks([], new Set(["e1"]), [spec("follow_up")], false)).toEqual([{ kind: "insert", spec: spec("follow_up") }]);
  });
  it("does not duplicate on re-run (Rule A)", () => {
    const a = planAutoTasks([row("t1", "pending", "e1", "follow_up")], new Set(["e1"]), [spec("follow_up")], false);
    expect(a).toEqual([{ kind: "skip", taskId: "t1" }]);
  });
  it("reschedule updates pending trial tasks linked to earlier events (Rule C)", () => {
    const a = planAutoTasks(
      [row("c", "pending", "old", "whatsapp"), row("f", "pending", "old", "follow_up")],
      new Set(["old", "new"]), [spec("whatsapp"), spec("follow_up")], true);
    expect(a.map((x) => x.kind)).toEqual(["update", "update"]);
  });
  it("never touches completed tasks and does not recreate them", () => {
    const a = planAutoTasks([row("c", "completed", "old", "whatsapp")], new Set(["old", "new"]), [spec("whatsapp")], true);
    expect(a).toEqual([{ kind: "skip", taskId: "c" }]);
  });
  it("ignores manual tasks and other rules' tasks", () => {
    const a = planAutoTasks(
      [row("m", "pending", null, "follow_up"), row("x", "pending", "otherRule", "follow_up")],
      new Set(["p1"]), [spec("follow_up")], true);
    expect(a).toEqual([{ kind: "insert", spec: spec("follow_up") }]);
  });
  it("proposal update refreshes the pending follow-up instead of creating another (Rule D)", () => {
    const a = planAutoTasks([row("p", "pending", "pkgA", "follow_up")], new Set(["pkgA", "pkgB"]), [spec("follow_up")], true);
    expect(a).toEqual([{ kind: "update", taskId: "p", spec: spec("follow_up") }]);
  });
});

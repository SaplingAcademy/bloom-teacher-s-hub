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

import { resolveProposalCycle } from "@/lib/automation-task-plan";
describe("proposal cycles (Rule D)", () => {
  const ev = (id: string, status: string, key: string) => ({ id, status, idempotency_key: key });
  const k = (n: number) => `proposal-recorded:L:cycle:${n}`;
  it("first proposal starts cycle 1", () => {
    expect(resolveProposalCycle("L", [], new Set()).key).toBe(k(1));
  });
  it("updating the same proposal (pending follow-up) reuses the cycle", () => {
    expect(resolveProposalCycle("L", [ev("e1", "completed", k(1))], new Set(["e1"])).key).toBe(k(1));
  });
  it("new proposal after completed follow-up opens a new cycle", () => {
    const r = resolveProposalCycle("L", [ev("e1", "completed", k(1))], new Set());
    expect(r.key).toBe(k(2));
    expect(planAutoTasks([row("t", "completed", "e1", "follow_up")], new Set(["e2"]), [spec("follow_up")], true))
      .toEqual([{ kind: "insert", spec: spec("follow_up") }]);
  });
  it("failed cycle is retried with the same key", () => {
    expect(resolveProposalCycle("L", [ev("e1", "failed", k(1))], new Set()).key).toBe(k(1));
  });
  it("legacy event with pending follow-up keeps its key", () => {
    expect(resolveProposalCycle("L", [ev("e0", "completed", "proposal-recorded:L:custom")], new Set(["e0"])).key)
      .toBe("proposal-recorded:L:custom");
  });
  it("retry after partial failure inserts only the missing task", () => {
    const a = planAutoTasks([row("c", "pending", "e1", "whatsapp")], new Set(["e1"]), [spec("whatsapp"), spec("follow_up")], true);
    expect(a.map((x) => x.kind)).toEqual(["update", "insert"]);
  });
});

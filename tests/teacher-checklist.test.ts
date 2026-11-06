import { describe, expect, it } from "vitest";
import { applyChecklistCommand, checklistDeadline, checklistTitle, isChecklistOverdue, localChecklistDate,
  pendingChecklistCount, restoreChecklistItems, sortChecklist, splitChecklist,
  type ChecklistDeadline, type TeacherChecklistItem } from "../src/lib/teacher-checklist";

const NONE: ChecklistDeadline = { deadline_type: "none", due_date: null };
const row = (id: string, completed = false, created = "2026-11-06T01:00:00Z", deadline = NONE): TeacherChecklistItem => ({
  id, teacher_id: "teacher", title: id, completed, created_at: created, updated_at: created, ...deadline,
});
const apply = (items: TeacherChecklistItem[], command: Parameters<typeof applyChecklistCommand>[1]) =>
  applyChecklistCommand(items, command, "teacher", "2026-11-06T02:00:00Z");

 describe("Personal Checklist rules", () => {
  it("puts pending tasks before completed tasks with stable creation/ID ordering", () => {
    const items = [row("completed", true), row("b"), row("a"), row("old", false, "2026-11-05T01:00:00Z")];
    expect(sortChecklist(items).map((item) => item.id)).toEqual(["old", "a", "b", "completed"]);
    expect(items[0].id).toBe("completed");
  });
  it("counts only pending tasks in the supplied view", () => expect(pendingChecklistCount([row("one"), row("two"), row("done", true)])).toBe(2));
  it("adds a pending owner-scoped task with its explicit deadline", () => {
    const deadline = { deadline_type: "today", due_date: "2026-11-06" } as const;
    expect(apply([row("old", true)], { type: "create", id: "new", title: "  Prepare materials  ", deadline })).toEqual([
      { ...row("new", false, "2026-11-06T02:00:00Z", deadline), title: "Prepare materials" }, row("old", true),
    ]);
  });
  it("edits text and deadline while retaining identity, owner, completion and creation", () => {
    const deadline = { deadline_type: "specific", due_date: "2026-11-20" } as const;
    expect(apply([row("task", true)], { type: "edit", id: "task", title: " Edited ", deadline })[0]).toEqual({
      ...row("task", true, "2026-11-06T01:00:00Z", deadline), title: "Edited", updated_at: "2026-11-06T02:00:00Z",
    });
  });
  it("marks and unmarks completion, updating the pending count immediately", () => {
    const completed = apply([row("one")], { type: "complete", id: "one", completed: true });
    expect(completed[0].completed).toBe(true);
    expect(pendingChecklistCount(completed)).toBe(0);
    const pending = apply(completed, { type: "complete", id: "one", completed: false });
    expect(pending[0].completed).toBe(false);
    expect(pendingChecklistCount(pending)).toBe(1);
  });
  it("deletes only the selected task", () => expect(apply([row("one"), row("two")], { type: "delete", id: "one" }).map((item) => item.id)).toEqual(["two"]));
  it("clears only confirmed tasks still completed, keeping pending and newly completed tasks", () => {
    const items = [row("confirmed", true), row("reopened"), row("newly-done", true), row("pending")];
    expect(apply(items, { type: "clear", ids: ["confirmed", "reopened"] }).map((item) => item.id)).toEqual(["pending", "reopened", "newly-done"]);
  });
  it("rejects blank task creation and edits", () => {
    expect(() => checklistTitle(" \n ")).toThrow("checklist_title_required");
    expect(() => apply([], { type: "create", id: "new", title: " ", deadline: NONE })).toThrow("checklist_title_required");
    expect(() => apply([row("one")], { type: "edit", id: "one", title: " ", deadline: NONE })).toThrow("checklist_title_required");
  });
  it("rejects cross-account cached rows", () => expect(() => apply([{ ...row("one"), teacher_id: "another" }], { type: "delete", id: "one" })).toThrow("authentication_changed"));
  it("rolls back only failed rows while preserving unrelated concurrent edits", () => {
    const before = [row("failed"), row("success")];
    const current = [{ ...row("success"), title: "Saved concurrent edit" }, row("new")];
    expect(restoreChecklistItems(current, before, ["failed"]).map((item) => [item.id, item.title])).toEqual([
      ["failed", "failed"], ["new", "new"], ["success", "Saved concurrent edit"],
    ]);
  });
});

describe("Checklist local deadlines and history", () => {
  it("uses the teacher's local calendar day rather than the UTC date", () => {
    const local = new Date(2026, 0, 2, 23, 55);
    expect(localChecklistDate(local)).toBe("2026-01-02");
    expect(checklistDeadline("today", null, localChecklistDate(local))).toEqual({ deadline_type: "today", due_date: "2026-01-02" });
  });
  it("keeps no-deadline tasks without a date and validates specific dates", () => {
    expect(checklistDeadline("none", "2026-11-20", "2026-11-06")).toEqual(NONE);
    expect(checklistDeadline("specific", "2026-11-20", "2026-11-06")).toEqual({ deadline_type: "specific", due_date: "2026-11-20" });
    expect(() => checklistDeadline("specific", "2026-02-30", "2026-11-06")).toThrow("checklist_due_date_required");
    expect(() => checklistDeadline("specific", null, "2026-11-06")).toThrow("checklist_due_date_required");
  });
  it("moves only incomplete past-deadline tasks to History at the local day boundary", () => {
    const due = { deadline_type: "specific", due_date: "2026-11-06" } as const;
    const pending = row("pending", false, "2026-11-01T01:00:00Z", due);
    expect(isChecklistOverdue(pending, "2026-11-06")).toBe(false);
    expect(isChecklistOverdue(pending, "2026-11-07")).toBe(true);
    expect(splitChecklist([pending], "2026-11-06").current.map((item) => item.id)).toEqual(["pending"]);
    expect(splitChecklist([pending], "2026-11-07").history.map((item) => item.id)).toEqual(["pending"]);
  });
  it("never expires no-deadline tasks and never puts completed tasks in pending History", () => {
    const yesterday = { deadline_type: "today", due_date: "2026-11-05" } as const;
    const items = [row("none"), row("done", true, "2026-11-01T01:00:00Z", yesterday), row("today", false, "2026-11-02T01:00:00Z", yesterday)];
    const split = splitChecklist(items, "2026-11-06");
    expect(split.current.map((item) => item.id)).toEqual(["none", "done"]);
    expect(split.history.map((item) => item.id)).toEqual(["today"]);
  });
  it("orders History by the original due date without changing records", () => {
    const older = row("older", false, "2026-11-02T01:00:00Z", { deadline_type: "specific", due_date: "2026-11-03" });
    const newer = row("newer", false, "2026-11-01T01:00:00Z", { deadline_type: "specific", due_date: "2026-11-04" });
    expect(splitChecklist([newer, older], "2026-11-06").history.map((item) => item.id)).toEqual(["older", "newer"]);
    expect(older.due_date).toBe("2026-11-03");
  });
  it("recovers the same incomplete row with a new deadline and no duplication", () => {
    const original = row("overdue", false, "2026-11-01T01:00:00Z", { deadline_type: "specific", due_date: "2026-11-03" });
    const result = apply([original], { type: "recover", id: "overdue", deadline: { deadline_type: "today", due_date: "2026-11-06" } });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ ...original, deadline_type: "today", due_date: "2026-11-06", updated_at: "2026-11-06T02:00:00Z" });
    expect(splitChecklist(result, "2026-11-06").current.map((item) => item.id)).toEqual(["overdue"]);
    expect(splitChecklist(result, "2026-11-06").history).toEqual([]);
  });
  it("can recover to no deadline and rejects recovering an already completed row", () => {
    const original = row("overdue", false, "2026-11-01T01:00:00Z", { deadline_type: "specific", due_date: "2026-11-03" });
    expect(splitChecklist(apply([original], { type: "recover", id: "overdue", deadline: NONE }), "2026-12-01").history).toEqual([]);
    expect(() => apply([{ ...original, completed: true }], { type: "recover", id: "overdue", deadline: NONE })).toThrow("checklist_item_completed");
  });
});

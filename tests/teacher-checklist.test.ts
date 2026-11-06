import { describe, expect, it } from "vitest";
import { applyChecklistCommand, checklistTitle, pendingChecklistCount, restoreChecklistItems, sortChecklist, type TeacherChecklistItem } from "../src/lib/teacher-checklist";

const row = (id: string, completed = false, created = "2026-11-06T01:00:00Z"): TeacherChecklistItem => ({
  id, teacher_id: "teacher", title: id, completed, created_at: created, updated_at: created,
});
const apply = (items: TeacherChecklistItem[], command: Parameters<typeof applyChecklistCommand>[1]) =>
  applyChecklistCommand(items, command, "teacher", "2026-11-06T02:00:00Z");

describe("Personal Checklist rules", () => {
  it("puts pending tasks before completed tasks with stable creation/ID ordering", () => {
    const items = [row("completed", true), row("b"), row("a"), row("old", false, "2026-11-05T01:00:00Z")];
    expect(sortChecklist(items).map((item) => item.id)).toEqual(["old", "a", "b", "completed"]);
    expect(items[0].id).toBe("completed");
  });
  it("counts only pending tasks", () => expect(pendingChecklistCount([row("one"), row("two"), row("done", true)])).toBe(2));
  it("adds a pending owner-scoped task without losing existing completed tasks", () => {
    expect(apply([row("old", true)], { type: "create", id: "new", title: "  Prepare materials  " })).toEqual([
      { ...row("new", false, "2026-11-06T02:00:00Z"), title: "Prepare materials" }, row("old", true),
    ]);
  });
  it("edits only text while retaining identity, owner, completion and creation", () => {
    expect(apply([row("task", true)], { type: "edit", id: "task", title: " Edited " })[0]).toEqual({
      ...row("task", true), title: "Edited", updated_at: "2026-11-06T02:00:00Z",
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
    expect(() => apply([], { type: "create", id: "new", title: " " })).toThrow("checklist_title_required");
    expect(() => apply([row("one")], { type: "edit", id: "one", title: " " })).toThrow("checklist_title_required");
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
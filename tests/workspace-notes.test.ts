import { describe, expect, it } from "vitest";
import { NOTE_COLORS, applyNoteCommand, moveNote, prepareNoteDraft, sortNotes, type WorkspaceNote } from "../src/lib/workspace-notes";

const note = (id: string, order_index: number, pinned = false): WorkspaceNote => ({
  id, order_index, pinned, user_id: "teacher", title: null, content: id, color: "yellow", created_at: "2026-11-05T19:22:00Z", updated_at: "2026-11-05T19:22:00Z",
});

describe("personal Workspace notes", () => {
  it("requires nonblank content while leaving title optional", () => {
    expect(() => prepareNoteDraft({ title: "Title", content: " \n ", color: "yellow" })).toThrow("empty_content");
    expect(prepareNoteDraft({ title: " ", content: " Reminder ", color: "mint" })).toEqual({ title: null, content: "Reminder", color: "mint" });
  });
  it("accepts precisely the seven existing saved colors", () => {
    expect(NOTE_COLORS).toEqual(["yellow", "peach", "mint", "lavender", "rose", "sky", "neutral"]);
    for (const color of NOTE_COLORS) expect(prepareNoteDraft({ title: "", content: "x", color }).color).toBe(color);
    expect(() => prepareNoteDraft({ title: "", content: "x", color: "red" as "yellow" })).toThrow("invalid_color");
  });
  it("shows pinned notes first then uses saved positions with stable tie breaking", () => {
    expect(sortNotes([note("b", 1), note("z", 5, true), note("a", 1)]).map((n) => n.id)).toEqual(["z", "a", "b"]);
  });
  it("moves to group start changing only the selected row's position", () => {
    const before = [note("p", 0, true), note("a", 3), note("b", 9), note("c", 9)];
    const after = moveNote(before, "c", -1);
    expect(after.map((n) => n.id)).toEqual(["p", "c", "a", "b"]);
    expect(after.find((n) => n.id === "c")?.order_index).toBe(2);
    expect(after.find((n) => n.id === "b")?.order_index).toBe(9);
    expect(before[3].order_index).toBe(9);
  });
  it("moves to group end without crossing pinned/unpinned groups", () => {
    const before = [note("p", 0, true), note("q", 8, true), note("a", 1), note("b", 3)];
    expect(moveNote(before, "p", 1).map((n) => n.id)).toEqual(["q", "p", "a", "b"]);
    expect(moveNote(before, "a", 1).map((n) => n.id)).toEqual(["p", "q", "b", "a"]);
  });
  it("pin/unpin and deletion preserve the rollback snapshot", () => {
    const before = [note("a", 0), note("b", 1)];
    const after = applyNoteCommand(before, { type: "pin", id: "b", pinned: true }, "teacher", "now");
    expect(after.map((n) => n.id)).toEqual(["b", "a"]);
    expect(after[0].pinned).toBe(true);
    expect(before[1].pinned).toBe(false);
    expect(applyNoteCommand(after, { type: "pin", id: "b", pinned: false }, "teacher", "now").map((n) => n.id)).toEqual(["a", "b"]);
    expect(applyNoteCommand(before, { type: "delete", id: "a" }, "teacher", "now").map((n) => n.id)).toEqual(["b"]);
    expect(before).toHaveLength(2);
  });
  it("creation uses the verified owner and stable ID to avoid repeated optimistic copies", () => {
    const command = { type: "create", id: "stable", draft: { title: "", content: "hello", color: "sky" } } as const;
    const after = applyNoteCommand([], command, "teacher", "now");
    expect(after[0].user_id).toBe("teacher");
    expect(applyNoteCommand(after, command, "teacher", "now")).toHaveLength(1);
    expect(after[0].order_index).toBe(0);
  });
  it("editing modifies only selected note fields and preserves owner/order/pin", () => {
    const before = [note("a", 8, true), note("b", 9)];
    const after = applyNoteCommand(before, { type: "edit", id: "a", draft: { title: "Title", content: "<script>literal text</script>", color: "rose" } }, "teacher", "now");
    expect(after[0]).toMatchObject({ id: "a", user_id: "teacher", order_index: 8, pinned: true, color: "rose", content: "<script>literal text</script>" });
    expect(before[0].content).toBe("a");
    expect(after[1]).toBe(before[1]);
  });
});
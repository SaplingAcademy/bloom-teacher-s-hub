import { describe, expect, it } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";
import { BOARD_NOTE_WIDTH, automaticSlots, boardHeightFor, boardLimits, clampToBoard, placeNotes, snapToBoard, stableSlotOrder, stackingOrder } from "../src/lib/workspace-notes-layout";

const note = (id: string, order_index: number, extra: Partial<WorkspaceNote> = {}): WorkspaceNote => ({
  id, order_index, pinned: false, user_id: "teacher", title: null, content: id, color: "yellow", pos_x: null, pos_y: null,
  created_at: "2026-11-05T19:22:00Z", updated_at: "2026-11-05T19:22:00Z", ...extra,
});

describe("Workspace board layout", () => {
  it("places older notes without coordinates from the existing order, pinned first", () => {
    const notes = [note("b", 2), note("a", 1), note("p", 9, { pinned: true }), note("c", 3)];
    const slots = automaticSlots(notes, { p: 100, a: 200 }, 960); // 3 columns of 288 + 24 gaps
    expect(slots.p).toEqual({ x: 0, y: 0 });
    expect(slots.a).toEqual({ x: 312, y: 0 });
    expect(slots.b).toEqual({ x: 624, y: 0 });
    expect(slots.c).toEqual({ x: 0, y: 144 }); // below p (100 + 24 gap, rounded up to the grid)
  });
  it("saved coordinates win, and moving one note never shifts the others", () => {
    const before = [note("a", 0), note("b", 1), note("c", 2)];
    const after = before.map((n) => n.id === "a" ? { ...n, pos_x: 480, pos_y: 720 } : n);
    const placedBefore = placeNotes(before, {}, 960);
    const placedAfter = placeNotes(after, {}, 960);
    expect(placedAfter.a).toEqual({ x: 480, y: 720, auto: false });
    expect(placedAfter.b).toEqual(placedBefore.b);
    expect(placedAfter.c).toEqual(placedBefore.c);
  });
  it("locking or re-layering a note does not shift other automatically placed notes", () => {
    const before = [note("a", 0), note("b", 1), note("c", 2)];
    const order = stableSlotOrder([], before);
    const after = before.map((n) => n.id === "c" ? { ...n, order_index: -1, pinned: true } : n);
    const nextOrder = stableSlotOrder(order, after);
    expect(nextOrder).toEqual(["a", "b", "c"]);
    expect(placeNotes(after, {}, 960, nextOrder)).toEqual(placeNotes(before, {}, 960, order));
    expect(stableSlotOrder(nextOrder, [...after.filter((n) => n.id !== "a"), note("d", 9)])).toEqual(["b", "c", "d"]);
  });
  it("keeps saved notes inside a narrower board without rewriting their coordinates", () => {
    const saved = note("a", 0, { pos_x: 1200, pos_y: 48 });
    expect(placeNotes([saved], {}, 800).a).toEqual({ x: 800 - BOARD_NOTE_WIDTH, y: 48, auto: false });
    expect(saved.pos_x).toBe(1200);
  });
  it("clamps live drags and snaps drops to the 24px grid inside the board", () => {
    const limits = boardLimits(900, 600, 150);
    expect(limits).toEqual({ x: 612, y: 450 });
    expect(clampToBoard({ x: -40, y: 9999 }, limits)).toEqual({ x: 0, y: 450 });
    expect(snapToBoard({ x: 37, y: 13 }, limits)).toEqual({ x: 48, y: 24 });
    expect(snapToBoard({ x: 612, y: 450 }, limits)).toEqual({ x: 600, y: 432 }); // grid points that still fit
    expect(snapToBoard({ x: -5, y: -5 }, limits)).toEqual({ x: 0, y: 0 });
  });
  it("allows overlapping notes and draws higher order_index on top", () => {
    const notes = [note("top", 5, { pos_x: 24, pos_y: 24 }), note("under", 1, { pos_x: 24, pos_y: 24 })];
    const placed = placeNotes(notes, {}, 960);
    expect(placed.top).toEqual(placed.under);
    expect(stackingOrder(notes).map((n) => n.id)).toEqual(["under", "top"]);
  });
  it("grows the board below the lowest note", () => {
    expect(boardHeightFor({ a: { x: 0, y: 600 } }, { a: 200 }, 480)).toBe(936);
    expect(boardHeightFor({}, {}, 480)).toBe(480);
  });
});

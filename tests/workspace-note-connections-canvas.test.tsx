// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyNoteCommand, type NoteCommand, type WorkspaceNote } from "../src/lib/workspace-notes";
import type { NoteConnection } from "../src/lib/workspace-note-connections";
import { NotesCanvas } from "../src/components/bloom/workspace/NotesCanvas";

const note = (id: string, order_index: number, pos: [number, number]): WorkspaceNote => ({
  id, order_index, pinned: false, user_id: "teacher", title: null, content: id, color: "yellow", pos_x: pos[0], pos_y: pos[1],
  created_at: "2026-11-05T19:22:00Z", updated_at: "2026-11-05T19:22:00Z",
});
const link = (id: string, from: string, to: string): NoteConnection => ({ id, from_note_id: from, to_note_id: to });

let root: Root;
let container: HTMLDivElement;
const execute = vi.fn();
const setters: { notes?: (n: WorkspaceNote[]) => void } = {};
function Harness({ initial, connections, connecting = false }: { initial: WorkspaceNote[]; connections: NoteConnection[]; connecting?: boolean }) {
  const [notes, setNotes] = useState(initial);
  setters.notes = setNotes;
  execute.mockImplementation(async (command: NoteCommand) => { setNotes((current) => applyNoteCommand(current, command, "teacher", "now")); return true; });
  return createElement(NotesCanvas, {
    notes, pending: false, execute, label: "Board", connections, connecting,
    renderNote: (entry: WorkspaceNote) => createElement("article", null, createElement("button", null, entry.content)),
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 1200; } });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 120; } });
  execute.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

const mount = (props: Parameters<typeof Harness>[0]) => act(async () => root.render(createElement(Harness, props)));
const svg = () => container.querySelector<SVGSVGElement>('[data-testid="note-connections"]');
const line = (id: string) => container.querySelector<SVGLineElement>(`[data-connection="${id}"]`)!;
const coords = (id: string) => ["x1", "y1", "x2", "y2"].map((k) => Number(line(id).getAttribute(k)));
const wrapper = (id: string) => container.querySelector<HTMLElement>(`[data-board-note="${id}"]`)!;
const pointer = (target: Element, type: string, x: number, y: number) =>
  act(async () => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0 })); });

// a at (0,0), b at (480,0): both 288 wide, 120 tall → arrow from a's right edge to b's left edge.
const notes = () => [note("a", 0, [0, 0]), note("b", 1, [480, 0]), note("c", 2, [0, 312])];

describe("connections on the free board", () => {
  it("draws one arrow per connection, behind the notes and never catching pointer events", async () => {
    await mount({ initial: notes(), connections: [link("ab", "a", "b"), link("ac", "a", "c")] });
    expect(svg()).not.toBeNull();
    expect(svg()!.getAttribute("class")).toContain("pointer-events-none");
    expect(svg()!.style.zIndex).toBe("0");
    expect(Number(wrapper("a").style.zIndex)).toBeGreaterThan(0);
    expect(container.querySelectorAll("line[data-connection]")).toHaveLength(2);
    expect(line("ab").getAttribute("marker-end")).toBe("url(#note-connection-arrow)");
    expect(coords("ab")).toEqual([288 + 6, 60, 480 - 6, 60]);
  });
  it("follows a note live while it is dragged, and stays attached after the drop", async () => {
    await mount({ initial: notes(), connections: [link("ab", "a", "b")] });
    await pointer(wrapper("b"), "pointerdown", 600, 50);
    await pointer(wrapper("b"), "pointermove", 600, 150);
    await pointer(wrapper("b"), "pointermove", 600, 250); // b carried 200px down, not saved yet
    expect(execute).not.toHaveBeenCalled();
    const during = coords("ab");
    expect(during[3]).toBeGreaterThan(60); // the arrow end moved with b
    await pointer(wrapper("b"), "pointerup", 600, 250);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "position", id: "b" }));
    const after = coords("ab");
    expect(after[3]).toBeGreaterThan(60);
    expect(container.querySelectorAll("line[data-connection]")).toHaveLength(1);
  });
  it("follows a position changed by someone else (new notes data from the board)", async () => {
    await mount({ initial: notes(), connections: [link("ab", "a", "b")] });
    expect(coords("ab")).toEqual([288 + 6, 60, 480 - 6, 60]);
    await act(async () => setters.notes!(notes().map((n) => n.id === "b" ? { ...n, pos_x: 720, pos_y: 0 } : n)));
    expect(coords("ab")).toEqual([288 + 6, 60, 720 - 6, 60]);
  });
  it("hides the arrows of a deleted note and draws nothing without connections", async () => {
    await mount({ initial: notes(), connections: [link("ab", "a", "b"), link("bc", "b", "c")] });
    await act(async () => setters.notes!(notes().filter((n) => n.id !== "b")));
    expect(svg()).toBeNull();
  });
  it("pauses dragging while connect mode is on (a click picks the target instead)", async () => {
    await mount({ initial: notes(), connections: [], connecting: true });
    const before = wrapper("b").style.transform;
    await pointer(wrapper("b"), "pointerdown", 600, 50);
    await pointer(wrapper("b"), "pointermove", 600, 250);
    await pointer(wrapper("b"), "pointerup", 600, 250);
    expect(wrapper("b").style.transform).toBe(before);
    expect(execute).not.toHaveBeenCalled();
  });
});

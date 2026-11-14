// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyNoteCommand, type NoteCommand, type WorkspaceNote } from "../src/lib/workspace-notes";
import { NotesCanvas } from "../src/components/bloom/workspace/NotesCanvas";

const note = (id: string, order_index: number, extra: Partial<WorkspaceNote> = {}): WorkspaceNote => ({
  id, order_index, pinned: false, user_id: "teacher", title: null, content: id, color: "yellow", pos_x: null, pos_y: null,
  created_at: "2026-11-05T19:22:00Z", updated_at: "2026-11-05T19:22:00Z", ...extra,
});

let root: Root;
let container: HTMLDivElement;
let outcome: "save" | "fail";
const execute = vi.fn();
const opened = vi.fn();

let readOnly = false;
function Harness({ initial }: { initial: WorkspaceNote[] }) {
  const [notes, setNotes] = useState(initial);
  execute.mockImplementation(async (command: NoteCommand) => {
    if (outcome === "fail") return false; // the hook restores the snapshot and shows the error toast
    setNotes((current) => applyNoteCommand(current, command, "teacher", "now"));
    return true;
  });
  return createElement(NotesCanvas, {
    notes, pending: false, readOnly, execute, label: "Board",
    renderNote: (entry: WorkspaceNote) => createElement("article", null,
      createElement("div", { "data-no-drag": true }, createElement("button", { "data-lock": entry.id }, "lock")),
      createElement("button", { "data-open": entry.id, onClick: () => opened(entry.id) }, entry.content)),
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 960; } });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get() { return 120; } });
  outcome = "save";
  readOnly = false;
  execute.mockReset();
  opened.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
});

const mount = (notes: WorkspaceNote[]) => act(async () => root.render(createElement(Harness, { initial: notes })));
const wrapper = (id: string) => container.querySelector<HTMLElement>(`[data-board-note="${id}"]`)!;
const position = (id: string) => wrapper(id).style.transform;
const pointer = (target: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
  act(async () => { target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, ...extra })); });
async function dragFrom(target: Element, dx: number, dy: number) {
  await pointer(target, "pointerdown", 100, 100);
  await pointer(target, "pointermove", 100 + dx / 2, 100 + dy / 2);
  await pointer(target, "pointermove", 100 + dx, 100 + dy);
  await pointer(target, "pointerup", 100 + dx, 100 + dy);
}

describe("free-positioning notes board", () => {
  it("places older notes from their order without writing anything", async () => {
    await mount([note("a", 0), note("b", 1)]);
    expect(position("a")).toBe("translate3d(0px, 0px, 0)");
    expect(position("b")).toBe("translate3d(312px, 0px, 0)");
    expect(execute).not.toHaveBeenCalled();
  });
  it("restores saved coordinates (e.g. after a refresh)", async () => {
    await mount([note("a", 0, { pos_x: 480, pos_y: 240 })]);
    expect(position("a")).toBe("translate3d(480px, 240px, 0)");
  });
  it("moves locally while dragging and saves one snapped position on release", async () => {
    await mount([note("a", 0), note("b", 1)]);
    const body = container.querySelector('[data-open="a"]')!;
    await pointer(body, "pointerdown", 100, 100);
    await pointer(body, "pointermove", 150, 130);
    expect(position("a")).toBe("translate3d(50px, 30px, 0)");
    await pointer(body, "pointermove", 210, 141);
    expect(execute).not.toHaveBeenCalled(); // nothing is written during the drag
    await pointer(body, "pointerup", 210, 141);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "position", id: "a", x: 120, y: 48 });
    expect(position("a")).toBe("translate3d(120px, 48px, 0)");
    expect(position("b")).toBe("translate3d(312px, 0px, 0)"); // others keep their place
    expect(opened).not.toHaveBeenCalled(); // releasing a drag does not open the editor
  });
  it("keeps the note fully inside the board edges", async () => {
    await mount([note("a", 0)]);
    const body = container.querySelector('[data-open="a"]')!;
    await dragFrom(body, -500, -500);
    expect(execute).not.toHaveBeenCalled(); // dropped back on its own slot (0,0): nothing to save
    await dragFrom(body, 5000, 0);
    expect(execute).toHaveBeenLastCalledWith({ type: "position", id: "a", x: 672, y: 0 }); // 960 − 288
  });
  it("allows overlap and keeps higher order_index on top", async () => {
    await mount([note("a", 0, { pos_x: 0, pos_y: 0 }), note("b", 4, { pos_x: 0, pos_y: 0 })]);
    expect(position("a")).toBe(position("b"));
    expect(Number(wrapper("b").style.zIndex)).toBeGreaterThan(Number(wrapper("a").style.zIndex));
  });
  it("layer and lock changes keep every note in place, also after a reload", async () => {
    const notes = [note("a", 0), note("b", 1), note("c", 2)];
    await mount(notes);
    const before = ["a", "b", "c"].map(position);
    const layered = applyNoteCommand(applyNoteCommand(notes, { type: "layer", id: "a", to: "front" }, "teacher", "now"),
      { type: "pin", id: "c", pinned: true }, "teacher", "now");
    await act(async () => root.unmount());
    root = createRoot(container);
    await mount(layered); // fresh board from the saved rows, like a page reload
    expect(["a", "b", "c"].map(position)).toEqual(before);
    expect(Number(wrapper("a").style.zIndex)).toBeGreaterThan(Number(wrapper("b").style.zIndex));
    expect(execute).not.toHaveBeenCalled();
  });
  it("returns the note to its saved place when the save fails", async () => {
    outcome = "fail";
    await mount([note("a", 0, { pos_x: 48, pos_y: 48 })]);
    await dragFrom(container.querySelector('[data-open="a"]')!, 200, 100);
    expect(execute).toHaveBeenCalledWith({ type: "position", id: "a", x: 240, y: 144 });
    expect(position("a")).toBe("translate3d(48px, 48px, 0)");
  });
  it("does not drag locked notes, from controls, or with touch; a plain click still opens", async () => {
    await mount([note("locked", 0, { pinned: true }), note("b", 1)]);
    const lockedAt = position("locked");
    await dragFrom(container.querySelector('[data-open="locked"]')!, 200, 100);
    await dragFrom(container.querySelector('[data-lock="b"]')!, 200, 100);
    const body = container.querySelector('[data-open="b"]')!;
    await pointer(body, "pointerdown", 100, 100, { pointerType: "touch" });
    await pointer(body, "pointermove", 300, 300, { pointerType: "touch" });
    await pointer(body, "pointerup", 300, 300, { pointerType: "touch" });
    expect(execute).not.toHaveBeenCalled();
    expect(position("locked")).toBe(lockedAt);
    await pointer(body, "pointerdown", 100, 100);
    await pointer(body, "pointermove", 102, 101); // under the drag threshold
    await pointer(body, "pointerup", 102, 101);
    await act(async () => (body as HTMLButtonElement).click());
    expect(opened).toHaveBeenCalledWith("b");
    expect(execute).not.toHaveBeenCalled();
  });
  it("read-only boards (archived projects) never start a drag", async () => {
    readOnly = true;
    await mount([note("a", 0, { pos_x: 48, pos_y: 48 })]);
    await dragFrom(container.querySelector('[data-open="a"]')!, 200, 100);
    expect(execute).not.toHaveBeenCalled();
    expect(position("a")).toBe("translate3d(48px, 48px, 0)");
  });
});

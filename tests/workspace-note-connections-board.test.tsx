// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";

const m = vi.hoisted(() => ({
  notes: [] as WorkspaceNote[], execute: vi.fn(async () => true),
  connections: { available: true, connections: [] as { id: string; from_note_id: string; to_note_id: string }[], connect: vi.fn(async () => true), disconnect: vi.fn(async () => true), refresh: vi.fn() },
  hookArgs: [] as unknown[][], success: vi.fn(), info: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "teacher" }, session: { user: { id: "teacher" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { success: m.success, error: vi.fn(), info: m.info, dismiss: vi.fn() } }));
vi.mock("@/hooks/use-workspace-notes", () => ({ useWorkspaceNotes: () => ({ notes: m.notes, isLoading: false, error: null, pending: false, execute: m.execute, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-note-connections", () => ({ useNoteConnections: (...args: unknown[]) => { m.hookArgs.push(args); return m.connections; } }));
vi.mock("@/hooks/use-workspace-note-images", () => ({ useWorkspaceNoteImages: () => ({ byNote: {}, urls: {}, saveNoteImages: vi.fn() }) }));
// Menus render inline so their items can be clicked directly.
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", { role: "menu" }, children),
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: ({ children, onSelect, disabled }: { children: ReactNode; onSelect?: () => void; disabled?: boolean }) =>
    createElement("button", { role: "menuitem", disabled, onClick: () => onSelect?.() }, children),
}));
import { NotesBoard } from "../src/components/bloom/workspace/NotesBoard";

const note = (id: string, x: number, title: string, user_id = "teacher"): WorkspaceNote => ({
  id, order_index: 0, pinned: false, user_id, title, content: "", color: "yellow", pos_x: x, pos_y: 0,
  created_at: "2026-11-05T19:22:00Z", updated_at: "2026-11-05T19:22:00Z", project_id: null,
} as WorkspaceNote);

let root: Root;
let wide = true;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get() { return 1200; } });
  window.matchMedia = ((q: string) => ({ matches: wide, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
  m.notes = [note("a", 0, "Ideia A"), note("b", 480, "Ideia B"), note("c", 960, "Ideia C")];
  m.connections.connections = [];
  [m.execute, m.connections.connect, m.connections.disconnect, m.connections.refresh, m.success, m.info].forEach((f) => f.mockClear());
  m.hookArgs.length = 0;
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; wide = true; });

const render = (props: Record<string, unknown> = {}) => act(async () => root.render(createElement(NotesBoard, props)));
const menuItems = (noteId: string) => [...document.querySelector(`[data-note-id="${noteId}"]`)!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
const item = (noteId: string, text: string) => menuItems(noteId).find((b) => b.textContent!.includes(text))!;
const openNote = (noteId: string) => act(async () => (document.querySelector(`[data-note-id="${noteId}"] button[aria-label^="workspace.mural.edit"]`) as HTMLButtonElement).click());
const click = (el: Element) => act(async () => (el as HTMLElement).click());

describe("Meu Mural: connecting notes", () => {
  it("'Conectar a outra nota' enters connect mode; clicking another note saves the connection by IDs", async () => {
    await render();
    await click(item("a", "workspace.mural.connections.connect"));
    expect(document.querySelector('[data-testid="connect-mode"]')).not.toBeNull();
    expect(document.querySelector('[data-note-id="a"]')!.getAttribute("data-connect-source")).toBe("true");
    await openNote("b");
    expect(m.connections.connect).toHaveBeenCalledWith("a", "b");
    expect(document.querySelector('[data-testid="connect-mode"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull(); // the editor did not open
  });
  it("can be cancelled with the button or Esc, without saving", async () => {
    await render();
    await click(item("a", "workspace.mural.connections.connect"));
    await click([...document.querySelectorAll('[data-testid="connect-mode"] button')].find((b) => b.textContent === "workspace.mural.connections.cancel")!);
    expect(document.querySelector('[data-testid="connect-mode"]')).toBeNull();
    await click(item("a", "workspace.mural.connections.connect"));
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(document.querySelector('[data-testid="connect-mode"]')).toBeNull();
    expect(m.connections.connect).not.toHaveBeenCalled();
  });
  it("does not duplicate an existing pair (either direction) and ignores clicking the same note", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
    await render();
    await click(item("b", "workspace.mural.connections.connect"));
    await openNote("a");
    expect(m.connections.connect).not.toHaveBeenCalled();
    expect(m.info).toHaveBeenCalledWith("workspace.mural.connections.exists", expect.anything());
    await click(item("c", "workspace.mural.connections.connect"));
    await openNote("c");
    expect(m.connections.connect).not.toHaveBeenCalled();
  });
  it("removes one connection from either note's menu, without deleting any note", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }, { id: "bc", from_note_id: "b", to_note_id: "c" }];
    await render();
    expect(menuItems("b").filter((b) => b.textContent!.startsWith("workspace.mural.connections.remove"))).toHaveLength(2);
    // Note c has only its connection to b.
    const removeFromC = menuItems("c").filter((b) => b.textContent!.startsWith("workspace.mural.connections.remove"));
    expect(removeFromC).toHaveLength(1);
    await click(removeFromC[0]);
    expect(m.connections.disconnect).toHaveBeenCalledWith("bc");
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("draws the saved connections on the board", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
    await render();
    expect(document.querySelectorAll('[data-testid="note-connections"] line')).toHaveLength(1);
  });
  it("mobile (stacked grid): no arrows and no connect option; existing interactions unchanged", async () => {
    wide = false;
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
    await render();
    expect(document.querySelector('[data-testid="note-connections"]')).toBeNull();
    expect(item("a", "workspace.mural.connections.connect")).toBeUndefined();
    expect(item("a", "workspace.mural.edit")).toBeDefined();
  });
  it("Meu Mural uses the personal scope", async () => {
    await render();
    expect(m.hookArgs.at(-1)).toEqual([null, { readOnly: false }]);
  });
  it("project board: the same connection flow, scoped to that project, for any participant's notes", async () => {
    m.notes = [note("a", 0, "Ideia A", "owner"), note("b", 480, "Ideia B", "teacher")];
    await render({ projectId: "p1", isProjectOwner: false });
    expect(m.hookArgs.at(-1)).toEqual(["p1", { readOnly: false }]);
    await click(item("a", "workspace.mural.connections.connect")); // a note written by another participant
    await openNote("b");
    expect(m.connections.connect).toHaveBeenCalledWith("a", "b");
  });
  it("project board: removing a connection works for participants and keeps the notes", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
    await render({ projectId: "p1", isProjectOwner: false });
    await click(menuItems("a").find((b) => b.textContent!.startsWith("workspace.mural.connections.remove"))!);
    expect(m.connections.disconnect).toHaveBeenCalledWith("ab");
    expect(m.execute).not.toHaveBeenCalled();
  });
  it("archived project board: arrows stay visible, but there are no connection controls", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
    await render({ projectId: "p1", readOnly: true });
    expect(m.hookArgs.at(-1)).toEqual(["p1", { readOnly: true }]);
    expect(document.querySelectorAll('[data-testid="note-connections"] line')).toHaveLength(1);
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
  });
  it("isolation: a connection to a note that is not on this board is never drawn or listed", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }, { id: "ax", from_note_id: "a", to_note_id: "note-of-another-board" }];
    await render({ projectId: "p1" });
    expect(document.querySelectorAll('[data-testid="note-connections"] line')).toHaveLength(1);
    expect(menuItems("a").filter((b) => b.textContent!.startsWith("workspace.mural.connections.remove"))).toHaveLength(1);
  });
  for (const projectId of [undefined, "p1"]) {
    it(`optimistic delete (${projectId ?? "Meu Mural"}): the dialog closes at once; connections refresh only after the delete succeeds`, async () => {
      m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
      let finish!: (ok: boolean) => void;
      m.execute.mockImplementationOnce(() => new Promise<boolean>((r) => { finish = r; }));
      await render(projectId ? { projectId } : {});
      await click(item("a", "workspace.mural.delete"));
      const confirm = [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === "workspace.mural.delete")!;
      await click(confirm);
      expect(m.execute).toHaveBeenCalledWith({ type: "delete", id: "a" });
      expect(document.querySelector('[role="alertdialog"]')).toBeNull(); // no waiting on the server
      expect(m.connections.refresh).not.toHaveBeenCalled();
      await act(async () => { finish(true); });
      expect(m.connections.refresh).toHaveBeenCalledTimes(1);
    });
  }
  it("optimistic delete: a failed delete does not refresh connections (the note and its arrows come back)", async () => {
    m.connections.connections = [{ id: "ab", from_note_id: "a", to_note_id: "b" }];
    m.execute.mockImplementationOnce(async () => false);
    await render();
    await click(item("a", "workspace.mural.delete"));
    await click([...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].find((b) => b.textContent === "workspace.mural.delete")!);
    expect(m.connections.refresh).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[data-testid="note-connections"] line')).toHaveLength(1);
  });
  it("hidden while the migration is not applied", async () => {
    m.connections.available = false;
    await render();
    expect(item("a", "workspace.mural.connections.connect")).toBeUndefined();
    m.connections.available = true;
  });
});

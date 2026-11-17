// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";

const mocks = vi.hoisted(() => ({ persist: vi.fn(), fetch: vi.fn(), error: vi.fn(), success: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "teacher" }, session: { user: { id: "teacher" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success, dismiss: vi.fn() } }));
vi.mock("@/lib/workspace-note-images", () => ({ deleteAllNoteImages: mocks.cleanup, workspaceNoteImagesKey: (owner?: string) => ["workspace-note-images", owner] }));
vi.mock("@/lib/workspace-notes-data", () => ({
  workspaceNotesKey: (owner?: string, projectId: string | null = null) => ["workspace-notes", owner, projectId ?? "personal"],
  fetchWorkspaceNotes: mocks.fetch, persistNoteCommand: mocks.persist,
}));
import { useWorkspaceNotes } from "../src/hooks/use-workspace-notes";

const note = (id: string, user_id = "teacher"): WorkspaceNote => ({ id, user_id, title: null, content: id, color: "yellow", pinned: false,
  order_index: id.charCodeAt(0), pos_x: null, pos_y: null, created_at: "now", updated_at: "now" });
const deferred = () => { let resolve!: (v: unknown) => void; let reject!: (e: unknown) => void; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

let root: Root;
let api: ReturnType<typeof useWorkspaceNotes>;
async function mount(projectId: string | null, notes: WorkspaceNote[]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetch.mockResolvedValue(notes);
  mocks.cleanup.mockResolvedValue(undefined);
  const client = new QueryClient();
  function Probe() { api = useWorkspaceNotes(projectId); return null; }
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
  await settle();
}
afterEach(async () => { await act(async () => root.unmount()); });
const ids = () => api.notes?.map((n) => n.id);

for (const [label, projectId] of [["Meu Mural", null], ["mural de Projeto", "p1"]] as const) {
  describe(`optimistic delete — ${label}`, () => {
    it("removes the note at once, before the server answers, without blocking the board", async () => {
      await mount(projectId, [note("a"), note("b")]);
      const save = deferred();
      mocks.persist.mockReturnValueOnce(save.promise);
      let result!: Promise<boolean>;
      act(() => { result = api.execute({ type: "delete", id: "a" }); });
      await settle(); // next tick (React Query notifies observers asynchronously); the server has not answered
      expect(mocks.persist).toHaveBeenCalledOnce();
      expect(ids()).toEqual(["b"]);
      expect(api.pending).toBe(false); // no blocking state while the delete runs
      await act(async () => { save.resolve(null); await result; });
      expect(await result).toBe(true);
      expect(ids()).toEqual(["b"]);
      expect(mocks.persist).toHaveBeenCalledWith("teacher", { type: "delete", id: "a" }, expect.any(Array), projectId);
    });
    it("deletes several notes in a row without waiting for the previous ones", async () => {
      await mount(projectId, [note("a"), note("b"), note("c"), note("d"), note("e")]);
      const saves = ["a", "b", "c", "d"].map(() => deferred());
      saves.forEach((s) => mocks.persist.mockReturnValueOnce(s.promise));
      const results: Promise<boolean>[] = [];
      act(() => { for (const id of ["a", "b", "c", "d"]) results.push(api.execute({ type: "delete", id })); });
      await settle();
      expect(ids()).toEqual(["e"]); // all four gone while none of the saves has answered
      expect(mocks.persist).toHaveBeenCalledTimes(4); // running together, none waits for another
      await act(async () => { saves.forEach((s) => s.resolve(null)); await Promise.all(results); });
      expect(await Promise.all(results)).toEqual([true, true, true, true]);
      expect(ids()).toEqual(["e"]);
    });
    it("a failure restores only that note, with a discreet message; the others stay deleted", async () => {
      await mount(projectId, [note("a"), note("b"), note("c")]);
      const [sa, sb, sc] = [deferred(), deferred(), deferred()];
      mocks.persist.mockReturnValueOnce(sa.promise).mockReturnValueOnce(sb.promise).mockReturnValueOnce(sc.promise);
      const results: Promise<boolean>[] = [];
      act(() => { for (const id of ["a", "b", "c"]) results.push(api.execute({ type: "delete", id })); });
      await settle();
      await act(async () => { sb.reject({ message: "rls" }); sa.resolve(null); sc.resolve(null); await Promise.allSettled(results); });
      expect(await Promise.all(results)).toEqual([true, false, true]);
      await settle();
      expect(ids()).toEqual(["b"]);
      expect(mocks.error).toHaveBeenCalledWith("workspace.mural.deleteError", expect.anything());
    });
    it("a refetch while the delete is pending never brings the note back", async () => {
      await mount(projectId, [note("a"), note("b")]);
      const save = deferred();
      mocks.persist.mockReturnValueOnce(save.promise);
      let result!: Promise<boolean>;
      act(() => { result = api.execute({ type: "delete", id: "a" }); });
      await settle();
      // The server still lists the note (its delete has not committed yet).
      mocks.fetch.mockResolvedValue([note("a"), note("b")]);
      await act(async () => { await api.refetch(); });
      expect(ids()).toEqual(["b"]);
      await act(async () => { save.resolve(null); await result; });
      expect(ids()).toEqual(["b"]);
    });
  });
}

describe("project board specifics", () => {
  it("removes the files from the note author's folder (another participant), as before", async () => {
    await mount("p1", [note("a", "other-author"), note("b")]);
    mocks.persist.mockResolvedValueOnce(null);
    await act(async () => { await api.execute({ type: "delete", id: "a" }); });
    expect(mocks.cleanup).toHaveBeenCalledWith("teacher", "a", "other-author");
  });
});

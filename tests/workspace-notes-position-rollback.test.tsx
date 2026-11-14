// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";

const mocks = vi.hoisted(() => ({ persist: vi.fn(), fetch: vi.fn(), error: vi.fn(), success: vi.fn(), cleanup: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "teacher" }, session: { user: { id: "teacher" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success, dismiss: vi.fn() } }));
vi.mock("@/lib/workspace-note-images", () => ({ deleteAllNoteImages: mocks.cleanup, workspaceNoteImagesKey: (owner?: string) => ["workspace-note-images", owner] }));
vi.mock("@/lib/workspace-notes-data", () => ({
  workspaceNotesKey: (owner?: string) => ["workspace-notes", owner], fetchWorkspaceNotes: mocks.fetch, persistNoteCommand: mocks.persist,
}));
import { useWorkspaceNotes } from "../src/hooks/use-workspace-notes";

const saved: WorkspaceNote = { id: "a", user_id: "teacher", title: null, content: "a", color: "yellow", pinned: false, order_index: 0,
  pos_x: 48, pos_y: 72, created_at: "now", updated_at: "now" };
let root: Root;
let api: ReturnType<typeof useWorkspaceNotes>;
let client: QueryClient;
function Probe() { api = useWorkspaceNotes(); return null; }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.fetch.mockResolvedValue([saved]);
  client = new QueryClient();
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("note position persistence", () => {
  it("restores the previous position and shows an error when the save fails", async () => {
    let reject!: (error: unknown) => void;
    mocks.persist.mockReturnValue(new Promise((_, r) => { reject = r; }));
    let result!: Promise<boolean>;
    await act(async () => { result = api.execute({ type: "position", id: "a", x: 240, y: 96 }); await new Promise((r) => setTimeout(r, 0)); });
    expect(api.notes?.[0]).toMatchObject({ pos_x: 240, pos_y: 96 }); // optimistic while saving
    await act(async () => { reject({ message: "rls" }); await result; });
    expect(await result).toBe(false);
    expect(client.getQueryData<WorkspaceNote[]>(["workspace-notes", "teacher"])?.[0]).toMatchObject({ pos_x: 48, pos_y: 72 });
    expect(mocks.error).toHaveBeenCalledWith("workspace.mural.saveError", expect.anything());
  });
  it("keeps the saved row returned by the database", async () => {
    mocks.persist.mockResolvedValue({ ...saved, pos_x: 240, pos_y: 96 });
    await act(async () => { await api.execute({ type: "position", id: "a", x: 240, y: 96 }); });
    expect(mocks.persist).toHaveBeenCalledWith("teacher", { type: "position", id: "a", x: 240, y: 96 }, expect.any(Array), null);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(mocks.fetch).toHaveBeenCalledOnce(); // no extra reads around the drop
    expect(api.notes?.[0]).toMatchObject({ pos_x: 240, pos_y: 96 });
  });
  it("deleting a note removes its Storage files first; if that fails the note stays", async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error("storage denied"));
    let ok = true;
    await act(async () => { ok = await api.execute({ type: "delete", id: "a" }); });
    expect(ok).toBe(false);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(client.getQueryData<WorkspaceNote[]>(["workspace-notes", "teacher"])).toHaveLength(1);
    expect(mocks.error).toHaveBeenCalledWith("workspace.mural.saveError", expect.anything());
    mocks.cleanup.mockResolvedValueOnce(undefined);
    mocks.persist.mockResolvedValueOnce(null);
    await act(async () => { ok = await api.execute({ type: "delete", id: "a" }); });
    expect(ok).toBe(true);
    expect(mocks.cleanup).toHaveBeenLastCalledWith("teacher", "a");
    expect(mocks.cleanup.mock.invocationCallOrder.at(-1)!).toBeLessThan(mocks.persist.mock.invocationCallOrder.at(-1)!);
  });
  it("quiet saves skip the success toast so the caller reports the combined outcome", async () => {
    mocks.persist.mockResolvedValue({ ...saved, content: "b" });
    await act(async () => { await api.execute({ type: "edit", id: "a", draft: { title: "", content: "b", color: "yellow" } }, { quiet: true }); });
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

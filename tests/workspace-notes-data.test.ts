import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { fetchWorkspaceNotes, persistNoteCommand } from "../src/lib/workspace-notes-data";
const saved: WorkspaceNote = { id: "n", user_id: "teacher", title: null, content: "hello", color: "yellow", pinned: false, order_index: 0, created_at: "now", updated_at: "now" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "teacher" } }, error: null });
  mocks.result = { data: saved, error: null };
  const chain = {
    select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
    insert: mocks.insert.mockReturnThis(), update: mocks.update.mockReturnThis(), delete: mocks.delete.mockReturnThis(),
    single: vi.fn().mockImplementation(async () => mocks.result), maybeSingle: vi.fn().mockImplementation(async () => mocks.result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.result).then(resolve),
  };
  mocks.from.mockReturnValue(chain);
});

describe("Workspace session-client persistence", () => {
  it("blocks switched accounts before any note query or write", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(fetchWorkspaceNotes("teacher")).rejects.toThrow("authentication_changed");
    await expect(persistNoteCommand("teacher", { type: "delete", id: "n" }, [])).rejects.toThrow("authentication_changed");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("creates with Auth owner and editor ID, never client-supplied ownership", async () => {
    const command = { type: "create", id: "n", draft: { title: "", content: "hello", color: "yellow" } } as const;
    expect(await persistNoteCommand("teacher", command, [saved])).toEqual(saved);
    expect(mocks.insert).toHaveBeenCalledWith({ id: "n", user_id: "teacher", title: null, content: "hello", color: "yellow", pinned: false, order_index: 0 });
    await expect(persistNoteCommand("teacher", command, [{ ...saved, user_id: "other" }])).rejects.toThrow("note_not_found");
  });
  it("pins using a single-column owner/id-scoped update with saved readback", async () => {
    expect(await persistNoteCommand("teacher", { type: "pin", id: "n", pinned: true }, [saved])).toEqual(saved);
    expect(mocks.update).toHaveBeenCalledWith({ pinned: true });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "teacher");
    expect(mocks.eq).toHaveBeenCalledWith("id", "n");
  });
  it("reorders using only one row and order_index", async () => {
    await persistNoteCommand("teacher", { type: "move", id: "n", direction: 1 }, [{ ...saved, order_index: 5 }]);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({ order_index: 5 });
  });
  it("does not report failed or zero-row deletion as success", async () => {
    mocks.result = { data: null, error: { message: "network failure" } };
    await expect(persistNoteCommand("teacher", { type: "delete", id: "n" }, [])).rejects.toEqual({ message: "network failure" });
    mocks.result = { data: null, error: null };
    await expect(persistNoteCommand("teacher", { type: "delete", id: "n" }, [])).rejects.toThrow("note_not_found");
  });
  it("never masks read failures as an empty board", async () => {
    mocks.result = { data: null, error: { message: "RLS/network failure" } };
    await expect(fetchWorkspaceNotes("teacher")).rejects.toEqual({ message: "RLS/network failure" });
  });
  it("reads the current owner's notes only", async () => {
    mocks.result = { data: [saved], error: null };
    expect(await fetchWorkspaceNotes("teacher")).toEqual([saved]);
    expect(mocks.from).toHaveBeenCalledWith("workspace_notes");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "teacher");
  });
});
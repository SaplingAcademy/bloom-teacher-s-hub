import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { fetchWorkspaceNotes, persistNoteCommand } from "../src/lib/workspace-notes-data";
const saved: WorkspaceNote = { id: "n", user_id: "teacher", title: "", content: "hello", color: "yellow", pinned: false, order_index: 0, pos_x: null, pos_y: null, created_at: "now", updated_at: "now" };

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
    expect(mocks.insert).toHaveBeenCalledWith({ id: "n", user_id: "teacher", title: "", content: "hello", color: "yellow", pinned: false, order_index: 0 });
    await expect(persistNoteCommand("teacher", command, [{ ...saved, user_id: "other" }])).rejects.toThrow("note_not_found");
  });
  it("pins using a single-column owner/id-scoped update with saved readback", async () => {
    expect(await persistNoteCommand("teacher", { type: "pin", id: "n", pinned: true }, [saved])).toEqual(saved);
    expect(mocks.update).toHaveBeenCalledWith({ pinned: true });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "teacher");
    expect(mocks.eq).toHaveBeenCalledWith("id", "n");
  });
  it("changes the stacking layer using only one row and order_index", async () => {
    await persistNoteCommand("teacher", { type: "layer", id: "n", to: "front" }, [{ ...saved, order_index: 5 }]);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({ order_index: 5 });
  });
  it("saves a dropped position as pos_x/pos_y only, owner/id-scoped and without user_id", async () => {
    await persistNoteCommand("teacher", { type: "position", id: "n", x: 240, y: 96 }, [{ ...saved, pos_x: 240, pos_y: 96 }]);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledWith({ pos_x: 240, pos_y: 96 });
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "teacher");
    expect(mocks.eq).toHaveBeenCalledWith("id", "n");
    expect(mocks.from.mock.results[0].value.select).toHaveBeenCalledWith(expect.stringContaining("pos_x,pos_y"));
  });
  it("keeps saved coordinates within the database range", async () => {
    await persistNoteCommand("teacher", { type: "position", id: "n", x: -10.4, y: 25000 }, [saved]);
    expect(mocks.update).toHaveBeenCalledWith({ pos_x: 0, pos_y: 20000 });
    await expect(persistNoteCommand("teacher", { type: "position", id: "n", x: Number.NaN, y: 0 }, [saved])).rejects.toThrow("invalid_position");
  });
  it("propagates failed position writes so the board can roll back", async () => {
    mocks.result = { data: null, error: { message: "write rejected" } };
    await expect(persistNoteCommand("teacher", { type: "position", id: "n", x: 0, y: 0 }, [saved])).rejects.toEqual({ message: "write rejected" });
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
  it("recovers an already-committed create with the same editor UUID", async () => {
    const chain = mocks.from.mock.results[0]?.value ?? mocks.from();
    chain.single.mockResolvedValueOnce({ data: null, error: { code: "23505" } }).mockResolvedValueOnce({ data: saved, error: null });
    expect(await persistNoteCommand("teacher", { type: "create", id: "n", draft: { title: "", content: "hello", color: "yellow" } }, [saved])).toEqual(saved);
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith("id", "n");
  });
  it("propagates failed ordering writes instead of claiming success", async () => {
    mocks.result = { data: null, error: { message: "write rejected" } };
    await expect(persistNoteCommand("teacher", { type: "layer", id: "n", to: "back" }, [saved])).rejects.toEqual({ message: "write rejected" });
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "11111111-1111-4111-8111-111111111111";
const N1 = "22222222-2222-4222-8222-222222222222";
const N2 = "33333333-3333-4333-8333-333333333333";
const IMG = "44444444-4444-4444-8444-444444444444";
const PARTICIPANT = "55555555-5555-4555-8555-555555555555";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), remove: vi.fn(), list: vi.fn(), del: vi.fn(), eq: vi.fn(), tables: {} as Record<string, unknown> }));
vi.mock("@/lib/supabase", () => {
  const chain = (table: string) => {
    const self: any = {
      select: () => self, eq: (column: string, value: unknown) => { mocks.eq(table, column, value); return self; },
      delete: () => { mocks.del(table); return self; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: mocks.tables[table] ?? [], error: null }).then(resolve),
    };
    return self;
  };
  return { supabase: { auth: { getUser: mocks.getUser }, from: chain, storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) } } };
});
import { deleteAllNoteImages, deleteProjectNoteFiles } from "../src/lib/workspace-note-images";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
  mocks.tables = { workspace_notes: [{ id: N1, user_id: OWNER }, { id: N2, user_id: OWNER }], workspace_note_images: [{ id: IMG }] };
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
});

describe("project deletion: physical files first", () => {
  it("removes the files of every note on the project board and leaves rows to the cascade", async () => {
    await deleteProjectNoteFiles(OWNER, "project-1");
    expect(mocks.list).toHaveBeenCalledWith(`${OWNER}/notes/${N1}`, expect.anything());
    expect(mocks.list).toHaveBeenCalledWith(`${OWNER}/notes/${N2}`, expect.anything());
    expect(mocks.remove).toHaveBeenCalledWith([`${OWNER}/notes/${N1}/${IMG}.webp`]);
    expect(mocks.del).not.toHaveBeenCalled(); // archived projects block direct row deletes; the FK cascade removes them
  });
  it("shared board: removes each note's files from its author's folder and reads notes by project only", async () => {
    mocks.tables.workspace_notes = [{ id: N1, user_id: OWNER }, { id: N2, user_id: PARTICIPANT }];
    await deleteProjectNoteFiles(OWNER, "project-1");
    expect(mocks.list).toHaveBeenCalledWith(`${OWNER}/notes/${N1}`, expect.anything());
    expect(mocks.list).toHaveBeenCalledWith(`${PARTICIPANT}/notes/${N2}`, expect.anything());
    expect(mocks.remove).toHaveBeenCalledWith([`${PARTICIPANT}/notes/${N2}/${IMG}.webp`]);
    expect(mocks.eq).not.toHaveBeenCalledWith("workspace_notes", "user_id", expect.anything());
  });
  it("owner deleting a participant's note cleans the author's folder and leaves rows to the cascade", async () => {
    await deleteAllNoteImages(OWNER, N2, PARTICIPANT);
    expect(mocks.remove).toHaveBeenCalledWith([`${PARTICIPANT}/notes/${N2}/${IMG}.webp`]);
    expect(mocks.del).not.toHaveBeenCalled();
  });
  it("author deleting their own note still removes files and their image rows", async () => {
    await deleteAllNoteImages(OWNER, N1);
    expect(mocks.remove).toHaveBeenCalledWith([`${OWNER}/notes/${N1}/${IMG}.webp`]);
    expect(mocks.del).toHaveBeenCalledWith("workspace_note_images");
  });
  it("stops (throws) when Storage cannot remove a file, so the project is not deleted", async () => {
    mocks.remove.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(deleteProjectNoteFiles(OWNER, "project-1")).rejects.toEqual({ message: "denied" });
  });
  it("blocks a switched account before touching Storage", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(deleteProjectNoteFiles(OWNER, "project-1")).rejects.toThrow("authentication_changed");
    expect(mocks.list).not.toHaveBeenCalled();
  });
});

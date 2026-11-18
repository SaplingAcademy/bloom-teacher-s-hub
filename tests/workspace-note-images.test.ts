import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const storage = { upload: vi.fn(), remove: vi.fn(), list: vi.fn(), createSignedUrls: vi.fn() };
  return { getUser: vi.fn(), from: vi.fn(), storageFrom: vi.fn(() => storage), storage, insert: vi.fn(), del: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), result: { data: null as unknown, error: null as unknown } };
});
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from, storage: { from: mocks.storageFrom } } }));
import {
  deleteAllNoteImages, deleteNoteImage, describeImageError, fitWithin, groupNoteImages, noteImagePath, signNoteImageUrls, uploadNoteImage, validateImageFile,
  type NoteImage,
} from "../src/lib/workspace-note-images";

const OWNER = "11111111-1111-4111-8111-111111111111";
const NOTE = "22222222-2222-4222-8222-222222222222";
const IMG = "33333333-3333-4333-8333-333333333333";
const PATH = `${OWNER}/notes/${NOTE}/${IMG}.webp`;
const webp = () => new Blob(["x"], { type: "image/webp" });
const row: NoteImage = { id: IMG, user_id: OWNER, note_id: NOTE, file_path: PATH, mime_type: "image/webp", size_bytes: 1, width: 10, height: 5, order_index: 0, created_at: "now" };
const calls: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  mocks.getUser.mockResolvedValue({ data: { user: { id: OWNER } }, error: null });
  mocks.result = { data: [], error: null };
  mocks.single.mockResolvedValue({ data: row, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: row, error: null });
  mocks.storage.upload.mockImplementation(async () => { calls.push("upload"); return { data: {}, error: null }; });
  mocks.storage.remove.mockImplementation(async (paths: string[]) => { calls.push(`remove:${paths.length}`); return { data: [], error: null }; });
  mocks.storage.list.mockResolvedValue({ data: [], error: null });
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
    insert: mocks.insert.mockImplementation(function (this: unknown) { calls.push("insert"); return chain; }),
    delete: mocks.del.mockImplementation(function (this: unknown) { calls.push("deleteRows"); return chain; }),
    single: mocks.single, maybeSingle: mocks.maybeSingle,
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(mocks.result).then(resolve),
  };
  mocks.from.mockReturnValue(chain);
});

describe("note image rules", () => {
  it("builds only owner/notes/note/image.webp paths from UUIDs", () => {
    expect(noteImagePath(OWNER, NOTE, IMG)).toBe(PATH);
    expect(() => noteImagePath(OWNER, "../other", IMG)).toThrow("invalid_image_path");
    expect(() => noteImagePath("teacher/x", NOTE, IMG)).toThrow("invalid_image_path");
  });
  it("accepts JPG, PNG and WebP only and shrinks without enlarging", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(() => validateImageFile({ type, size: 1000 })).not.toThrow();
    for (const type of ["image/svg+xml", "image/gif", "application/pdf", ""]) expect(() => validateImageFile({ type, size: 1000 })).toThrow("image_type");
    expect(() => validateImageFile({ type: "image/png", size: 30 * 1024 * 1024 })).toThrow("image_too_large");
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
  it("groups images per note in saved order", () => {
    const grouped = groupNoteImages([{ ...row, id: "b", order_index: 2 }, { ...row, id: "a", order_index: 1 }, { ...row, id: "c", note_id: "other" }]);
    expect(grouped[NOTE].map((image) => image.id)).toEqual(["a", "b"]);
    expect(grouped.other).toHaveLength(1);
  });
});

describe("note image persistence", () => {
  it("uploads to the Auth owner's folder, then inserts metadata without form-supplied ownership", async () => {
    expect(await uploadNoteImage(OWNER, NOTE, { id: IMG, blob: webp(), width: 10, height: 5 }, 2)).toEqual(row);
    expect(mocks.storageFrom).toHaveBeenCalledWith("workspace-media");
    expect(mocks.storage.upload).toHaveBeenCalledWith(PATH, expect.any(Blob), expect.objectContaining({ upsert: false, contentType: "image/webp" }));
    expect(mocks.insert).toHaveBeenCalledWith({ id: IMG, user_id: OWNER, note_id: NOTE, file_path: PATH, mime_type: "image/webp", size_bytes: 1, width: 10, height: 5, order_index: 2 });
    expect(calls).toEqual(["upload", "insert"]);
  });
  it("blocks switched accounts before any Storage or table access", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "someone-else" } }, error: null });
    await expect(uploadNoteImage(OWNER, NOTE, { id: IMG, blob: webp(), width: 1, height: 1 }, 0)).rejects.toThrow("authentication_changed");
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("is idempotent on retry: an existing object and an existing row are accepted", async () => {
    mocks.storage.upload.mockResolvedValueOnce({ data: null, error: { statusCode: "409", message: "The resource already exists" } });
    mocks.single.mockResolvedValueOnce({ data: null, error: { code: "23505" } });
    expect(await uploadNoteImage(OWNER, NOTE, { id: IMG, blob: webp(), width: 10, height: 5 }, 0)).toEqual(row);
    expect(mocks.storage.remove).not.toHaveBeenCalled();
  });
  it("removes the uploaded file when metadata fails, so no orphan remains", async () => {
    mocks.single.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "rls" } });
    const error = await uploadNoteImage(OWNER, NOTE, { id: IMG, blob: webp(), width: 1, height: 1 }, 0).catch((e) => e);
    expect(describeImageError(error)).toEqual({ step: "metadata_insert", status: undefined, code: "42501", message: "rls" });
    expect(mocks.storage.remove).toHaveBeenCalledWith([PATH]);
  });
  it("never uploads non-WebP or oversized blobs", async () => {
    await expect(uploadNoteImage(OWNER, NOTE, { id: IMG, blob: new Blob(["x"], { type: "image/png" }), width: 1, height: 1 }, 0)).rejects.toThrow("image_too_large");
    expect(mocks.storage.upload).not.toHaveBeenCalled();
  });
  it("removes one image: file first, then its row; a Storage failure keeps the row", async () => {
    await deleteNoteImage(OWNER, { id: IMG, note_id: NOTE });
    expect(mocks.storage.remove).toHaveBeenCalledWith([PATH]);
    expect(calls).toEqual(["remove:1", "deleteRows"]);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", OWNER);
    calls.length = 0;
    mocks.storage.remove.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    expect(describeImageError(await deleteNoteImage(OWNER, { id: IMG, note_id: NOTE }).catch((e) => e)).step).toBe("storage_remove");
    expect(calls).not.toContain("deleteRows");
  });
  it("note deletion removes every file in the note folder (rows and leftovers), then the rows", async () => {
    const LEFT = "44444444-4444-4444-8444-444444444444";
    mocks.result = { data: [{ id: IMG }], error: null };
    mocks.storage.list.mockResolvedValueOnce({ data: [{ name: `${IMG}.webp` }, { name: `${LEFT}.webp` }], error: null });
    await deleteAllNoteImages(OWNER, NOTE);
    expect(mocks.storage.list).toHaveBeenCalledWith(`${OWNER}/notes/${NOTE}`, expect.anything());
    expect(mocks.storage.remove).toHaveBeenCalledWith([PATH, `${OWNER}/notes/${NOTE}/${LEFT}.webp`]);
    expect(calls.at(-1)).toBe("deleteRows");
  });
  it("note deletion stops if the folder cannot be read or cleaned", async () => {
    mocks.storage.list.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(deleteAllNoteImages(OWNER, NOTE)).rejects.toEqual({ message: "denied" });
    expect(mocks.storage.remove).not.toHaveBeenCalled();
    expect(calls).not.toContain("deleteRows");
  });
  it("signs all display URLs in one batched request", async () => {
    mocks.storage.createSignedUrls.mockResolvedValueOnce({ data: [{ path: PATH, signedUrl: "https://signed/1", error: null }], error: null });
    expect(await signNoteImageUrls([PATH])).toEqual({ [PATH]: "https://signed/1" });
    expect(mocks.storage.createSignedUrls).toHaveBeenCalledWith([PATH], 3600);
    expect(await signNoteImageUrls([])).toEqual({});
  });
  it("keeps the original Storage upload error and identifies the step without exposing paths or ids", async () => {
    mocks.storage.upload.mockResolvedValueOnce({ data: null, error: { statusCode: "403", error: "Unauthorized",
      message: `new row violates row-level security policy for ${PATH}`, details: `Failing row contains (${OWNER})` } });
    const error = await uploadNoteImage(OWNER, NOTE, { id: IMG, blob: webp(), width: 1, height: 1 }, 0).catch((e) => e);
    const summary = describeImageError(error);
    expect(summary).toMatchObject({ step: "storage_upload", status: "403", code: "Unauthorized" });
    expect(summary.message).toContain("row-level security");
    expect(JSON.stringify(summary)).not.toContain(OWNER);
    expect(JSON.stringify(summary)).not.toContain(IMG);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});

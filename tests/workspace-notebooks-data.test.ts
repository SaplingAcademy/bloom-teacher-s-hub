import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument, type NotebookPage, type WorkspaceNotebook } from "../src/lib/workspace-notebooks";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), notebook: null as unknown, pages: [] as unknown[], write: null as unknown, error: null as unknown, createError: null as unknown }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { fetchNotebook, fetchNotebooks, persistNotebook, persistNotebookPage, saveNotebookDocument } from "../src/lib/workspace-notebooks-data";
const bookId = "12345678-1234-1234-1234-123456789012";
const book: WorkspaceNotebook = { id: bookId, user_id: "owner", title: "Book", description: "", color: "forest", icon: "book-open", created_at: "2026-11-01", updated_at: "2026-11-02" };
const page: NotebookPage = { id: "p", notebook_id: bookId, user_id: "owner", title: "Page", content_json: emptyDocument(), plain_preview: "", pinned: false, order_index: 0, created_at: "2026-11-01", updated_at: "2026-11-06" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.notebook = book; mocks.pages = [page]; mocks.write = page; mocks.error = null; mocks.createError = null;
  mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    let writing = false;
    const result = (many = false) => ({ data: writing ? mocks.write : table === "workspace_notebooks" ? many ? [mocks.notebook] : mocks.notebook : many ? mocks.pages : mocks.write, error: mocks.error });
    const chain = {
      select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
      insert: (payload: unknown) => { writing = true; mocks.insert(payload); return chain; }, update: (payload: unknown) => { writing = true; mocks.update(payload); return chain; }, delete: () => { writing = true; mocks.delete(); return chain; },
      single: async () => mocks.createError ? { data: null, error: mocks.createError } : result(), maybeSingle: async () => result(), then: (resolve: (result: unknown) => unknown) => Promise.resolve(result(true)).then(resolve),
    }; return chain;
  });
});
describe("Owner scoped notebook persistence", () => {
  it("rejects switched accounts before reads or writes", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(fetchNotebooks("owner")).rejects.toThrow("authentication_changed");
    await expect(persistNotebook("owner", { type: "delete", id: bookId })).rejects.toThrow("authentication_changed");
    await expect(saveNotebookDocument("owner", bookId, "p", emptyDocument())).rejects.toThrow("authentication_changed");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("counts pages and uses page updates in the sorted summary", async () => {
    expect(await fetchNotebooks("owner")).toEqual([{ notebook: book, pageCount: 1, latestUpdate: "2026-11-06" }]);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  });
  it("creates notebook with authenticated owner and a stable retry UUID", async () => {
    mocks.write = book;
    expect(await persistNotebook("owner", { type: "create", id: bookId, draft: { title: " Book ", description: "", color: "forest", icon: "book-open" } })).toEqual(book);
    expect(mocks.insert).toHaveBeenCalledWith({ id: bookId, user_id: "owner", title: "Book", description: "", color: "forest", icon: "book-open" });
    mocks.createError = { code: "23505" };
    expect(await persistNotebook("owner", { type: "create", id: bookId, draft: book })).toEqual(book);
  });
  it("edits only allowed notebook fields and deletes only owner/id", async () => {
    mocks.write = book;
    await persistNotebook("owner", { type: "edit", id: bookId, draft: { ...book, title: "Updated" } });
    expect(mocks.update).toHaveBeenCalledWith({ title: "Updated", description: "", color: "forest", icon: "book-open" });
    expect(await persistNotebook("owner", { type: "delete", id: bookId })).toBeNull(); expect(mocks.delete).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner"); expect(mocks.eq).toHaveBeenCalledWith("id", bookId);
  });
  it("loads notebook pages by owner and notebook with validated JSON", async () => {
    expect(await fetchNotebook("owner", bookId)).toEqual({ notebook: book, pages: [page] });
    expect(mocks.eq).toHaveBeenCalledWith("notebook_id", bookId); expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
  });
  it("creates and duplicates into the same authenticated notebook with plain preview", async () => {
    const content = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] };
    await persistNotebookPage("owner", bookId, { type: "create", id: "copy-id", title: "Page (copy)", content, order_index: 1024 });
    expect(mocks.insert).toHaveBeenCalledWith({ id: "copy-id", user_id: "owner", notebook_id: bookId, title: "Page (copy)", content_json: content, plain_preview: "Original", pinned: false, order_index: 1024 });
  });
  it("refuses inaccessible notebook before inserting a page", async () => {
    mocks.notebook = null;
    await expect(persistNotebookPage("owner", bookId, { type: "create", id: "p", title: "Page", content: emptyDocument(), order_index: 0 })).rejects.toThrow("notebook_not_found");
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("renames, pins, moves and deletes page without ownership/parent transfer", async () => {
    await persistNotebookPage("owner", bookId, { type: "rename", id: "p", title: " New title " }); expect(mocks.update).toHaveBeenLastCalledWith({ title: "New title" });
    await persistNotebookPage("owner", bookId, { type: "pin", id: "p", pinned: true, order_index: 2048 }); expect(mocks.update).toHaveBeenLastCalledWith({ pinned: true, order_index: 2048 });
    await persistNotebookPage("owner", bookId, { type: "move", id: "p", order_index: -1024 }); expect(mocks.update).toHaveBeenLastCalledWith({ order_index: -1024 });
    expect(await persistNotebookPage("owner", bookId, { type: "delete", id: "p" })).toBeNull();
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner"); expect(mocks.eq).toHaveBeenCalledWith("notebook_id", bookId); expect(mocks.eq).toHaveBeenCalledWith("id", "p");
  });
  it("autosaves only structured document and derived preview with owner/parent/id filters", async () => {
    const content = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Lesson ideas" }] }] };
    expect(await saveNotebookDocument("owner", bookId, "p", content)).toEqual(page);
    expect(mocks.update).toHaveBeenCalledWith({ content_json: content, plain_preview: "Lesson ideas" });
    expect(mocks.eq).toHaveBeenCalledWith("notebook_id", bookId); expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner"); expect(mocks.eq).toHaveBeenCalledWith("id", "p");
  });
  it("propagates failed reads/writes and rejects zero affected rows", async () => {
    mocks.error = { message: "offline" }; await expect(fetchNotebooks("owner")).rejects.toEqual(mocks.error);
    await expect(saveNotebookDocument("owner", bookId, "p", emptyDocument())).rejects.toEqual(mocks.error);
    mocks.error = null; mocks.write = null;
    await expect(saveNotebookDocument("owner", bookId, "p", emptyDocument())).rejects.toThrow("notebook_not_found");
  });
});
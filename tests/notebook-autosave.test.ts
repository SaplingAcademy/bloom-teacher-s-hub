import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotebookAutosave } from "../src/lib/notebook-autosave";
import { emptyDocument, type RichDocument } from "../src/lib/workspace-notebooks";
const doc = (text: string): RichDocument => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
function deferred() { let resolve: (value: unknown) => void = () => {}; let reject: (error: Error) => void = () => {}; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
describe("Debounced notebook saving", () => {
  it("writes only the latest document after 700ms debounce, never on every key", async () => {
    const save = vi.fn().mockResolvedValue("saved"), confirm = vi.fn(); const manager = new NotebookAutosave(save, confirm);
    manager.seed("a", emptyDocument()); manager.edit("a", doc("h")); await vi.advanceTimersByTimeAsync(500); manager.edit("a", doc("hello"));
    await vi.advanceTimersByTimeAsync(699); expect(save).not.toHaveBeenCalled(); expect(manager.status("a")).toBe("saving");
    await vi.advanceTimersByTimeAsync(1); expect(save).toHaveBeenCalledExactlyOnceWith("a", doc("hello")); expect(manager.status("a")).toBe("saved");
  });
  it("does not show saved until persistence is confirmed", async () => {
    const request = deferred(), manager = new NotebookAutosave(() => request.promise, () => {}); manager.seed("a", emptyDocument()); manager.edit("a", doc("pending"));
    const flushing = manager.flush(); expect(manager.status("a")).toBe("saving"); expect(manager.getSnapshot().pending).toBe(true);
    request.resolve("saved"); expect(await flushing).toBe(true); expect(manager.status("a")).toBe("saved");
  });
  it("serializes rapid switches and never confirms an older version over new edits", async () => {
    const first = deferred(), save = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue("latest"), confirm = vi.fn();
    const manager = new NotebookAutosave(save, confirm); manager.seed("a", emptyDocument()); manager.seed("b", emptyDocument());
    manager.edit("a", doc("old")); const flushing = manager.flush(); manager.edit("a", doc("new")); manager.edit("b", doc("page b"));
    expect(save).toHaveBeenCalledTimes(1); expect(manager.document("a")).toEqual(doc("new")); first.resolve("old response"); await flushing;
    expect(save.mock.calls.map(([id, content]) => [id, content])).toEqual([["a", doc("old")], ["a", doc("new")], ["b", doc("page b")]]);
    expect(confirm).not.toHaveBeenCalledWith("a", "old response"); expect(confirm).toHaveBeenCalledTimes(2); expect(manager.getSnapshot().pending).toBe(false);
  });
  it("retains failed drafts across switches and retries exactly that content", async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue("saved"); const manager = new NotebookAutosave(save, () => {});
    manager.seed("a", emptyDocument()); manager.edit("a", doc("keep me")); expect(await manager.flush()).toBe(false);
    expect(manager.status("a")).toBe("error"); expect(manager.getSnapshot().pending).toBe(true); manager.seed("a", doc("stale server"));
    expect(manager.document("a")).toEqual(doc("keep me")); expect(await manager.flush()).toBe(true); expect(save).toHaveBeenLastCalledWith("a", doc("keep me"));
  });
  it("flushes pending debounce before leaving and stops navigation on a failed save", async () => {
    const manager = new NotebookAutosave(vi.fn().mockRejectedValue(new Error("offline")), () => {}); manager.seed("a", emptyDocument()); manager.edit("a", doc("important"));
    expect(await manager.flush()).toBe(false); expect(manager.getSnapshot().pending).toBe(true); expect(manager.document("a")).toEqual(doc("important"));
  });
  it("coalesces concurrent flush requests without duplicate writes", async () => {
    const request = deferred(), save = vi.fn(() => request.promise); const manager = new NotebookAutosave(save, () => {}); manager.seed("a", emptyDocument()); manager.edit("a", doc("once"));
    const first = manager.flush(), second = manager.flush(); request.resolve("saved"); expect(await first).toBe(true); expect(await second).toBe(true); expect(save).toHaveBeenCalledTimes(1);
  });
  it("persists a reverted draft after the older edit already started saving", async () => {
    const request = deferred(), save = vi.fn().mockImplementationOnce(() => request.promise).mockResolvedValue("saved"); const manager = new NotebookAutosave(save, () => {});
    manager.seed("a", doc("original")); manager.edit("a", doc("temporary")); const flushing = manager.flush(); manager.edit("a", doc("original")); request.resolve("old");
    await flushing; expect(save).toHaveBeenLastCalledWith("a", doc("original")); expect(manager.status("a")).toBe("saved");
  });
  it("does not write unchanged or reverted-before-save documents", async () => {
    const save = vi.fn(), manager = new NotebookAutosave(save, () => {}); manager.seed("a", doc("original")); manager.edit("a", doc("changed")); manager.edit("a", doc("original"));
    await vi.advanceTimersByTimeAsync(1000); expect(save).not.toHaveBeenCalled(); expect(manager.getSnapshot().pending).toBe(false);
  });
  it("keeps editors for different users isolated", async () => {
    const saveA = vi.fn().mockResolvedValue("A"), saveB = vi.fn().mockResolvedValue("B"); const a = new NotebookAutosave(saveA, () => {}), b = new NotebookAutosave(saveB, () => {});
    a.seed("same-page-id", emptyDocument()); b.seed("same-page-id", emptyDocument()); a.edit("same-page-id", doc("private A")); await a.flush();
    expect(b.document("same-page-id")).toEqual(emptyDocument()); expect(saveB).not.toHaveBeenCalled();
  });
});
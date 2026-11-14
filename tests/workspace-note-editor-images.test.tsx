// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteImage } from "../src/lib/workspace-note-images";

const mocks = vi.hoisted(() => ({ prepare: vi.fn() }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/lib/workspace-note-images", async (original) => ({ ...(await original<object>()), prepareImage: mocks.prepare }));
import { NoteEditor } from "../src/components/bloom/workspace/NoteEditor";
import { NoteImages } from "../src/components/bloom/workspace/NoteImages";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
let root: Root;
let n = 0;
const existing: NoteImage = { id: "img-1", user_id: "t", note_id: "note", file_path: "t/notes/note/img-1.webp", mime_type: "image/webp", size_bytes: 1, width: 400, height: 200, order_index: 0, created_at: "now" };
const onSave = vi.fn();
const onClose = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  URL.createObjectURL = vi.fn(() => `blob:preview-${++n}`);
  URL.revokeObjectURL = vi.fn();
  mocks.prepare.mockReset().mockImplementation(async () => ({ id: `new-${++n}`, blob: new Blob(["x"], { type: "image/webp" }), width: 10, height: 10 }));
  onSave.mockReset(); onClose.mockReset();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

const mount = (images: NoteImage[] = []) => act(async () => root.render(createElement(NoteEditor, {
  editor: { id: "note", isNew: images.length === 0, draft: { title: "", content: "texto", color: "yellow" } }, pending: false,
  images, urls: { [existing.file_path]: "https://signed/1" }, onClose, onSave,
})));
const input = () => document.querySelector<HTMLInputElement>('[data-testid="note-image-input"]')!;
const thumbs = () => document.querySelectorAll('[data-testid="editor-images"] li');
async function pick(count: number) {
  const files = Array.from({ length: count }, (_, i) => new File(["x"], `f${i}.png`, { type: "image/png" }));
  Object.defineProperty(input(), "files", { configurable: true, value: files });
  await act(async () => { input().dispatchEvent(new Event("change", { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
}
const submit = () => act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 0)); });
const removeButtons = () => Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="editor-images"] li button'));

describe("note editor images", () => {
  it("accepts at most 3 images per note, counting the saved ones", async () => {
    await mount([existing]);
    await pick(3);
    expect(mocks.prepare).toHaveBeenCalledTimes(2);
    expect(thumbs()).toHaveLength(3);
    expect(document.body.textContent).toContain("workspace.mural.images.limit");
    expect(document.querySelector<HTMLInputElement>("input[type=file]")!.accept).toBe("image/jpeg,image/png,image/webp");
  });
  it("removes images individually and sends only the changes on Save", async () => {
    await mount([existing]);
    await pick(1);
    onSave.mockResolvedValue({ failedRemovals: [], failedUploads: [] });
    await act(async () => removeButtons()[0].click()); // the saved image
    expect(thumbs()).toHaveLength(1);
    await submit();
    const [, changes, kept] = onSave.mock.calls[0];
    expect(changes.removed.map((image: NoteImage) => image.id)).toEqual(["img-1"]);
    expect(changes.added).toHaveLength(1);
    expect(kept).toEqual([]);
    expect(onClose).toHaveBeenCalled();
  });
  it("cancelling uploads nothing (images stay local until Save)", async () => {
    await mount();
    await pick(2);
    await act(async () => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "workspace.mural.cancel")!.click());
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
  it("keeps the text required", async () => {
    await act(async () => root.render(createElement(NoteEditor, {
      editor: { id: "note", isNew: true, draft: { title: "", content: " ", color: "yellow" } }, pending: false, onClose, onSave,
    })));
    await pick(1);
    await submit();
    expect(onSave).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("workspace.mural.contentRequired");
  });
  it("partial failure keeps the editor open and retries only the failed image", async () => {
    await mount();
    await pick(2);
    const ids = onSave.mock.calls.length === 0 ? mocks.prepare.mock.results : [];
    const [first, second] = await Promise.all(ids.map((r) => r.value));
    onSave.mockResolvedValueOnce({ failedRemovals: [], failedUploads: [second.id] });
    await submit();
    expect(onClose).not.toHaveBeenCalled();
    expect(thumbs()).toHaveLength(1);
    expect(document.body.textContent).toContain("workspace.mural.images.notSaved");
    expect(document.body.textContent).toContain("workspace.mural.images.saveError");
    onSave.mockResolvedValueOnce({ failedRemovals: [], failedUploads: [] });
    await submit();
    expect(onSave.mock.calls[1][1].added.map((image: { id: string }) => image.id)).toEqual([second.id]);
    expect(onSave.mock.calls[1][1].added.some((image: { id: string }) => image.id === first.id)).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });
  it("shows a processing error instead of adding an unsupported image", async () => {
    const { NoteImageError } = await import("../src/lib/workspace-note-images");
    mocks.prepare.mockRejectedValueOnce(new NoteImageError("image_type"));
    await mount();
    await pick(1);
    expect(thumbs()).toHaveLength(0);
    expect(document.body.textContent).toContain("workspace.mural.images.type");
  });
});

describe("images inside the note", () => {
  it("reserve their space from saved dimensions and never start a native image drag", async () => {
    await act(async () => root.render(createElement(NoteImages, { images: [existing], urls: { [existing.file_path]: "https://signed/1" }, label: (i: number) => `img ${i}` })));
    const img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://signed/1");
    expect(img.getAttribute("draggable")).toBe("false");
    expect((img.parentElement as HTMLElement).style.aspectRatio).toBe("400 / 200");
  });
  it("show a placeholder of the same size while the signed URL is loading", async () => {
    await act(async () => root.render(createElement(NoteImages, { images: [existing], urls: {}, label: (i: number) => `img ${i}` })));
    expect(document.querySelector("img")).toBeNull();
    expect((document.querySelector('[data-testid="note-images"] > span') as HTMLElement).style.aspectRatio).toBe("400 / 200");
  });
});

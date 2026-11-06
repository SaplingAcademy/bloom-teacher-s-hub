import { describe, expect, it } from "vitest";
import { documentPreview, emptyDocument, normalizeDocument, pageGroupEnd, pageMoveIndex, prepareNotebookDraft, safeNotebookLink, sortNotebookPages, sortNotebooks, type NotebookPage } from "../src/lib/workspace-notebooks";
const page = (id: string, order_index: number, pinned = false): NotebookPage => ({ id, order_index, pinned, user_id: "owner", notebook_id: "book", title: id, content_json: emptyDocument(), plain_preview: "", created_at: "2026-11-06", updated_at: "2026-11-06" });
describe("Notebook domain", () => {
  it("requires notebook titles and preserves optional description and chosen values", () => {
    expect(() => prepareNotebookDraft({ title: "  ", description: "", color: "forest", icon: "book-open" })).toThrow("title_required");
    expect(prepareNotebookDraft({ title: " Lessons ", description: " ", color: "lilac", icon: "palette" })).toEqual({ title: "Lessons", description: "", color: "lilac", icon: "palette" });
  });
  it("sorts notebook cards by latest page/notebook update", () => {
    const a = { notebook: { id: "a" } as never, latestUpdate: "2026-11-01", pageCount: 2 }, b = { notebook: { id: "b" } as never, latestUpdate: "2026-11-06", pageCount: 1 };
    expect(sortNotebooks([a, b]).map((s) => s.notebook.id)).toEqual(["b", "a"]);
  });
  it("always puts pinned pages first then persisted order", () => expect(sortNotebookPages([page("a", 0), page("b", 10, true), page("c", 2, true)]).map((p) => p.id)).toEqual(["c", "b", "a"]));
  it("moves only one page within its pin group without rewriting siblings", () => {
    const pages = [page("a", 0), page("b", 1024), page("p", 4000, true)];
    expect(pageMoveIndex(pages, pages[1], "first")).toBe(-1024);
    expect(pageMoveIndex(pages, pages[0], "last")).toBe(2048);
    expect(pageGroupEnd(pages, true)).toBe(5024);
    expect(pages.map((p) => p.order_index)).toEqual([0, 1024, 4000]);
  });
  it("serializes and restores all supported formatting in safe JSON", () => {
    const doc = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan", marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }] }] }, { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Prepare" }] }] }] }] };
    expect(normalizeDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    expect(documentPreview(doc)).toBe("Plan Prepare");
  });
  it("creates a detached document copy suitable for duplicating", () => {
    const source = emptyDocument(); const duplicate = normalizeDocument(source); duplicate.content.push({ type: "paragraph" });
    expect(source.content).toHaveLength(1); expect(duplicate.content).toHaveLength(2);
  });
  it("derives preview from text and hard breaks, not HTML", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }, { type: "hardBreak" }, { type: "text", text: " Text " }] }] };
    expect(documentPreview(doc)).toBe("<script>alert(1)</script> Text");
    expect(documentPreview({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x".repeat(300) }] }] })).toHaveLength(240);
  });
  it("rejects arbitrary HTML/image/script nodes instead of silently losing original content", () => {
    for (const type of ["html", "script", "image", "iframe"]) expect(() => normalizeDocument({ type: "doc", content: [{ type }] })).toThrow("invalid_document");
    expect(() => normalizeDocument("<p>text</p>")).toThrow("invalid_document");
  });
  it("strips unsafe link marks and arbitrary node attributes", () => {
    const doc = normalizeDocument({ type: "doc", onclick: "alert(1)", content: [{ type: "paragraph", attrs: { style: "evil" }, content: [{ type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] });
    expect(doc).toEqual({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Link", marks: [] }] }] });
  });
  it("allows only http(s) links without credentials or control characters", () => {
    expect(safeNotebookLink("https://example.com/lesson")).toBe("https://example.com/lesson");
    for (const url of ["javascript:alert(1)", "data:text/html,test", "mailto:a@example.com", "//example.com", "https://user:pass@example.com", " https://example.com", "java\nscript:test"]) expect(safeNotebookLink(url)).toBeNull();
  });
});
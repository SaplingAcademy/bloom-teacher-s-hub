// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { NotebookFormatting } from "../src/lib/notebook-formatting";
import { NotebookAutosave } from "../src/lib/notebook-autosave";
import { emptyDocument, normalizeDocument, type RichDocument, type RichNode } from "../src/lib/workspace-notebooks";

const paragraph = (text: string): RichNode => ({ type: "paragraph", content: [{ type: "text", text }] });
const list = (type: string, texts: string[], checked = false): RichNode => ({
  type, ...(type === "orderedList" ? { attrs: { start: 4 } } : {}),
  content: texts.map((text) => ({ type: type === "taskList" ? "taskItem" : "listItem", ...(type === "taskList" ? { attrs: { checked } } : {}), content: [paragraph(text)] })),
});
const editors: Editor[] = [];
function editor(content: RichNode[]): Editor {
  const instance = new Editor({ element: document.createElement("div"),
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false }), TaskList, TaskItem.configure({ nested: true }), NotebookFormatting],
    content: { type: "doc", content },
  });
  editors.push(instance);
  return instance;
}
function select(instance: Editor, text: string, start = 0, length = 0) {
  let found = false;
  instance.state.doc.descendants((node, pos) => {
    if (!found && node.isText && node.text?.includes(text)) {
      const from = pos + node.text.indexOf(text) + start;
      instance.commands.setTextSelection({ from, to: from + length }); found = true;
    }
  });
  if (!found) throw new Error(`Missing test text: ${text}`);
}
const json = (instance: Editor) => normalizeDocument(instance.getJSON());
afterEach(() => { editors.splice(0).forEach((instance) => instance.destroy()); });

describe("Independent notebook block formatting", () => {
  it("keeps a bullet item before a newly converted checklist item", () => {
    const instance = editor([list("bulletList", ["First", "Second"]), paragraph("Third")]);
    select(instance, "Second", 2); expect(instance.commands.toggleTaskList()).toBe(true);
    expect(json(instance).content).toEqual([list("bulletList", ["First"]), list("taskList", ["Second"]), paragraph("Third")]);
    expect(instance.state.selection.$from.parent.textContent).toBe("Second");
  });
  it("keeps a checked checklist item before a newly converted bullet item", () => {
    const instance = editor([list("taskList", ["First", "Second"], true), paragraph("Third")]);
    select(instance, "Second"); instance.commands.toggleBulletList();
    expect(json(instance).content).toEqual([list("taskList", ["First"], true), list("bulletList", ["Second"]), paragraph("Third")]);
  });
  it("wraps only the middle paragraph in a numbered list", () => {
    const instance = editor([paragraph("Before"), paragraph("Middle"), paragraph("After")]);
    select(instance, "Middle"); instance.commands.toggleOrderedList();
    const expected = list("orderedList", ["Middle"]); expected.attrs = { start: 1 };
    expect(json(instance).content).toEqual([paragraph("Before"), expected, paragraph("After")]);
  });
  it.each(["bulletList", "orderedList", "taskList"])("converts only the middle %s item and preserves both neighbors", (source) => {
    const instance = editor([list(source, ["Before", "Middle", "After"], true)]);
    select(instance, "Middle", 1);
    const target = source === "taskList" ? "orderedList" : "taskList";
    instance.commands.toggleList(target, target === "taskList" ? "taskItem" : "listItem");
    const output = json(instance).content;
    expect(output.map((node) => node.type)).toEqual([source, target, source]);
    expect(output[0]).toEqual(list(source, ["Before"], true));
    const after = list(source, ["After"], true); if (source === "orderedList") after.attrs = { start: 6 };
    expect(output[2]).toEqual(after);
    expect(instance.state.selection.$from.parent.textContent).toBe("Middle");
    expect(instance.state.selection.$from.parentOffset).toBe(1);
  });
  it("formats exactly the selected list items, not the unselected siblings", () => {
    const instance = editor([list("bulletList", ["Before", "One", "Two", "After"])]);
    select(instance, "One", 1); const from = instance.state.selection.from;
    select(instance, "Two", 2); const to = instance.state.selection.from;
    instance.commands.setTextSelection({ from: to, to: from });
    instance.commands.toggleTaskList();
    expect(json(instance).content).toEqual([list("bulletList", ["Before"]), list("taskList", ["One", "Two"]), list("bulletList", ["After"])]);
    expect(instance.state.selection.anchor).toBeGreaterThan(instance.state.selection.head);
  });
  it("preserves nested lists and inline marks inside a converted item", () => {
    const source = list("bulletList", ["Before", "Middle", "After"]);
    source.content?.[1].content?.push(list("taskList", ["Nested"], true));
    const instance = editor([source]); select(instance, "Middle", 0, 6); instance.commands.toggleBold();
    const original = json(instance).content[0].content?.[1].content;
    instance.commands.toggleTaskList();
    expect(json(instance).content[1].content?.[0].content).toEqual(original);
    expect(json(instance).content[0]).toEqual(list("bulletList", ["Before"]));
    expect(json(instance).content[2]).toEqual(list("bulletList", ["After"]));
  });
  it("keeps native list removal scoped to the selected item", () => {
    const instance = editor([list("bulletList", ["Before", "Middle", "After"])]);
    select(instance, "Middle"); instance.commands.toggleBulletList();
    expect(json(instance).content).toEqual([list("bulletList", ["Before"]), paragraph("Middle"), list("bulletList", ["After"])]);
  });
  it.each([["taskList", "Mod-Shift-9"], ["orderedList", "Mod-Shift-7"], ["bulletList", "Mod-Shift-8"]])("uses the same selection-scoped conversion for the %s shortcut", (target, shortcut) => {
    const source = target === "bulletList" ? "taskList" : "bulletList";
    const instance = editor([list(source, ["First", "Second"])]); select(instance, "Second");
    instance.commands.keyboardShortcut(shortcut);
    expect(json(instance).content.map((node) => node.type)).toEqual([source, target]);
  });
  it.each([["bold", "word"], ["italic", "one phrase"], ["underline", "word"]])("applies %s only to selected text", (mark, selected) => {
    const instance = editor([paragraph(`Before ${selected} after`)]);
    select(instance, selected, 0, selected.length); instance.commands.toggleMark(mark);
    expect(json(instance).content[0].content).toEqual([
      { type: "text", text: "Before " }, { type: "text", text: selected, marks: [{ type: mark }] }, { type: "text", text: " after" },
    ]);
  });
  it("bold at a collapsed cursor marks only subsequently typed text", () => {
    const instance = editor([paragraph("Before after")]); select(instance, "Before after", 7);
    instance.commands.toggleBold(); instance.commands.insertContent("new ");
    expect(json(instance).content[0].content).toEqual([{ type: "text", text: "Before " }, { type: "text", text: "new ", marks: [{ type: "bold" }] }, { type: "text", text: "after" }]);
  });
  it("preserves mixed blocks through undo and redo", () => {
    const instance = editor([list("bulletList", ["First", "Second"])]); const before = json(instance);
    select(instance, "Second"); instance.commands.toggleTaskList(); const after = json(instance);
    instance.commands.undo(); expect(json(instance)).toEqual(before);
    instance.commands.redo(); expect(json(instance)).toEqual(after);
  });
  it("saves and recovers mixed JSON without losing formats or page-scoped drafts", async () => {
    const persisted = new Map<string, RichDocument>();
    const manager = new NotebookAutosave(async (id, document) => { persisted.set(id, JSON.parse(JSON.stringify(document))); return document; }, () => {});
    manager.seed("page-a", emptyDocument()); manager.seed("page-b", emptyDocument());
    const instance = editor([list("bulletList", ["First", "Second"]), paragraph("Third"), { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title" }] }]);
    select(instance, "Second"); instance.commands.toggleTaskList();
    manager.edit("page-a", json(instance)); const expectedA = json(instance);
    const pageB = editor([paragraph("Other page")]); select(pageB, "Other page", 0, 5); pageB.commands.toggleItalic();
    manager.edit("page-b", json(pageB)); const expectedB = json(pageB);
    expect(manager.document("page-a")).toEqual(expectedA); expect(manager.document("page-b")).toEqual(expectedB);
    expect(await manager.flush()).toBe(true);
    const reopenedA = editor(persisted.get("page-a")?.content ?? []), reopenedB = editor(persisted.get("page-b")?.content ?? []);
    expect(json(reopenedA)).toEqual(expectedA); expect(json(reopenedB)).toEqual(expectedB);
    manager.dispose();
  });
});
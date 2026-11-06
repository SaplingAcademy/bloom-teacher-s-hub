import { commands, Extension, type RawCommands } from "@tiptap/core";
import { Fragment } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

const listNames = new Set(["bulletList", "orderedList", "taskList"]);

/** Keep native wrapping/lifting, but convert only selected items, never their whole list. */
export const toggleNotebookList: RawCommands["toggleList"] =
  (listTypeOrName, itemTypeOrName, keepMarks, attributes = {}) => (props) => {
    const { tr, state } = props;
    const listType = typeof listTypeOrName === "string" ? state.schema.nodes[listTypeOrName] : listTypeOrName;
    const itemType = typeof itemTypeOrName === "string" ? state.schema.nodes[itemTypeOrName] : itemTypeOrName;
    if (!listType || !itemType) return false;
    const { $from, $to, anchor, head } = tr.selection;
    let depth = $from.depth;
    while (depth > 0 && !listNames.has($from.node(depth).type.name)) depth -= 1;
    if (!depth || $to.depth < depth || $to.node(depth) !== $from.node(depth) || $from.node(depth).type === listType) {
      return commands.toggleList(listTypeOrName, itemTypeOrName, keepMarks, attributes)(props);
    }

    const source = $from.node(depth), listPos = $from.before(depth);
    const start = $from.index(depth), end = $to.index(depth) + 1;
    const before = source.content.cutByIndex(0, start), selected = source.content.cutByIndex(start, end);
    const after = source.content.cutByIndex(end, source.childCount);
    const converted = [];
    for (let index = 0; index < selected.childCount; index += 1) {
      const item = selected.child(index);
      // Only the selected item's wrapper changes. Its text, marks and nested lists remain intact.
      if (!itemType.validContent(item.content)) return false;
      converted.push(itemType.create(item.type === itemType ? item.attrs : null, item.content, item.marks));
    }
    const content = Fragment.fromArray(converted);
    if (!listType.validContent(content)) return false;
    const prefix = before.size ? source.type.create(source.attrs, before, source.marks) : null;
    const suffixAttrs = source.type.name === "orderedList" ? { ...source.attrs, start: source.attrs.start + end } : source.attrs;
    const replacements = [
      ...(prefix ? [prefix] : []),
      listType.create(attributes, content, source.marks),
      ...(after.size ? [source.type.create(suffixAttrs, after, source.marks)] : []),
    ];
    const parent = $from.node(depth - 1), parentIndex = $from.index(depth - 1);
    if (!parent.canReplace(parentIndex, parentIndex + 1, Fragment.fromArray(replacements))) return false;
    // The selected item contents keep their sizes; only the enclosing list boundary moves.
    const shift = (prefix?.nodeSize ?? 0) - before.size;
    tr.replaceWith(listPos, listPos + source.nodeSize, replacements);
    tr.setSelection(TextSelection.between(tr.doc.resolve(anchor + shift), tr.doc.resolve(head + shift)));
    return true;
  };

/** Existing list toolbar commands and their native keyboard shortcuts share this override. */
export const NotebookFormatting = Extension.create({
  name: "notebookFormatting",
  addCommands() { return { toggleList: toggleNotebookList }; },
});
export const NOTEBOOK_COLORS = ["forest", "terracotta", "lilac", "sky", "amber", "slate"] as const;
export const NOTEBOOK_ICONS = ["book-open", "graduation-cap", "lightbulb", "calendar", "target", "palette", "folder", "megaphone"] as const;
export interface RichNode { type: string; text?: string; attrs?: Record<string, string | number | boolean>; marks?: { type: string; attrs?: Record<string, string> }[]; content?: RichNode[] }
export type RichDocument = RichNode & { type: "doc"; content: RichNode[] };
export interface NotebookDraft { title: string; description: string; color: string; icon: string }
export interface WorkspaceNotebook extends NotebookDraft { id: string; user_id: string; created_at: string; updated_at: string }
export interface NotebookPage { id: string; notebook_id: string; user_id: string; title: string; content_json: RichDocument; plain_preview: string; pinned: boolean; order_index: number; created_at: string; updated_at: string }
export interface NotebookDetail { notebook: WorkspaceNotebook; pages: NotebookPage[] }
export interface NotebookSummary { notebook: WorkspaceNotebook; pageCount: number; latestUpdate: string }
export const emptyDocument = (): RichDocument => ({ type: "doc", content: [{ type: "paragraph" }] });
export const isNotebookId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export function safeNotebookLink(value: string): string | null {
  if (/^[\s\u0000-\u0020]/.test(value) || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

const children: Record<string, string[]> = {
  doc: ["paragraph", "heading", "bulletList", "orderedList", "taskList"],
  paragraph: ["text", "hardBreak"], heading: ["text", "hardBreak"],
  bulletList: ["listItem"], orderedList: ["listItem"], taskList: ["taskItem"],
  listItem: ["paragraph", "heading", "bulletList", "orderedList", "taskList"],
  taskItem: ["paragraph", "heading", "bulletList", "orderedList", "taskList"], text: [], hardBreak: [],
};

/** Whitelisted structured JSON only. Unknown structures fail visibly, never become a blank saved document. */
export function normalizeDocument(value: unknown): RichDocument {
  let count = 0;
  function node(raw: unknown, depth: number): RichNode {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || depth > 100 || ++count > 100_000) throw new Error("invalid_document");
    const input = raw as Record<string, unknown>;
    if (typeof input.type !== "string" || !Object.hasOwn(children, input.type)) throw new Error("invalid_document");
    const output: RichNode = { type: input.type };
    if (input.type === "text") {
      if (typeof input.text !== "string" || !input.text) throw new Error("invalid_document");
      output.text = input.text;
      if (input.marks !== undefined) {
        if (!Array.isArray(input.marks)) throw new Error("invalid_document");
        output.marks = input.marks.flatMap((mark: unknown) => {
          if (!mark || typeof mark !== "object") throw new Error("invalid_document");
          const m = mark as { type?: unknown; attrs?: { href?: unknown } };
          if (["bold", "italic", "underline"].includes(String(m.type))) return [{ type: String(m.type) }];
          if (m.type !== "link") throw new Error("invalid_document");
          const href = typeof m.attrs?.href === "string" ? safeNotebookLink(m.attrs.href) : null;
          return href ? [{ type: "link", attrs: { href, target: "_blank", rel: "noopener noreferrer" } }] : [];
        });
      }
    }
    const attrs = input.attrs && typeof input.attrs === "object" ? input.attrs as Record<string, unknown> : {};
    if (input.type === "heading") { if (![1, 2, 3].includes(Number(attrs.level))) throw new Error("invalid_document"); output.attrs = { level: Number(attrs.level) }; }
    if (input.type === "orderedList") output.attrs = { start: Number.isInteger(attrs.start) && Number(attrs.start) > 0 ? Number(attrs.start) : 1 };
    if (input.type === "taskItem") output.attrs = { checked: attrs.checked === true };
    if (input.content !== undefined) {
      if (!Array.isArray(input.content)) throw new Error("invalid_document");
      output.content = input.content.map((c) => node(c, depth + 1));
      if (output.content.some((c) => !children[output.type].includes(c.type))) throw new Error("invalid_document");
    }
    return output;
  }
  const doc = node(value, 0);
  if (doc.type !== "doc") throw new Error("invalid_document");
  return { ...doc, type: "doc", content: doc.content?.length ? doc.content : [{ type: "paragraph" }] };
}

export function documentPreview(value: unknown): string {
  const doc = normalizeDocument(value);
  function text(n: RichNode): string {
    if (n.type === "text") return n.text ?? "";
    if (n.type === "hardBreak") return "\n";
    return (n.content ?? []).map(text).join(["paragraph", "heading"].includes(n.type) ? "" : "\n");
  }
  return text(doc).replace(/\s+/g, " ").trim().slice(0, 240);
}

export function prepareNotebookDraft(draft: NotebookDraft): NotebookDraft {
  if (!draft.title.trim()) throw new Error("title_required");
  if (!NOTEBOOK_COLORS.some((c) => c === draft.color) || !draft.icon.trim()) throw new Error("invalid_notebook");
  return { title: draft.title.trim(), description: draft.description.trim(), color: draft.color, icon: draft.icon };
}
export const sortNotebookPages = (pages: NotebookPage[]) => [...pages].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order_index - b.order_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
export const sortNotebooks = (summaries: NotebookSummary[]) => [...summaries].sort((a, b) => b.latestUpdate.localeCompare(a.latestUpdate) || a.notebook.id.localeCompare(b.notebook.id));
export function pageGroupEnd(pages: NotebookPage[], pinned: boolean): number { return Math.max(-1024, ...pages.filter((p) => p.pinned === pinned).map((p) => p.order_index)) + 1024; }
export function pageMoveIndex(pages: NotebookPage[], page: NotebookPage, end: "first" | "last"): number {
  const group = pages.filter((p) => p.id !== page.id && p.pinned === page.pinned);
  const value = group.length ? (end === "first" ? Math.min(...group.map((p) => p.order_index)) - 1024 : Math.max(...group.map((p) => p.order_index)) + 1024) : page.order_index;
  if (value < -2147483648 || value > 2147483647) throw new Error("order_limit");
  return value;
}
export type NotebookCommand = { type: "create" | "edit"; id: string; draft: NotebookDraft } | { type: "delete"; id: string };
export type PageCommand = { type: "create"; id: string; title: string; content: RichDocument; order_index: number } | { type: "rename"; id: string; title: string } | { type: "pin"; id: string; pinned: boolean; order_index: number } | { type: "move"; id: string; order_index: number } | { type: "delete"; id: string };
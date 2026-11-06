import { supabase } from "@/lib/supabase";
import { documentPreview, isNotebookId, normalizeDocument, prepareNotebookDraft, sortNotebookPages, sortNotebooks, type NotebookCommand, type NotebookDetail, type NotebookPage, type NotebookSummary, type PageCommand, type RichDocument, type WorkspaceNotebook } from "./workspace-notebooks";
const NOTEBOOK_FIELDS = "id,user_id,title,description,color,icon,created_at,updated_at";
const PAGE_FIELDS = "id,notebook_id,user_id,title,content_json,plain_preview,pinned,order_index,created_at,updated_at";
export const workspaceNotebooksKey = (owner: string | undefined) => ["workspace-notebooks", owner] as const;
export const workspaceNotebookKey = (owner: string | undefined, id: string) => ["workspace-notebook", owner, id] as const;
async function ownerId(expected: string) {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expected || data.user?.id !== expected) throw new Error("authentication_changed");
  return data.user.id;
}
async function rows<T>(read: (start: number, end: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const result: T[] = [];
  for (let i = 0; ; i += 500) { const { data, error } = await read(i, i + 499); if (error) throw error; const page = (data ?? []) as T[]; result.push(...page); if (page.length < 500) return result; }
}
async function single<T>(read: PromiseLike<{ data: unknown; error: unknown }>): Promise<T> {
  const { data, error } = await read; if (error) throw error; if (!data) throw new Error("notebook_not_found"); return data as T;
}
async function requireNotebook(owner: string, id: string) {
  if (!isNotebookId(id)) throw new Error("notebook_not_found");
  return single<WorkspaceNotebook>(supabase.from("workspace_notebooks").select(NOTEBOOK_FIELDS).eq("user_id", owner).eq("id", id).maybeSingle());
}
export async function fetchNotebooks(expected: string): Promise<NotebookSummary[]> {
  const owner = await ownerId(expected);
  const [notebooks, pages] = await Promise.all([
    rows<WorkspaceNotebook>((a, b) => supabase.from("workspace_notebooks").select(NOTEBOOK_FIELDS).eq("user_id", owner).order("updated_at", { ascending: false }).order("id").range(a, b)),
    rows<Pick<NotebookPage, "notebook_id" | "updated_at">>((a, b) => supabase.from("workspace_notebook_pages").select("id,notebook_id,updated_at").eq("user_id", owner).order("id").range(a, b)),
  ]);
  const stats = new Map<string, { count: number; latest: string }>();
  pages.forEach((page) => { const prev = stats.get(page.notebook_id); stats.set(page.notebook_id, { count: (prev?.count ?? 0) + 1, latest: prev && prev.latest > page.updated_at ? prev.latest : page.updated_at }); });
  return sortNotebooks(notebooks.map((notebook) => ({ notebook, pageCount: stats.get(notebook.id)?.count ?? 0, latestUpdate: [notebook.updated_at, stats.get(notebook.id)?.latest ?? ""].sort().at(-1) ?? notebook.updated_at })));
}
export async function fetchNotebook(expected: string, id: string): Promise<NotebookDetail> {
  const owner = await ownerId(expected), notebook = await requireNotebook(owner, id);
  const pages = await rows<NotebookPage>((a, b) => supabase.from("workspace_notebook_pages").select(PAGE_FIELDS).eq("user_id", owner).eq("notebook_id", id).order("pinned", { ascending: false }).order("order_index").order("id").range(a, b));
  return { notebook, pages: sortNotebookPages(pages.map((p) => ({ ...p, content_json: normalizeDocument(p.content_json) }))) };
}
export async function persistNotebook(expected: string, command: NotebookCommand): Promise<WorkspaceNotebook | null> {
  const owner = await ownerId(expected), table = () => supabase.from("workspace_notebooks");
  if (command.type === "delete") { await single(table().delete().eq("user_id", owner).eq("id", command.id).select("id").maybeSingle()); return null; }
  const draft = prepareNotebookDraft(command.draft);
  if (command.type === "edit") return single(table().update(draft).eq("user_id", owner).eq("id", command.id).select(NOTEBOOK_FIELDS).maybeSingle());
  const { data, error } = await table().insert({ id: command.id, user_id: owner, ...draft }).select(NOTEBOOK_FIELDS).single();
  if (!error) return data as WorkspaceNotebook;
  if (error.code !== "23505") throw error;
  return single(table().select(NOTEBOOK_FIELDS).eq("user_id", owner).eq("id", command.id).maybeSingle());
}
export async function persistNotebookPage(expected: string, notebookId: string, command: PageCommand): Promise<NotebookPage | null> {
  const owner = await ownerId(expected);
  await requireNotebook(owner, notebookId);
  const table = () => supabase.from("workspace_notebook_pages");
  const scoped = () => table().eq("user_id", owner).eq("notebook_id", notebookId).eq("id", command.id);
  if (command.type === "delete") { await single(table().delete().eq("user_id", owner).eq("notebook_id", notebookId).eq("id", command.id).select("id").maybeSingle()); return null; }
  if (command.type === "create") {
    if (!command.title.trim()) throw new Error("title_required");
    const document = normalizeDocument(command.content);
    const { data, error } = await table().insert({ id: command.id, user_id: owner, notebook_id: notebookId, title: command.title.trim(), content_json: document, plain_preview: documentPreview(document), pinned: false, order_index: command.order_index }).select(PAGE_FIELDS).single();
    if (!error) return data as NotebookPage;
    if (error.code !== "23505") throw error;
    return single(scoped().select(PAGE_FIELDS).maybeSingle());
  }
  const patch = command.type === "rename" ? { title: command.title.trim() } : command.type === "pin" ? { pinned: command.pinned, order_index: command.order_index } : { order_index: command.order_index };
  if (command.type === "rename" && !command.title.trim()) throw new Error("title_required");
  return single(table().update(patch).eq("user_id", owner).eq("notebook_id", notebookId).eq("id", command.id).select(PAGE_FIELDS).maybeSingle());
}
export async function saveNotebookDocument(expected: string, notebookId: string, pageId: string, content: RichDocument): Promise<NotebookPage> {
  const owner = await ownerId(expected), document = normalizeDocument(content);
  // FK + RLS enforce ownership; writes never contain user_id or notebook_id.
  return single(supabase.from("workspace_notebook_pages").update({ content_json: document, plain_preview: documentPreview(document) }).eq("user_id", owner).eq("notebook_id", notebookId).eq("id", pageId).select(PAGE_FIELDS).maybeSingle());
}
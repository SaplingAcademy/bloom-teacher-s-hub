// Pure rules for personal Workspace projects. No I/O: persistence lives in workspace-projects-data.ts.
export const PROJECT_COLORS = ["forest", "terracotta", "lilac", "sky", "amber", "slate"] as const;
export const PROJECT_ICONS = ["folder", "book-open", "graduation-cap", "lightbulb", "calendar", "megaphone", "target", "palette"] as const;
export const ITEM_TYPES = ["task", "checklist", "note", "link"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export type ProjectIcon = (typeof PROJECT_ICONS)[number];
export type ProjectStatus = "active" | "archived";
export type ItemType = (typeof ITEM_TYPES)[number];
export type StatusFilter = "active" | "archived" | "all";

export interface WorkspaceProject {
  id: string; user_id: string; title: string; description: string; color: ProjectColor; icon: string;
  status: ProjectStatus; created_at: string; updated_at: string;
}
export interface WorkspacePhase { id: string; project_id: string; user_id: string; title: string; order_index: number; created_at: string; updated_at: string }
export interface WorkspaceItem {
  id: string; project_id: string; phase_id: string | null; user_id: string; type: ItemType; title: string; content: string;
  completed: boolean; order_index: number; meta: Record<string, unknown>; created_at: string; updated_at: string;
}
export interface ProjectDetail { project: WorkspaceProject; phases: WorkspacePhase[]; items: WorkspaceItem[] }
export interface ProjectDraft { title: string; description: string; color: ProjectColor; icon: string }
export interface ItemDraft { type: ItemType; title: string; content: string; url: string; phase_id: string | null }
export interface Progress { done: number; total: number; percent: number }
export interface OrderUpdate { id: string; order_index: number }

export function prepareProjectDraft(draft: ProjectDraft): ProjectDraft {
  const title = draft.title.trim();
  if (!title) throw new Error("title_required");
  if (!PROJECT_COLORS.includes(draft.color)) throw new Error("invalid_color");
  const icon = (PROJECT_ICONS as readonly string[]).includes(draft.icon) ? draft.icon : "folder";
  return { title, description: draft.description.trim(), color: draft.color, icon };
}

/** Only http(s) URLs are accepted; returns the normalized href or null. */
export function safeUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let value = raw.trim();
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!url.hostname || !url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.href;
  } catch { return null; }
}

export interface PreparedItem { type: ItemType; title: string; content: string; meta: Record<string, unknown>; phase_id: string | null }
export function prepareItemDraft(draft: ItemDraft, phases: readonly WorkspacePhase[]): PreparedItem {
  if (!ITEM_TYPES.includes(draft.type)) throw new Error("invalid_type");
  const title = draft.title.trim();
  if (!title) throw new Error("title_required");
  if (draft.phase_id && !phases.some((phase) => phase.id === draft.phase_id)) throw new Error("phase_not_in_project");
  let meta: Record<string, unknown> = {};
  if (draft.type === "link") {
    const url = safeUrl(draft.url);
    if (!url) throw new Error("invalid_url");
    meta = { url };
  }
  return { type: draft.type, title, content: draft.type === "link" ? "" : draft.content.trim(), meta, phase_id: draft.phase_id };
}

export const isTrackable = (item: Pick<WorkspaceItem, "type">) => item.type === "task" || item.type === "checklist";

export function computeProgress(items: readonly Pick<WorkspaceItem, "type" | "completed">[]): Progress {
  const trackable = items.filter(isTrackable);
  const done = trackable.filter((item) => item.completed).length;
  // No tasks means nothing achieved yet: 0%, never 100%.
  return { done, total: trackable.length, percent: trackable.length ? Math.round((done / trackable.length) * 100) : 0 };
}
export const phaseProgress = (items: readonly WorkspaceItem[], phaseId: string) => computeProgress(items.filter((item) => item.phase_id === phaseId));

export function filterAndSortProjects(projects: readonly WorkspaceProject[], filter: StatusFilter): WorkspaceProject[] {
  return projects.filter((p) => filter === "all" || p.status === filter)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
}

const byOrder = <T extends { order_index: number; created_at: string; id: string }>(a: T, b: T) =>
  a.order_index - b.order_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
export const sortPhases = (phases: readonly WorkspacePhase[]) => [...phases].sort(byOrder);
export const containerItems = (items: readonly WorkspaceItem[], phaseId: string | null) =>
  items.filter((item) => item.phase_id === phaseId).sort(byOrder);
export const nextOrder = (rows: readonly { order_index: number }[]) => rows.reduce((max, row) => Math.max(max, row.order_index + 1), 0);

/** Moves one row up/down by renumbering only the rows whose order_index actually changes. */
export function reorder<T extends { id: string; order_index: number; created_at: string }>(sorted: readonly T[], id: string, direction: -1 | 1): OrderUpdate[] {
  const index = sorted.findIndex((row) => row.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= sorted.length) return [];
  const ids = sorted.map((row) => row.id);
  [ids[index], ids[target]] = [ids[target], ids[index]];
  return ids.flatMap((rowId, order) => (sorted.find((row) => row.id === rowId)!.order_index === order ? [] : [{ id: rowId, order_index: order }]));
}

export type DetailCommand =
  | { type: "editProject"; draft: ProjectDraft }
  | { type: "setStatus"; status: ProjectStatus }
  | { type: "createPhase"; id: string; title: string; order_index: number }
  | { type: "renamePhase"; id: string; title: string }
  | { type: "deletePhase"; id: string }
  | { type: "reorderPhases"; updates: OrderUpdate[] }
  | { type: "createItem"; id: string; item: PreparedItem; order_index: number }
  | { type: "editItem"; id: string; item: PreparedItem; order_index: number }
  | { type: "toggleItem"; id: string; completed: boolean }
  | { type: "deleteItem"; id: string }
  | { type: "reorderItems"; updates: OrderUpdate[] };

const applyOrder = <T extends { id: string; order_index: number }>(rows: T[], updates: OrderUpdate[]) =>
  rows.map((row) => { const u = updates.find((entry) => entry.id === row.id); return u ? { ...row, order_index: u.order_index } : row; });

/** Optimistic, immutable application mirroring what the database will store. */
export function applyDetailCommand(detail: ProjectDetail, command: DetailCommand, now: string): ProjectDetail {
  const { project, phases, items } = detail;
  switch (command.type) {
    case "editProject": return { ...detail, project: { ...project, ...prepareProjectDraft(command.draft), updated_at: now } };
    case "setStatus": return { ...detail, project: { ...project, status: command.status, updated_at: now } };
    case "createPhase": return { ...detail, phases: [...phases, { id: command.id, project_id: project.id, user_id: project.user_id, title: command.title.trim(), order_index: command.order_index, created_at: now, updated_at: now }] };
    case "renamePhase": return { ...detail, phases: phases.map((p) => (p.id === command.id ? { ...p, title: command.title.trim(), updated_at: now } : p)) };
    // Mirrors FK ON DELETE SET NULL (phase_id): items stay in the project's general area.
    case "deletePhase": return { ...detail, phases: phases.filter((p) => p.id !== command.id), items: items.map((i) => (i.phase_id === command.id ? { ...i, phase_id: null } : i)) };
    case "reorderPhases": return { ...detail, phases: applyOrder(phases, command.updates) };
    case "createItem": return { ...detail, items: [...items, { id: command.id, project_id: project.id, user_id: project.user_id, ...command.item, completed: false, order_index: command.order_index, created_at: now, updated_at: now }] };
    case "editItem": return { ...detail, items: items.map((i) => (i.id === command.id ? { ...i, ...command.item, completed: isTrackable(command.item) ? i.completed : false, order_index: command.order_index, updated_at: now } : i)) };
    case "toggleItem": return { ...detail, items: items.map((i) => (i.id === command.id ? { ...i, completed: command.completed, updated_at: now } : i)) };
    case "deleteItem": return { ...detail, items: items.filter((i) => i.id !== command.id) };
    case "reorderItems": return { ...detail, items: applyOrder(items, command.updates) };
  }
}

export const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

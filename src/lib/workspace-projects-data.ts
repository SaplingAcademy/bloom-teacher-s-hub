import { supabase } from "@/lib/supabase";
import { computeProgress, isUuid, prepareProjectDraft, type DetailCommand, type ProjectDetail, type ProjectDraft, type Progress, type ProjectStatus, type WorkspaceItem, type WorkspacePhase, type WorkspaceProject } from "./workspace-projects";

const PROJECT_FIELDS = "id,user_id,title,description,color,icon,status,created_at,updated_at";
const PHASE_FIELDS = "id,project_id,user_id,title,order_index,created_at,updated_at";
const ITEM_FIELDS = "id,project_id,phase_id,user_id,type,title,content,completed,order_index,meta,created_at,updated_at";
const PAGE = 500;

export const workspaceProjectsKey = (userId: string | undefined) => ["workspace-projects", userId] as const;
export const workspaceProjectKey = (userId: string | undefined, projectId: string) => ["workspace-project", userId, projectId] as const;
export interface ProjectSummary { project: WorkspaceProject; progress: Progress }

export async function authenticatedOwner(expectedId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expectedId || data.user?.id !== expectedId) throw new Error("authentication_changed");
  return data.user.id;
}

// Read every page instead of silently truncating at the Data API row limit.
async function readAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await build(offset, offset + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

export async function fetchProjectSummaries(expectedId: string): Promise<ProjectSummary[]> {
  const owner = await authenticatedOwner(expectedId);
  const [projects, items] = await Promise.all([
    readAll<WorkspaceProject>((a, b) => supabase.from("workspace_projects").select(PROJECT_FIELDS).eq("user_id", owner).order("updated_at", { ascending: false }).order("id").range(a, b)),
    readAll<Pick<WorkspaceItem, "id" | "project_id" | "type" | "completed">>((a, b) => supabase.from("workspace_project_items").select("id,project_id,type,completed").eq("user_id", owner).in("type", ["task", "checklist"]).order("id").range(a, b)),
  ]);
  return projects.map((project) => ({ project, progress: computeProgress(items.filter((item) => item.project_id === project.id)) }));
}

/** Missing and inaccessible projects are indistinguishable by design (RLS hides foreign rows). */
export async function fetchProjectDetail(expectedId: string, projectId: string): Promise<ProjectDetail> {
  const owner = await authenticatedOwner(expectedId);
  if (!isUuid(projectId)) throw new Error("project_not_found");
  const { data: project, error } = await supabase.from("workspace_projects").select(PROJECT_FIELDS).eq("user_id", owner).eq("id", projectId).maybeSingle();
  if (error) throw error;
  if (!project) throw new Error("project_not_found");
  const [phases, items] = await Promise.all([
    readAll<WorkspacePhase>((a, b) => supabase.from("workspace_project_phases").select(PHASE_FIELDS).eq("user_id", owner).eq("project_id", projectId).order("order_index").order("id").range(a, b)),
    readAll<WorkspaceItem>((a, b) => supabase.from("workspace_project_items").select(ITEM_FIELDS).eq("user_id", owner).eq("project_id", projectId).order("order_index").order("id").range(a, b)),
  ]);
  return { project: project as WorkspaceProject, phases, items };
}

const check = ({ error }: { error: unknown }) => { if (error) throw error; };
async function single<T>(promise: PromiseLike<{ data: unknown; error: unknown }>, notFound: string): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  if (!data) throw new Error(notFound);
  return data as T;
}

export type ListCommand =
  | { type: "create"; id: string; draft: ProjectDraft }
  | { type: "edit"; id: string; draft: ProjectDraft }
  | { type: "setStatus"; id: string; status: ProjectStatus }
  | { type: "delete"; id: string };

export async function persistListCommand(expectedId: string, command: ListCommand): Promise<WorkspaceProject | null> {
  const owner = await authenticatedOwner(expectedId);
  const projects = () => supabase.from("workspace_projects");
  if (command.type === "delete") {
    await single(projects().delete().eq("user_id", owner).eq("id", command.id).select("id").maybeSingle(), "project_not_found");
    return null;
  }
  if (command.type === "create") {
    const { data, error } = await projects().insert({ id: command.id, user_id: owner, ...prepareProjectDraft(command.draft), status: "active" }).select(PROJECT_FIELDS).single();
    if (!error) return data as WorkspaceProject;
    // Same dialog keeps its UUID across uncertain retries: read the row back instead of duplicating.
    if ((error as { code?: string }).code !== "23505") throw error;
    return single(projects().select(PROJECT_FIELDS).eq("user_id", owner).eq("id", command.id).maybeSingle(), "project_not_found");
  }
  const patch = command.type === "edit" ? prepareProjectDraft(command.draft) : { status: command.status };
  return single(projects().update(patch).eq("user_id", owner).eq("id", command.id).select(PROJECT_FIELDS).maybeSingle(), "project_not_found");
}

/** Every write filters by Auth owner and the current project; user_id/project_id are never updated. */
export async function persistDetailCommand(expectedId: string, projectId: string, command: DetailCommand): Promise<void> {
  const owner = await authenticatedOwner(expectedId);
  const phases = () => supabase.from("workspace_project_phases");
  const items = () => supabase.from("workspace_project_items");
  const project = () => supabase.from("workspace_projects");
  switch (command.type) {
    case "editProject":
      await single(project().update(prepareProjectDraft(command.draft)).eq("user_id", owner).eq("id", projectId).select("id").maybeSingle(), "project_not_found"); return;
    case "setStatus":
      await single(project().update({ status: command.status }).eq("user_id", owner).eq("id", projectId).select("id").maybeSingle(), "project_not_found"); return;
    case "createPhase": {
      const { error } = await phases().insert({ id: command.id, project_id: projectId, user_id: owner, title: command.title.trim(), order_index: command.order_index });
      if (error && (error as { code?: string }).code !== "23505") throw error; return;
    }
    case "renamePhase":
      await single(phases().update({ title: command.title.trim() }).eq("user_id", owner).eq("project_id", projectId).eq("id", command.id).select("id").maybeSingle(), "phase_not_found"); return;
    case "deletePhase":
      // FK ON DELETE SET NULL (phase_id) keeps the phase's items in the general area.
      await single(phases().delete().eq("user_id", owner).eq("project_id", projectId).eq("id", command.id).select("id").maybeSingle(), "phase_not_found"); return;
    case "reorderPhases":
      for (const u of command.updates) await single(phases().update({ order_index: u.order_index }).eq("user_id", owner).eq("project_id", projectId).eq("id", u.id).select("id").maybeSingle(), "phase_not_found");
      return;
    case "createItem": {
      const { error } = await items().insert({ id: command.id, project_id: projectId, user_id: owner, ...command.item, completed: false, order_index: command.order_index });
      if (error && (error as { code?: string }).code !== "23505") throw error; return;
    }
    case "editItem": {
      const patch: Record<string, unknown> = { ...command.item, order_index: command.order_index };
      if (command.item.type === "note" || command.item.type === "link") patch.completed = false;
      await single(items().update(patch).eq("user_id", owner).eq("project_id", projectId).eq("id", command.id).select("id").maybeSingle(), "item_not_found"); return;
    }
    case "toggleItem":
      await single(items().update({ completed: command.completed }).eq("user_id", owner).eq("project_id", projectId).eq("id", command.id).in("type", ["task", "checklist"]).select("id").maybeSingle(), "item_not_found"); return;
    case "deleteItem":
      await single(items().delete().eq("user_id", owner).eq("project_id", projectId).eq("id", command.id).select("id").maybeSingle(), "item_not_found"); return;
    case "reorderItems":
      for (const u of command.updates) await single(items().update({ order_index: u.order_index }).eq("user_id", owner).eq("project_id", projectId).eq("id", u.id).select("id").maybeSingle(), "item_not_found");
      return;
  }
  check({ error: null });
}

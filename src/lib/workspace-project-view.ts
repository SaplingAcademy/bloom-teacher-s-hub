import { getUserItem, setUserItem } from "@/lib/user-storage";

/**
 * Lista | Kanban preference per teacher and per project. Display-only, kept in browser storage via
 * user-storage (key `bloom.workspace.projectView.<projectId>:<userId>`, purged on logout/account
 * switch); never used for data or permissions. Missing/invalid/unavailable storage → "list".
 */
export type ProjectView = "list" | "kanban";
const base = (projectId: string) => `bloom.workspace.projectView.${projectId}`;

export function readProjectView(userId: string | null | undefined, projectId: string): ProjectView {
  if (!userId) return "list";
  try { return getUserItem(base(projectId), userId) === "kanban" ? "kanban" : "list"; } catch { return "list"; }
}

export function saveProjectView(userId: string | null | undefined, projectId: string, view: ProjectView): void {
  if (!userId) return;
  try { setUserItem(base(projectId), view, userId); } catch { /* storage blocked: keep the in-memory choice */ }
}

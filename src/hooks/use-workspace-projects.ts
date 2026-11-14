import { useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useLanguage } from "./use-language";
import { applyDetailCommand, computeProgress, prepareProjectDraft, type DetailCommand, type ProjectDetail } from "@/lib/workspace-projects";
import { deleteProjectNoteFiles, workspaceNoteImagesKey } from "@/lib/workspace-note-images";
import { workspaceNotesKey } from "@/lib/workspace-notes-data";
import { fetchProjectDetail, fetchProjectSummaries, persistDetailCommand, persistListCommand, workspaceProjectKey, workspaceProjectsKey, type ListCommand, type ProjectSummary } from "@/lib/workspace-projects-data";

const FEEDBACK = "workspace-projects-feedback";

function useOwner() {
  const { user, session, loading } = useAuth();
  const owner = user?.id;
  return { owner, loading, authenticated: !loading && Boolean(owner && session?.user.id === owner) };
}

/** Synchronous latch + mutation key: rapid repeated clicks never queue duplicate writes. */
function useLatch(key: readonly unknown[]) {
  const client = useQueryClient();
  const lock = useRef(false);
  return async (run: () => Promise<unknown>) => {
    if (lock.current || client.isMutating({ mutationKey: key })) return false;
    lock.current = true;
    try { await run(); return true; } catch { return false; } finally { lock.current = false; }
  };
}

export function applyListCommand(list: ProjectSummary[], command: ListCommand, owner: string, now: string): ProjectSummary[] {
  if (command.type === "delete") return list.filter((entry) => entry.project.id !== command.id);
  if (command.type === "create") {
    return [{ project: { id: command.id, user_id: owner, ...prepareProjectDraft(command.draft), status: "active", created_at: now, updated_at: now } as ProjectSummary["project"], progress: computeProgress([]) }, ...list];
  }
  return list.map((entry) => entry.project.id !== command.id ? entry : {
    ...entry, project: { ...entry.project, ...(command.type === "edit" ? prepareProjectDraft(command.draft) : { status: command.status }), updated_at: now },
  });
}

export function useWorkspaceProjects() {
  const { owner, loading, authenticated } = useOwner();
  const { t } = useLanguage();
  const client = useQueryClient();
  const key = workspaceProjectsKey(owner);
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const latch = useLatch(key);
  const query = useQuery({
    queryKey: key, enabled: authenticated && !pending, staleTime: 60_000, refetchOnWindowFocus: false,
    queryFn: () => { if (!owner || !authenticated) throw new Error("authentication_changed"); return fetchProjectSummaries(owner); },
  });
  const mutation = useMutation({
    mutationKey: key, retry: false,
    mutationFn: async (command: ListCommand) => {
      if (!owner) throw new Error("authentication_changed");
      // Board image files go first; if any cannot be removed the project is kept (no orphaned files).
      if (command.type === "delete") await deleteProjectNoteFiles(owner, command.id);
      return persistListCommand(owner, command);
    },
    onMutate: async (command) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<ProjectSummary[]>(key);
      if (!before || !owner) throw new Error("projects_not_loaded");
      client.setQueryData(key, applyListCommand(before, command, owner, new Date().toISOString()));
      return { before };
    },
    onSuccess: (saved, command) => {
      if (saved) client.setQueryData<ProjectSummary[]>(key, (list = []) => list.map((e) => e.project.id === saved.id ? { ...e, project: saved } : e));
      if (command.type === "delete") {
        client.removeQueries({ queryKey: workspaceProjectKey(owner, command.id) });
        client.removeQueries({ queryKey: workspaceNotesKey(owner, command.id) });
        void client.invalidateQueries({ queryKey: workspaceNoteImagesKey(owner) });
      }
      else void client.invalidateQueries({ queryKey: workspaceProjectKey(owner, command.id) });
      toast.success(t(`workspace.projects.toast.${command.type}`), { id: FEEDBACK, duration: 1800 });
    },
    onError: (_e, _c, context) => {
      if (context) client.setQueryData(key, context.before);
      toast.error(t("workspace.projects.saveError"), { id: FEEDBACK });
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const execute = (command: ListCommand) => (authenticated && query.data ? latch(() => mutation.mutateAsync(command)) : Promise.resolve(false));
  return { summaries: authenticated ? query.data : undefined, isLoading: loading || (authenticated && query.isPending), error: authenticated ? query.error : null, pending, execute, refetch: query.refetch };
}

export function useWorkspaceProject(projectId: string) {
  const { owner, loading, authenticated } = useOwner();
  const { t } = useLanguage();
  const client = useQueryClient();
  const key = workspaceProjectKey(owner, projectId);
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const latch = useLatch(key);
  const query = useQuery({
    queryKey: key, enabled: authenticated && !pending, staleTime: 60_000, refetchOnWindowFocus: false,
    retry: (count, error) => (error as Error)?.message !== "project_not_found" && count < 1,
    queryFn: () => { if (!owner || !authenticated) throw new Error("authentication_changed"); return fetchProjectDetail(owner, projectId); },
  });
  const mutation = useMutation({
    mutationKey: key, retry: false,
    mutationFn: (command: DetailCommand) => { if (!owner) throw new Error("authentication_changed"); return persistDetailCommand(owner, projectId, command); },
    onMutate: async (command) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<ProjectDetail>(key);
      if (!before) throw new Error("project_not_loaded");
      client.setQueryData(key, applyDetailCommand(before, command, new Date().toISOString()));
      return { before };
    },
    onSuccess: (_r, command) => {
      // List progress/status derive from this project; refresh it lazily.
      void client.invalidateQueries({ queryKey: workspaceProjectsKey(owner) });
      if (!["toggleItem", "reorderItems", "reorderPhases"].includes(command.type)) toast.success(t("workspace.project.saved"), { id: FEEDBACK, duration: 1500 });
    },
    onError: (_e, _c, context) => {
      if (context) client.setQueryData(key, context.before);
      toast.error(t("workspace.projects.saveError"), { id: FEEDBACK });
      void client.invalidateQueries({ queryKey: key });
    },
  });
  const execute = (command: DetailCommand) => (authenticated && query.data ? latch(() => mutation.mutateAsync(command)) : Promise.resolve(false));
  const notFound = (query.error as Error | null)?.message === "project_not_found";
  return { detail: authenticated ? query.data : undefined, isLoading: loading || (authenticated && query.isPending), error: authenticated && !notFound ? query.error : null, notFound, pending, execute, refetch: query.refetch };
}

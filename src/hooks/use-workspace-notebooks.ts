import { useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useLanguage } from "./use-language";
import { fetchNotebook, fetchNotebooks, persistNotebook, persistNotebookPage, workspaceNotebookKey, workspaceNotebooksKey } from "@/lib/workspace-notebooks-data";
import { sortNotebookPages, type NotebookCommand, type NotebookDetail, type NotebookPage, type NotebookSummary, type PageCommand } from "@/lib/workspace-notebooks";

function useOwner() {
  const { user, session, loading } = useAuth();
  const owner = user?.id;
  return { owner, loading, authenticated: !loading && Boolean(owner && session?.user.id === owner) };
}
export function useWorkspaceNotebooks() {
  const { owner, loading, authenticated } = useOwner(), { t } = useLanguage(), client = useQueryClient();
  const key = workspaceNotebooksKey(owner), lock = useRef(false);
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const query = useQuery({ queryKey: key, enabled: authenticated && !pending, staleTime: 60_000, refetchOnWindowFocus: false,
    queryFn: () => { if (!owner) throw new Error("authentication_changed"); return fetchNotebooks(owner); } });
  const mutation = useMutation({ mutationKey: key, retry: false,
    mutationFn: (command: NotebookCommand) => { if (!owner || !authenticated) throw new Error("authentication_changed"); return persistNotebook(owner, command); },
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (notebook, command) => {
      client.setQueryData<NotebookSummary[]>(key, (list = []) => command.type === "delete" ? list.filter((e) => e.notebook.id !== command.id) : notebook ? [{ notebook, pageCount: list.find((e) => e.notebook.id === notebook.id)?.pageCount ?? 0, latestUpdate: notebook.updated_at }, ...list.filter((e) => e.notebook.id !== notebook.id)] : list);
      if (command.type === "delete") client.removeQueries({ queryKey: workspaceNotebookKey(owner, command.id) });
      else void client.invalidateQueries({ queryKey: workspaceNotebookKey(owner, command.id) });
      void client.invalidateQueries({ queryKey: key });
      toast.success(t(`workspace.notebooks.toast.${command.type}`));
    },
    onError: () => toast.error(t("workspace.notebooks.saveError")),
  });
  const execute = async (command: NotebookCommand) => {
    if (!authenticated || !query.data || lock.current || pending) return false;
    lock.current = true;
    try { await mutation.mutateAsync(command); return true; } catch { return false; } finally { lock.current = false; }
  };
  return { summaries: authenticated ? query.data : undefined, isLoading: loading || (authenticated && query.isPending), error: query.error, pending, execute, refetch: query.refetch };
}

export function useWorkspaceNotebook(id: string) {
  const { owner, loading, authenticated } = useOwner(), { t } = useLanguage(), client = useQueryClient();
  const key = workspaceNotebookKey(owner, id), lock = useRef(false);
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const query = useQuery({ queryKey: key, enabled: authenticated && !pending, staleTime: 60_000, refetchOnWindowFocus: false, retry: false,
    queryFn: () => { if (!owner) throw new Error("authentication_changed"); return fetchNotebook(owner, id); } });
  const acceptPage = (page: NotebookPage) => {
    if (page.user_id !== owner || page.notebook_id !== id) return;
    client.setQueryData<NotebookDetail>(key, (detail) => detail ? { ...detail, pages: sortNotebookPages([...detail.pages.filter((p) => p.id !== page.id), page]) } : detail);
    // No eager read on each autosave: list refreshes only when mounted again.
    void client.invalidateQueries({ queryKey: workspaceNotebooksKey(owner), refetchType: "none" });
  };
  const mutation = useMutation({ mutationKey: key, retry: false,
    mutationFn: (command: PageCommand) => { if (!owner || !authenticated) throw new Error("authentication_changed"); return persistNotebookPage(owner, id, command); },
    onMutate: () => client.cancelQueries({ queryKey: key }),
    onSuccess: (page, command) => {
      if (page) acceptPage(page);
      else client.setQueryData<NotebookDetail>(key, (detail) => detail ? { ...detail, pages: detail.pages.filter((p) => p.id !== command.id) } : detail);
      void client.invalidateQueries({ queryKey: workspaceNotebooksKey(owner), refetchType: "none" });
    },
    onError: () => toast.error(t("workspace.notebooks.saveError")),
  });
  const execute = async (command: PageCommand): Promise<NotebookPage | true | false> => {
    if (!authenticated || !query.data || lock.current || pending) return false;
    lock.current = true;
    try { return await mutation.mutateAsync(command) ?? true; } catch { return false; } finally { lock.current = false; }
  };
  return { owner, detail: authenticated ? query.data : undefined, isLoading: loading || (authenticated && query.isPending), error: query.error, pending, execute, acceptPage, refetch: query.refetch };
}
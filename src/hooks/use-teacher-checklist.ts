import { useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useLanguage } from "./use-language";
import { applyChecklistCommand, checklistCommandIds, restoreChecklistItems, sortChecklist,
  type ChecklistCommand, type TeacherChecklistItem } from "@/lib/teacher-checklist";
import { fetchTeacherChecklist, persistChecklistCommand, teacherChecklistKey } from "@/lib/teacher-checklist-data";

export function useTeacherChecklist() {
  const { user, session, loading } = useAuth();
  const { t } = useLanguage();
  const client = useQueryClient();
  const owner = user?.id;
  const key = teacherChecklistKey(owner);
  const authenticated = !loading && Boolean(owner && session?.user.id === owner);
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const locks = useRef(new Set<string>());
  const reconcile = useRef(false);
  const query = useQuery({
    queryKey: key, enabled: authenticated && !pending, staleTime: 60_000, retry: false,
    refetchOnMount: "always", refetchOnWindowFocus: true,
    queryFn: ({ signal }) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return fetchTeacherChecklist(owner, signal);
    },
  });
  const mutation = useMutation({
    mutationKey: key, retry: false,
    mutationFn: (command: ChecklistCommand) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return persistChecklistCommand(owner, command);
    },
    onMutate: async (command) => {
      await client.cancelQueries({ queryKey: key, exact: true });
      const before = client.getQueryData<TeacherChecklistItem[]>(key);
      if (!before || !owner) throw new Error("checklist_not_loaded");
      client.setQueryData(key, applyChecklistCommand(before, command, owner, new Date().toISOString()));
      return { before };
    },
    onSuccess: (result, command, context) => {
      client.setQueryData<TeacherChecklistItem[]>(key, (current = []) => {
        if ("item" in result) return sortChecklist([...current.filter((item) => item.id !== result.item.id), result.item]);
        if (command.type === "clear" && context) {
          // Restore rows not deleted (e.g. another tab reopened an item); refetch after writes settle.
          const restored = restoreChecklistItems(current, context.before, command.ids);
          return restored.filter((item) => !result.deletedIds.includes(item.id));
        }
        return current.filter((item) => command.type !== "delete" || item.id !== command.id);
      });
      if (command.type === "clear") reconcile.current = true;
    },
    onError: (_error, command, context) => {
      if (context) client.setQueryData<TeacherChecklistItem[]>(key, (current = []) =>
        restoreChecklistItems(current, context.before, checklistCommandIds(command)));
      toast.error(t("checklist.saveError"));
      // Leave failed creates retryable with the same UUID instead of inserting another row.
      if (command.type !== "create") reconcile.current = true;
    },
    onSettled: () => {
      if (reconcile.current && client.isMutating({ mutationKey: key, exact: true }) === 1) {
        reconcile.current = false;
        void client.invalidateQueries({ queryKey: key, exact: true });
      }
    },
  });

  async function execute(command: ChecklistCommand): Promise<boolean> {
    const ids = checklistCommandIds(command);
    if (!authenticated || !query.data || query.isError || ids.some((id) => locks.current.has(id))) return false;
    ids.forEach((id) => locks.current.add(id));
    try { await mutation.mutateAsync(command); return true; }
    catch { return false; }
    finally { ids.forEach((id) => locks.current.delete(id)); }
  }
  return {
    owner, items: authenticated ? query.data : undefined,
    isLoading: loading || (authenticated && query.isPending), error: authenticated ? query.error : new Error("authentication_changed"),
    isFetching: query.isFetching, pending, isItemPending: (id: string) => locks.current.has(id), execute,
    refetch: () => { if (!pending && authenticated) return query.refetch(); },
  };
}
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useLanguage } from "./use-language";
import {
  CONNECTIONS_UNAVAILABLE, createNoteConnection, deleteNoteConnection, fetchNoteConnections, noteConnectionsKey, type NoteConnection,
} from "@/lib/workspace-note-connections";

/**
 * Connections of the personal board. `enabled` is false on project boards (unchanged). While the
 * manual migration is missing, `available` is false and the board hides every connection control.
 * Create/remove are optimistic and rolled back on failure.
 */
export function useNoteConnections(enabled: boolean) {
  const { user, session, loading } = useAuth();
  const { t } = useLanguage();
  const client = useQueryClient();
  const owner = user?.id;
  const key = noteConnectionsKey(owner);
  const authenticated = !loading && Boolean(owner && session?.user.id === owner);
  const query = useQuery({
    queryKey: key, enabled: enabled && authenticated, staleTime: 60_000, refetchOnWindowFocus: false, retry: false,
    queryFn: ({ signal }) => {
      if (!owner) throw new Error("authentication_changed");
      return fetchNoteConnections(owner, signal);
    },
  });
  const unavailable = (query.error as Error | null)?.message === CONNECTIONS_UNAVAILABLE;

  const optimistic = <T,>(apply: (current: NoteConnection[], input: T) => NoteConnection[]) => ({
    onMutate: async (input: T) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<NoteConnection[]>(key) ?? [];
      client.setQueryData(key, apply(before, input));
      return { before };
    },
    onError: (_error: unknown, _input: T, context: { before: NoteConnection[] } | undefined) => {
      if (context) client.setQueryData(key, context.before);
      toast.error(t("workspace.mural.connections.saveError"), { id: "workspace-notes-feedback" });
      void client.invalidateQueries({ queryKey: key });
    },
  });

  const create = useMutation({
    mutationKey: [...key, "create"], retry: false,
    mutationFn: (connection: NoteConnection) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return createNoteConnection(owner, connection);
    },
    ...optimistic<NoteConnection>((current, connection) => [...current, connection]),
    onSuccess: (saved) => client.setQueryData<NoteConnection[]>(key, (current = []) => current.map((entry) => entry.id === saved.id ? saved : entry)),
  });
  const remove = useMutation({
    mutationKey: [...key, "remove"], retry: false,
    mutationFn: (id: string) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return deleteNoteConnection(owner, id);
    },
    ...optimistic<string>((current, id) => current.filter((entry) => entry.id !== id)),
  });

  return {
    available: enabled && authenticated && query.isSuccess && !unavailable,
    connections: enabled && query.data ? query.data : [],
    connect: async (from: string, to: string) => {
      try { await create.mutateAsync({ id: crypto.randomUUID(), from_note_id: from, to_note_id: to }); return true; } catch { return false; }
    },
    /** Re-read after a note is deleted (the database removed its connections by cascade). */
    refresh: () => client.invalidateQueries({ queryKey: key }),
    disconnect: async (id: string) => {
      try { await remove.mutateAsync(id); return true; } catch { return false; }
    },
  };
}

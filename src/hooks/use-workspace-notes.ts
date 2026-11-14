import { useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useLanguage } from "./use-language";
import { applyNoteCommand, sortNotes, type NoteCommand, type WorkspaceNote } from "@/lib/workspace-notes";
import { fetchWorkspaceNotes, persistNoteCommand, workspaceNotesKey } from "@/lib/workspace-notes-data";
import { deleteAllNoteImages, workspaceNoteImagesKey } from "@/lib/workspace-note-images";

export function useWorkspaceNotes() {
  const { user, session, loading } = useAuth();
  const { t } = useLanguage();
  const client = useQueryClient();
  const owner = user?.id;
  const key = workspaceNotesKey(owner);
  const authenticated = !loading && Boolean(owner && session?.user.id === owner);
  const pending = useIsMutating({ mutationKey: key }) > 0;
  const lock = useRef(false);
  const quiet = useRef(false);
  const query = useQuery({
    queryKey: key, enabled: authenticated && !pending, staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return fetchWorkspaceNotes(owner, signal);
    },
  });
  const mutation = useMutation({
    mutationKey: key,
    retry: false,
    mutationFn: async (command: NoteCommand) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      // Files go first: if any cannot be removed, the note stays (no orphaned files in Storage).
      if (command.type === "delete") await deleteAllNoteImages(owner, command.id);
      return persistNoteCommand(owner, command, client.getQueryData<WorkspaceNote[]>(key) ?? []);
    },
    onMutate: async (command) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<WorkspaceNote[]>(key);
      if (!before || !owner) throw new Error("notes_not_loaded");
      client.setQueryData(key, applyNoteCommand(before, command, owner, new Date().toISOString()));
      return { before };
    },
    onSuccess: (saved, command) => {
      client.setQueryData<WorkspaceNote[]>(key, (notes = []) => sortNotes(
        saved ? notes.map((note) => note.id === saved.id ? saved : note) : notes.filter((note) => note.id !== command.id),
      ));
      if (command.type === "delete") void client.invalidateQueries({ queryKey: workspaceNoteImagesKey(owner) });
      if (!quiet.current && (command.type === "create" || command.type === "edit" || command.type === "delete")) {
        toast.success(t(command.type === "delete" ? "workspace.mural.deleted" : "workspace.mural.saved"), { id: "workspace-notes-feedback", duration: 1800 });
      }
    },
    onError: (_error, command, context) => {
      if (command.type === "delete") void client.invalidateQueries({ queryKey: workspaceNoteImagesKey(owner) });
      if (context) client.setQueryData(key, context.before);
      toast.error(t("workspace.mural.saveError"), { id: "workspace-notes-feedback" });
      // Only failures need a list reconciliation (e.g. a response lost after a commit).
      void client.invalidateQueries({ queryKey: key });
    },
  });
  /** `quiet` skips the success toast when the caller reports the final outcome itself (note + images). */
  async function execute(command: NoteCommand, options: { quiet?: boolean } = {}): Promise<boolean> {
    // Synchronous latch also catches two clicks before React's pending render.
    if (lock.current || client.isMutating({ mutationKey: key }) || !authenticated || !query.data) return false;
    lock.current = true;
    quiet.current = Boolean(options.quiet);
    try { await mutation.mutateAsync(command); return true; }
    catch { return false; }
    finally { lock.current = false; quiet.current = false; }
  }
  return { notes: authenticated ? query.data : undefined, isLoading: loading || (authenticated && query.isPending),
    error: authenticated ? query.error : null, pending, execute, refetch: query.refetch };
}
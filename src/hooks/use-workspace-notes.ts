import { useRef } from "react";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "./use-auth";
import { useLanguage } from "./use-language";
import { applyNoteCommand, sortNotes, type NoteCommand, type WorkspaceNote } from "@/lib/workspace-notes";
import { fetchWorkspaceNotes, persistNoteCommand, workspaceNotesKey } from "@/lib/workspace-notes-data";
import { deleteAllNoteImages, workspaceNoteImagesKey } from "@/lib/workspace-note-images";

/**
 * One board's notes: the personal board (projectId = null, unchanged behavior) or a project's board.
 * readOnly (archived projects) blocks every write here; RLS blocks them on the server too.
 */
export function useWorkspaceNotes(projectId: string | null = null, { readOnly = false }: { readOnly?: boolean } = {}) {
  const { user, session, loading } = useAuth();
  const { t } = useLanguage();
  const client = useQueryClient();
  const owner = user?.id;
  const key = workspaceNotesKey(owner, projectId);
  const authenticated = !loading && Boolean(owner && session?.user.id === owner);
  const pending = useIsMutating({ mutationKey: key, exact: true }) > 0;
  // Position saves run in the background on their own key: they never mark the board as busy.
  const positionKey = [...key, "position"] as const;
  const positionSaving = useIsMutating({ mutationKey: positionKey }) > 0;
  // Deletes also run in the background on their own key (optimistic, concurrent, never `pending`).
  const deleteKey = [...key, "delete"] as const;
  const deleteSaving = useIsMutating({ mutationKey: deleteKey }) > 0;
  // Notes whose delete is still in flight: never shown again by a read or a rollback meanwhile.
  const pendingDeletes = useRef(new Set<string>());
  const withoutPendingDeletes = (notes: WorkspaceNote[]) =>
    pendingDeletes.current.size ? notes.filter((note) => !pendingDeletes.current.has(note.id)) : notes;
  const latestPosition = useRef(new Map<string, number>());
  const lock = useRef(false);
  const quiet = useRef(false);
  const query = useQuery({
    queryKey: key, enabled: authenticated && !pending && !positionSaving && !deleteSaving, staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return fetchWorkspaceNotes(owner, signal, projectId).then(withoutPendingDeletes);
    },
  });
  const mutation = useMutation({
    mutationKey: key,
    retry: false,
    mutationFn: async (command: NoteCommand) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return persistNoteCommand(owner, command, client.getQueryData<WorkspaceNote[]>(key) ?? [], projectId);
    },
    onMutate: async (command) => {
      await client.cancelQueries({ queryKey: key });
      const before = client.getQueryData<WorkspaceNote[]>(key);
      if (!before || !owner) throw new Error("notes_not_loaded");
      client.setQueryData(key, applyNoteCommand(before, command, owner, new Date().toISOString(), projectId));
      return { before };
    },
    onSuccess: (saved, command) => {
      client.setQueryData<WorkspaceNote[]>(key, (notes = []) => sortNotes(
        saved ? notes.map((note) => note.id === saved.id ? saved : note) : notes.filter((note) => note.id !== command.id),
      ));
      if (!quiet.current && (command.type === "create" || command.type === "edit")) {
        toast.success(t("workspace.mural.saved"), { id: "workspace-notes-feedback", duration: 1800 });
      }
    },
    onError: (_error, _command, context) => {
      // Roll back this command only; notes deleted meanwhile stay removed.
      if (context) client.setQueryData(key, withoutPendingDeletes(context.before));
      toast.error(t("workspace.mural.saveError"), { id: "workspace-notes-feedback" });
      // Only failures need a list reconciliation (e.g. a response lost after a commit).
      void client.invalidateQueries({ queryKey: key });
    },
  });
  /**
   * Drop of a note: the new position is applied to the cache synchronously (instant, no reload)
   * and saved in the background. Only the latest move of a note may roll it back (to the
   * position it had before that move) or replace it with the saved row.
   */
  const positionMutation = useMutation({
    mutationKey: positionKey,
    retry: false,
    mutationFn: ({ command }: { command: Extract<NoteCommand, { type: "position" }>; seq: number; previous: Pick<WorkspaceNote, "pos_x" | "pos_y"> }) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return persistNoteCommand(owner, command, client.getQueryData<WorkspaceNote[]>(key) ?? [], projectId);
    },
    onSuccess: (saved, { command, seq }) => {
      if (!saved || latestPosition.current.get(command.id) !== seq) return;
      client.setQueryData<WorkspaceNote[]>(key, (notes = []) => notes.map((note) => note.id === saved.id ? saved : note));
    },
    onError: (_error, { command, seq, previous }) => {
      if (latestPosition.current.get(command.id) !== seq) return;
      client.setQueryData<WorkspaceNote[]>(key, (notes = []) => notes.map((note) => note.id === command.id ? { ...note, ...previous } : note));
      toast.error(t("workspace.mural.saveError"), { id: "workspace-notes-feedback" });
    },
  });
  /**
   * Optimistic delete: the note leaves the board at once and the delete runs in the background on its
   * own mutation key, so several notes can be deleted in a row without waiting. Files go first (as
   * before; if any cannot be removed the note stays). A failure restores only that note.
   */
  const deleteMutation = useMutation({
    mutationKey: deleteKey,
    retry: false,
    mutationFn: async ({ command, note }: { command: Extract<NoteCommand, { type: "delete" }>; note: WorkspaceNote }) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      // On a project board the files live in the note author's folder (the owner may delete them).
      await deleteAllNoteImages(owner, command.id, note.user_id ?? owner);
      return persistNoteCommand(owner, command, client.getQueryData<WorkspaceNote[]>(key) ?? [], projectId);
    },
    onSuccess: (_saved, { command }) => {
      pendingDeletes.current.delete(command.id);
      client.setQueryData<WorkspaceNote[]>(key, (notes = []) => notes.filter((note) => note.id !== command.id));
      void client.invalidateQueries({ queryKey: workspaceNoteImagesKey(owner) });
      toast.success(t("workspace.mural.deleted"), { id: "workspace-notes-feedback", duration: 1800 });
    },
    onError: (_error, { command, note }) => {
      pendingDeletes.current.delete(command.id);
      client.setQueryData<WorkspaceNote[]>(key, (notes = []) => notes.some((entry) => entry.id === note.id) ? notes : sortNotes([...notes, note]));
      void client.invalidateQueries({ queryKey: workspaceNoteImagesKey(owner) });
      toast.error(t("workspace.mural.deleteError"), { id: "workspace-notes-feedback" });
    },
  });
  async function deleteNote(command: Extract<NoteCommand, { type: "delete" }>): Promise<boolean> {
    const before = client.getQueryData<WorkspaceNote[]>(key);
    const note = before?.find((entry) => entry.id === command.id);
    if (readOnly || !authenticated || !owner || !before || !note || pendingDeletes.current.has(command.id)) return false;
    // Stop in-flight reads without reverting, so a stale response cannot bring the note back.
    void client.cancelQueries({ queryKey: key }, { revert: false, silent: true });
    pendingDeletes.current.add(command.id);
    client.setQueryData<WorkspaceNote[]>(key, (notes = []) => notes.filter((entry) => entry.id !== command.id));
    try { await deleteMutation.mutateAsync({ command, note }); return true; }
    catch { return false; }
  }

  async function savePosition(command: Extract<NoteCommand, { type: "position" }>): Promise<boolean> {
    const before = client.getQueryData<WorkspaceNote[]>(key);
    const note = before?.find((entry) => entry.id === command.id);
    if (readOnly || !authenticated || !owner || !before || !note) return false;
    // Stop in-flight reads without reverting, so a stale response cannot undo the move.
    void client.cancelQueries({ queryKey: key }, { revert: false, silent: true });
    const seq = (latestPosition.current.get(command.id) ?? 0) + 1;
    latestPosition.current.set(command.id, seq);
    client.setQueryData(key, applyNoteCommand(before, command, owner, new Date().toISOString(), projectId));
    try { await positionMutation.mutateAsync({ command, seq, previous: { pos_x: note.pos_x, pos_y: note.pos_y } }); return true; }
    catch { return false; }
  }

  /** `quiet` skips the success toast when the caller reports the final outcome itself (note + images). */
  async function execute(command: NoteCommand, options: { quiet?: boolean } = {}): Promise<boolean> {
    if (command.type === "position") return savePosition(command);
    if (command.type === "delete") return deleteNote(command);
    // Synchronous latch also catches two clicks before React's pending render.
    if (readOnly || lock.current || client.isMutating({ mutationKey: key, exact: true }) || !authenticated || !query.data) return false;
    lock.current = true;
    quiet.current = Boolean(options.quiet);
    try { await mutation.mutateAsync(command); return true; }
    catch { return false; }
    finally { lock.current = false; quiet.current = false; }
  }
  return { notes: authenticated ? query.data : undefined, isLoading: loading || (authenticated && query.isPending),
    error: authenticated ? query.error : null, pending, execute, refetch: query.refetch };
}
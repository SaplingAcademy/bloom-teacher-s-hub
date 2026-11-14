import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import {
  deleteNoteImage, describeImageError, fetchNoteImages, groupNoteImages, signNoteImageUrls, uploadNoteImage, workspaceNoteImagesKey,
  SIGNED_URL_SECONDS, type NoteImage, type PreparedImage,
} from "@/lib/workspace-note-images";

export interface NoteImageChanges { removed: readonly NoteImage[]; added: readonly PreparedImage[] }
export interface NoteImageResult { failedRemovals: string[]; failedUploads: string[] }

/** Owner-scoped image metadata plus short-lived signed URLs, refreshed before they expire. */
export function useWorkspaceNoteImages() {
  const { user, session, loading } = useAuth();
  const client = useQueryClient();
  const owner = user?.id;
  const authenticated = !loading && Boolean(owner && session?.user.id === owner);
  const key = workspaceNoteImagesKey(owner);
  const images = useQuery({
    queryKey: key, enabled: authenticated, staleTime: 60_000, refetchOnWindowFocus: false,
    queryFn: ({ signal }) => {
      if (!owner || !authenticated) throw new Error("authentication_changed");
      return fetchNoteImages(owner, signal);
    },
  });
  const paths = useMemo(() => (images.data ?? []).map((image) => image.file_path).sort(), [images.data]);
  const refreshMs = (SIGNED_URL_SECONDS - 10 * 60) * 1000;
  const urls = useQuery({
    queryKey: ["workspace-note-image-urls", owner, paths], enabled: authenticated && paths.length > 0,
    staleTime: refreshMs, refetchInterval: refreshMs, refetchOnWindowFocus: false,
    queryFn: () => signNoteImageUrls(paths),
  });
  const byNote = useMemo(() => groupNoteImages(images.data ?? []), [images.data]);

  /**
   * Applies the editor's changes after the note itself was saved: removals, then uploads in the
   * chosen order. Every step is independent and reported; nothing failed is shown as saved.
   */
  async function saveNoteImages(noteId: string, changes: NoteImageChanges, kept: readonly NoteImage[]): Promise<NoteImageResult> {
    if (!owner || !authenticated) throw new Error("authentication_changed");
    const result: NoteImageResult = { failedRemovals: [], failedUploads: [] };
    for (const image of changes.removed) {
      try { await deleteNoteImage(owner, image); } catch (error) {
        result.failedRemovals.push(image.id);
        console.error("[workspace-note-images] remove failed", describeImageError(error));
      }
    }
    let order = Math.max(-1, ...kept.map((image) => image.order_index)) + 1;
    for (const image of changes.added) {
      try { await uploadNoteImage(owner, noteId, image, order++); } catch (error) {
        result.failedUploads.push(image.id);
        console.error("[workspace-note-images] upload failed", describeImageError(error));
      }
    }
    if (changes.removed.length || changes.added.length) await client.invalidateQueries({ queryKey: key });
    return result;
  }

  return {
    byNote, urls: urls.data ?? {}, isLoading: authenticated && images.isPending, error: images.error,
    saveNoteImages,
  };
}

import { supabase } from "@/lib/supabase";

/**
 * Images inside personal board notes. Files live only in the private `workspace-media` bucket at
 * `user_id/notes/note_id/image_id.webp`; metadata lives in public.workspace_note_images under RLS.
 * Owner and paths always come from Auth plus generated UUIDs, never from form input.
 */
export const WORKSPACE_MEDIA_BUCKET = "workspace-media";
export const MAX_IMAGES_PER_NOTE = 3;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** Bucket limit for a stored (already converted) file. */
export const MAX_STORED_IMAGE_BYTES = 5 * 1024 * 1024;
/** Originals above this are rejected before decoding (memory safety); they are shrunk anyway. */
export const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1600;
export const SIGNED_URL_SECONDS = 60 * 60;

export interface NoteImage {
  id: string;
  user_id: string;
  note_id: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  width: number;
  height: number;
  order_index: number;
  created_at: string;
}

/** A converted image waiting to be uploaded (kept only in the editor until Save). */
export interface PreparedImage { id: string; blob: Blob; width: number; height: number }

export type ImageErrorCode = "image_type" | "image_too_large" | "image_process" | "image_limit";
export class NoteImageError extends Error {
  constructor(readonly code: ImageErrorCode) { super(code); }
}

const IMAGE_FIELDS = "id,user_id,note_id,file_path,mime_type,size_bytes,width,height,order_index,created_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const workspaceNoteImagesKey = (userId: string | undefined) => ["workspace-note-images", userId] as const;

/** The only path shape ever written or removed; rejects anything that is not owner/notes/note/image. */
export function noteImagePath(owner: string, noteId: string, imageId: string): string {
  if (![owner, noteId, imageId].every((part) => UUID.test(part))) throw new Error("invalid_image_path");
  return `${owner}/notes/${noteId}/${imageId}.webp`;
}

export function validateImageFile(file: Pick<File, "type" | "size">): void {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) throw new NoteImageError("image_type");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) throw new NoteImageError("image_too_large");
}

/** Scales to fit inside the maximum dimension, never enlarging. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_DIMENSION) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Images grouped by note, in display order. */
export function groupNoteImages(images: readonly NoteImage[]): Record<string, NoteImage[]> {
  const groups: Record<string, NoteImage[]> = {};
  for (const image of images) (groups[image.note_id] ??= []).push(image);
  for (const list of Object.values(groups)) list.sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  return groups;
}

/**
 * Decodes in the browser, shrinks to MAX_IMAGE_DIMENSION and re-encodes as WebP. Re-encoding
 * through a canvas drops EXIF/GPS and other metadata; orientation is applied while decoding.
 */
export async function prepareImage(file: File, id: string = crypto.randomUUID()): Promise<PreparedImage> {
  validateImageFile(file);
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new NoteImageError("image_process"); }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new NoteImageError("image_process");
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      // Browsers without WebP encoding fall back to PNG: refuse rather than store a mislabeled file.
      if (!blob || blob.type !== "image/webp") throw new NoteImageError("image_process");
      if (blob.size <= MAX_STORED_IMAGE_BYTES) return { id, blob, ...size };
    }
    throw new NoteImageError("image_too_large");
  } finally {
    bitmap.close();
  }
}

async function authenticatedOwner(expectedId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expectedId || data.user?.id !== expectedId) throw new Error("authentication_changed");
  return data.user.id;
}

const isDuplicateObject = (error: { message?: string; statusCode?: string | number } | null) =>
  Boolean(error && (String(error.statusCode) === "409" || /already exists|duplicate/i.test(error.message ?? "")));

export async function fetchNoteImages(expectedId: string, signal?: AbortSignal): Promise<NoteImage[]> {
  const owner = await authenticatedOwner(expectedId);
  const rows: NoteImage[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from("workspace_note_images").select(IMAGE_FIELDS).eq("user_id", owner)
      .order("note_id").order("order_index").order("created_at").order("id").range(offset, offset + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data as NoteImage[]));
    if (data.length < 500) return rows;
  }
}

/** One batched request; the bucket is private, so images are only shown through short-lived URLs. */
export async function signNoteImageUrls(paths: readonly string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(WORKSPACE_MEDIA_BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS);
  if (error) throw error;
  const urls: Record<string, string> = {};
  for (const entry of data ?? []) if (entry.path && entry.signedUrl && !entry.error) urls[entry.path] = entry.signedUrl;
  return urls;
}

/**
 * Upload then metadata, both idempotent for the same image UUID (retries after an uncertain
 * network reuse it). If the metadata cannot be written, the uploaded file is removed again so no
 * orphan stays in the bucket.
 */
export async function uploadNoteImage(expectedId: string, noteId: string, image: PreparedImage, orderIndex: number): Promise<NoteImage> {
  const owner = await authenticatedOwner(expectedId);
  const path = noteImagePath(owner, noteId, image.id);
  if (image.blob.type !== "image/webp" || image.blob.size > MAX_STORED_IMAGE_BYTES) throw new NoteImageError("image_too_large");
  const bucket = supabase.storage.from(WORKSPACE_MEDIA_BUCKET);
  const { error: uploadError } = await bucket.upload(path, image.blob, { upsert: false, contentType: "image/webp", cacheControl: "3600" });
  if (uploadError && !isDuplicateObject(uploadError)) throw uploadError;
  const row = { id: image.id, user_id: owner, note_id: noteId, file_path: path, mime_type: "image/webp", size_bytes: image.blob.size,
    width: image.width, height: image.height, order_index: orderIndex };
  const { data, error } = await supabase.from("workspace_note_images").insert(row).select(IMAGE_FIELDS).single();
  if (!error) return data as NoteImage;
  if (error.code === "23505") {
    const { data: saved, error: readError } = await supabase.from("workspace_note_images").select(IMAGE_FIELDS)
      .eq("user_id", owner).eq("id", image.id).maybeSingle();
    if (!readError && saved && (saved as NoteImage).note_id === noteId && (saved as NoteImage).file_path === path) return saved as NoteImage;
  }
  await bucket.remove([path]);
  throw error;
}

/**
 * File first, then metadata: a failure in between leaves a row whose retry finishes the removal,
 * never an invisible orphan file. Both steps succeed again when already done.
 */
export async function deleteNoteImage(expectedId: string, image: Pick<NoteImage, "id" | "note_id">): Promise<void> {
  const owner = await authenticatedOwner(expectedId);
  const path = noteImagePath(owner, image.note_id, image.id);
  const { error: removeError } = await supabase.storage.from(WORKSPACE_MEDIA_BUCKET).remove([path]);
  if (removeError) throw removeError;
  const { error } = await supabase.from("workspace_note_images").delete().eq("user_id", owner).eq("note_id", image.note_id).eq("id", image.id);
  if (error) throw error;
}

/**
 * Before a note is deleted: remove every file under its folder (rows plus anything left by an
 * interrupted upload), then its image rows. Any failure stops the note deletion.
 */
export async function deleteAllNoteImages(expectedId: string, noteId: string): Promise<void> {
  const owner = await authenticatedOwner(expectedId);
  await removeNoteFiles(owner, noteId);
  const { error } = await supabase.from("workspace_note_images").delete().eq("user_id", owner).eq("note_id", noteId);
  if (error) throw error;
}

/**
 * Before a project is deleted: remove the physical files of every note on its board. Rows are
 * left to the database cascade (also for archived projects, whose rows cannot be deleted
 * directly). Any failure stops the project deletion so no file is orphaned.
 */
export async function deleteProjectNoteFiles(expectedId: string, projectId: string): Promise<void> {
  const owner = await authenticatedOwner(expectedId);
  const { data, error } = await supabase.from("workspace_notes").select("id").eq("user_id", owner).eq("project_id", projectId);
  if (error) throw error;
  for (const note of (data ?? []) as { id: string }[]) await removeNoteFiles(owner, note.id);
}

/** Every file under owner/notes/note_id (rows plus leftovers of interrupted uploads). */
async function removeNoteFiles(owner: string, noteId: string): Promise<void> {
  const folder = `${owner}/notes/${noteId}`;
  noteImagePath(owner, noteId, noteId); // validates both ids
  const bucket = supabase.storage.from(WORKSPACE_MEDIA_BUCKET);
  const { data: rows, error: rowsError } = await supabase.from("workspace_note_images").select("id").eq("user_id", owner).eq("note_id", noteId);
  if (rowsError) throw rowsError;
  const { data: listed, error: listError } = await bucket.list(folder, { limit: 100 });
  if (listError) throw listError;
  const paths = new Set((rows as { id: string }[]).map((row) => noteImagePath(owner, noteId, row.id)));
  for (const file of listed ?? []) if (/^[0-9a-f-]{36}\.webp$/i.test(file.name)) paths.add(`${folder}/${file.name}`);
  if (paths.size > 0) {
    const { error: removeError } = await bucket.remove([...paths]);
    if (removeError) throw removeError;
  }
}

import { supabase } from "@/lib/supabase";
import type { BoardPoint } from "./workspace-notes-layout";

/**
 * Arrows between notes of ONE board — the personal board ("Meu Mural", projectId = null) or a
 * project's board — stored only by note IDs in public.workspace_note_connections
 * (docs/migrations/20261118120000_workspace_note_connections_manual.sql). Positions always come from
 * the notes themselves, so arrows follow the notes wherever they move (also when another participant
 * moves them). The database keeps each board's connections apart (same-board trigger) and applies the
 * board's permissions (RLS); deleting a note removes its connections (FK cascade).
 */
export interface NoteConnection {
  id: string;
  from_note_id: string;
  to_note_id: string;
}

/** Same scope as the notes cache: one list per board. */
export const noteConnectionsKey = (userId: string | undefined, projectId: string | null = null) =>
  ["workspace-note-connections", userId, projectId ?? "personal"] as const;

/** Same pair in either direction counts once (one arrow per pair, mirrored by a unique index). */
const samePair = (connection: NoteConnection, a: string, b: string) =>
  (connection.from_note_id === a && connection.to_note_id === b) || (connection.from_note_id === b && connection.to_note_id === a);

export type ConnectRefusal = "self" | "missing" | "exists";
export function connectRefusal(connections: readonly NoteConnection[], noteIds: ReadonlySet<string>, from: string, to: string): ConnectRefusal | null {
  if (from === to) return "self";
  if (!noteIds.has(from) || !noteIds.has(to)) return "missing";
  if (connections.some((connection) => samePair(connection, from, to))) return "exists";
  return null;
}

/** Connections whose notes are both still on the board (a deleted note's arrows disappear at once). */
export function visibleConnections(connections: readonly NoteConnection[], noteIds: ReadonlySet<string>): NoteConnection[] {
  return connections.filter((connection) => noteIds.has(connection.from_note_id) && noteIds.has(connection.to_note_id));
}

/** The other note of each connection touching `noteId` (for the per-note "remove connection" menu). */
export function connectionsOf(connections: readonly NoteConnection[], noteId: string): { connection: NoteConnection; otherId: string }[] {
  return connections
    .filter((connection) => connection.from_note_id === noteId || connection.to_note_id === noteId)
    .map((connection) => ({ connection, otherId: connection.from_note_id === noteId ? connection.to_note_id : connection.from_note_id }));
}

export interface NoteRect extends BoardPoint { width: number; height: number }

/** Gap between the arrow ends and the note edges, so the arrowhead stays visible. */
export const CONNECTOR_GAP = 6;

/** Where the segment from the rect's centre towards `toward` leaves the rect (plus a small gap). */
function edgePoint(rect: NoteRect, toward: BoardPoint): BoardPoint {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  const scaleX = dx === 0 ? Infinity : (rect.width / 2) / Math.abs(dx);
  const scaleY = dy === 0 ? Infinity : (rect.height / 2) / Math.abs(dy);
  const scale = Math.min(scaleX, scaleY);
  const length = Math.hypot(dx, dy) || 1;
  return { x: cx + dx * scale + (dx / length) * CONNECTOR_GAP, y: cy + dy * scale + (dy / length) * CONNECTOR_GAP };
}

/**
 * Straight connector between two notes, from edge to edge along the line joining their centres.
 * Null when the notes overlap (nothing sensible to draw between them).
 */
export function connectorLine(from: NoteRect, to: NoteRect): { x1: number; y1: number; x2: number; y2: number } | null {
  const overlap = from.x < to.x + to.width && to.x < from.x + from.width && from.y < to.y + to.height && to.y < from.y + from.height;
  if (overlap) return null;
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const start = edgePoint(from, toCenter);
  const end = edgePoint(to, fromCenter);
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

async function authenticatedOwner(expectedId: string): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!expectedId || data.user?.id !== expectedId) throw new Error("authentication_changed");
  return data.user.id;
}

/** The manual migration is not applied yet: the feature stays hidden, nothing else changes. */
export function isConnectionsTableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205"
    || (/workspace_note_connections/.test(error.message ?? "") && /does not exist|could not find/i.test(error.message ?? ""));
}

export const CONNECTIONS_UNAVAILABLE = "connections_unavailable";

/** Personal board: the teacher's own connections; project board: every connection of that project (RLS decides). */
export async function fetchNoteConnections(expectedId: string, signal?: AbortSignal, projectId: string | null = null): Promise<NoteConnection[]> {
  const owner = await authenticatedOwner(expectedId);
  const base = supabase.from("workspace_note_connections").select("id,from_note_id,to_note_id");
  let query = (projectId ? base.eq("project_id", projectId) : base.eq("user_id", owner).is("project_id", null)).order("created_at").order("id");
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw isConnectionsTableMissing(error) ? new Error(CONNECTIONS_UNAVAILABLE) : error;
  return (data ?? []) as NoteConnection[];
}

/**
 * The client UUID is kept, so the optimistic arrow and the saved row are the same connection. The
 * board (project_id) is set by the database from the notes; it is sent only as a hint.
 */
export async function createNoteConnection(expectedId: string, connection: NoteConnection, projectId: string | null = null): Promise<NoteConnection> {
  const owner = await authenticatedOwner(expectedId);
  const { data, error } = await supabase.from("workspace_note_connections")
    .insert({ id: connection.id, user_id: owner, project_id: projectId, from_note_id: connection.from_note_id, to_note_id: connection.to_note_id })
    .select("id,from_note_id,to_note_id").single();
  if (error) throw error;
  return data as NoteConnection;
}

/** Personal: filtered by owner; project: filtered by the project (any authorized participant, RLS decides). */
export async function deleteNoteConnection(expectedId: string, id: string, projectId: string | null = null): Promise<void> {
  const owner = await authenticatedOwner(expectedId);
  const base = supabase.from("workspace_note_connections").delete();
  const { error } = await (projectId ? base.eq("project_id", projectId) : base.eq("user_id", owner)).eq("id", id);
  if (error) throw error;
}

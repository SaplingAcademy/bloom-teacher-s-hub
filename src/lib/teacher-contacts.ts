import { supabase } from "@/lib/supabase";

/**
 * Meus Contatos: every read and write goes through the SECURITY DEFINER RPCs created in
 * docs/migrations/20261114120000_teacher_contacts_manual.sql. The database derives the caller from
 * auth.uid(); the client never sends its own id, never reads the tables and never sees e-mails or
 * declined requests.
 */
export type ContactRelation = "none" | "outgoing" | "incoming" | "contact" | "cooldown";

export interface TeacherSearchResult {
  teacher_id: string;
  full_name: string | null;
  avatar_url: string | null;
  relation: ContactRelation;
  request_id: string | null;
  cooldown_until: string | null;
}

export interface ContactEntry {
  request_id: string;
  other_id: string;
  full_name: string | null;
  avatar_url: string | null;
  relation: "contact" | "incoming" | "outgoing";
  created_at: string;
  responded_at: string | null;
}

export interface SendResult { request_id: string | null; relation: ContactRelation; cooldown_until: string | null }

export const MIN_NAME_QUERY = 3;
export const teacherContactsKey = (userId: string | undefined) => ["teacher-contacts", userId] as const;
export const teacherSearchKey = (userId: string | undefined, query: string) => ["teacher-contacts", userId, "search", query] as const;

/** Stable markers raised by the RPCs, recognized without relying on translated text. */
const ERROR_MARKERS = ["not_authenticated", "contact_self", "contact_target_not_found", "contact_pending_limit",
  "contact_request_not_found", "contact_not_found", "contact_invalid_response"] as const;
export type ContactErrorCode = (typeof ERROR_MARKERS)[number] | "unknown";

export function contactErrorCode(error: unknown): ContactErrorCode {
  const message = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error ?? "");
  return ERROR_MARKERS.find((marker) => message.includes(marker)) ?? "unknown";
}

/** A query is searchable when it is a complete-looking e-mail or a name with at least 3 characters. */
export function normalizeContactQuery(raw: string): string | null {
  const query = raw.trim();
  if (!query || query.length > 200) return null;
  if (query.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query) ? query.toLowerCase() : null;
  return query.length >= MIN_NAME_QUERY ? query : null;
}

/** Whole days left until a cooldown ends (rounded up, at least 1 while it is still active). */
export function cooldownDaysLeft(until: string | null, now: Date = new Date()): number {
  if (!until) return 0;
  const ms = new Date(until).getTime() - now.getTime();
  return ms > 0 ? Math.max(1, Math.ceil(ms / 86_400_000)) : 0;
}

export async function searchTeachers(query: string): Promise<TeacherSearchResult[]> {
  const { data, error } = await supabase.rpc("search_teachers", { p_query: query });
  if (error) throw error;
  return (data ?? []) as TeacherSearchResult[];
}

export async function listMyContacts(): Promise<ContactEntry[]> {
  const { data, error } = await supabase.rpc("list_my_contacts");
  if (error) throw error;
  return (data ?? []) as ContactEntry[];
}

export async function sendContactRequest(addresseeId: string): Promise<SendResult> {
  const { data, error } = await supabase.rpc("send_contact_request", { p_addressee: addresseeId });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as SendResult | undefined;
  if (!row) throw new Error("contact_empty_response");
  return row;
}

export async function respondContactRequest(requestId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("respond_contact_request", { p_request_id: requestId, p_accept: accept });
  if (error) throw error;
}

export async function cancelContactRequest(requestId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_contact_request", { p_request_id: requestId });
  if (error) throw error;
}

export async function removeContact(otherId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_contact", { p_other: otherId });
  if (error) throw error;
}

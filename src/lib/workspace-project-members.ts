import { supabase } from "@/lib/supabase";

/**
 * Project sharing (Workspace colaborativo, Etapa 3 UI over the Etapa 1/2 database). Every call
 * goes through the existing SECURITY DEFINER RPCs; the database decides eligibility, ownership,
 * the member limit and the cooldown after a declined invite. Nothing here is cached locally.
 */
export type MemberStatus = "pending" | "accepted" | "declined";

/** Row of list_project_members: pending rows hide identity; invited_email is only shown to the owner. */
export interface ProjectMember {
  member_id: string;
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  invited_email: string | null;
  role: string;
  status: MemberStatus;
  created_at: string;
  responded_at: string | null;
}

/** Row of list_my_project_invites (no e-mails). */
export interface ProjectInvite {
  member_id: string;
  project_id: string;
  project_title: string;
  invited_by: string;
  inviter_name: string | null;
  inviter_avatar: string | null;
  created_at: string;
}

export type InviteOutcome =
  | { status: "sent" }
  | { status: "already_member" }
  | { status: "cooldown"; until: string };

/** Database error codes raised by the RPCs, mapped to i18n keys under workspace.share.errors. */
const KNOWN_ERRORS = [
  "invite_invalid_email", "invite_self", "project_member_limit", "project_archived", "project_not_found",
  "invite_not_found", "email_not_confirmed", "member_not_found", "owner_cannot_leave", "not_authenticated",
] as const;
export type ShareErrorCode = (typeof KNOWN_ERRORS)[number] | "generic";

export function shareErrorCode(error: unknown): ShareErrorCode {
  const message = (error as { message?: string } | null)?.message ?? "";
  return KNOWN_ERRORS.find((code) => message.includes(code)) ?? "generic";
}

export class ShareError extends Error {
  constructor(readonly code: ShareErrorCode) { super(code); }
}

export const projectMembersKey = (userId: string | undefined, projectId: string) => ["workspace-project-members", userId, projectId] as const;
export const myProjectInvitesKey = (userId: string | undefined) => ["workspace-project-invites", userId] as const;

const EMAIL = /^[^\s@]+@[^\s@]+$/;
/** Same normalization the RPC applies (trim + lowercase); the database re-validates everything. */
export function normalizeInviteEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return EMAIL.test(email) && email.length <= 320 ? email : null;
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new ShareError(shareErrorCode(error));
  return data as T;
}

export async function inviteProjectMember(projectId: string, email: string): Promise<InviteOutcome> {
  const normalized = normalizeInviteEmail(email);
  if (!normalized) throw new ShareError("invite_invalid_email");
  const rows = await rpc<{ status: string; cooldown_until: string | null }[] | null>("invite_project_member", { p_project: projectId, p_email: normalized });
  const row = Array.isArray(rows) ? rows[0] : null;
  if (row?.status === "already_member") return { status: "already_member" };
  if (row?.status === "cooldown" && row.cooldown_until) return { status: "cooldown", until: row.cooldown_until };
  if (row?.status === "sent") return { status: "sent" };
  throw new ShareError("generic");
}

export const listProjectMembers = async (projectId: string) =>
  (await rpc<ProjectMember[] | null>("list_project_members", { p_project: projectId })) ?? [];

export const listMyProjectInvites = async () => (await rpc<ProjectInvite[] | null>("list_my_project_invites")) ?? [];

export async function respondProjectInvite(memberId: string, accept: boolean): Promise<"accepted" | "declined"> {
  return rpc<"accepted" | "declined">("respond_project_invite", { p_member_id: memberId, p_accept: accept });
}

export const removeProjectMember = (memberId: string) => rpc<void>("remove_project_member", { p_member_id: memberId });

export const leaveProject = (projectId: string) => rpc<void>("leave_project", { p_project: projectId });

/** Accepted first, then pending, then declined; stable by name/e-mail. */
export function sortMembers(members: readonly ProjectMember[]): ProjectMember[] {
  const rank: Record<MemberStatus, number> = { accepted: 0, pending: 1, declined: 2 };
  return [...members].sort((a, b) => rank[a.status] - rank[b.status]
    || (a.full_name ?? a.invited_email ?? "").localeCompare(b.full_name ?? b.invited_email ?? "") || a.member_id.localeCompare(b.member_id));
}

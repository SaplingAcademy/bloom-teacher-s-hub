import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import {
  inviteProjectMember, leaveProject, listMyProjectInvites, listProjectMembers, normalizeInviteEmail, removeProjectMember,
  respondProjectInvite, shareErrorCode, sortMembers, ShareError, type ProjectMember,
} from "../src/lib/workspace-project-members";

beforeEach(() => { mocks.rpc.mockReset(); });

describe("project sharing RPCs (Etapa 1/2 signatures)", () => {
  it("invites with the normalized e-mail and maps the three neutral outcomes", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [{ status: "sent", cooldown_until: null }], error: null });
    expect(await inviteProjectMember("p1", "  Bia@X.com ")).toEqual({ status: "sent" });
    expect(mocks.rpc).toHaveBeenCalledWith("invite_project_member", { p_project: "p1", p_email: "bia@x.com" });
    mocks.rpc.mockResolvedValueOnce({ data: [{ status: "already_member", cooldown_until: null }], error: null });
    expect(await inviteProjectMember("p1", "bia@x.com")).toEqual({ status: "already_member" });
    mocks.rpc.mockResolvedValueOnce({ data: [{ status: "cooldown", cooldown_until: "2026-11-20T10:00:00Z" }], error: null });
    expect(await inviteProjectMember("p1", "bia@x.com")).toEqual({ status: "cooldown", until: "2026-11-20T10:00:00Z" });
  });
  it("rejects an invalid e-mail before calling the database", async () => {
    await expect(inviteProjectMember("p1", "sem-arroba")).rejects.toEqual(new ShareError("invite_invalid_email"));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(normalizeInviteEmail("a b@x.com")).toBeNull();
  });
  it("maps database errors (limit, self, archived, unconfirmed) and unknown ones to generic", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "project_member_limit" } });
    await expect(inviteProjectMember("p1", "a@x.com")).rejects.toMatchObject({ code: "project_member_limit" });
    expect(shareErrorCode({ message: "invite_self" })).toBe("invite_self");
    expect(shareErrorCode({ message: "project_archived" })).toBe("project_archived");
    expect(shareErrorCode({ message: "email_not_confirmed" })).toBe("email_not_confirmed");
    expect(shareErrorCode({ message: "network down" })).toBe("generic");
  });
  it("calls respond/remove/leave/list with the real parameter names", async () => {
    mocks.rpc.mockResolvedValue({ data: "accepted", error: null });
    expect(await respondProjectInvite("m1", true)).toBe("accepted");
    expect(mocks.rpc).toHaveBeenLastCalledWith("respond_project_invite", { p_member_id: "m1", p_accept: true });
    await removeProjectMember("m2");
    expect(mocks.rpc).toHaveBeenLastCalledWith("remove_project_member", { p_member_id: "m2" });
    await leaveProject("p1");
    expect(mocks.rpc).toHaveBeenLastCalledWith("leave_project", { p_project: "p1" });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await listProjectMembers("p1")).toEqual([]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("list_project_members", { p_project: "p1" });
    expect(await listMyProjectInvites()).toEqual([]);
    expect(mocks.rpc).toHaveBeenLastCalledWith("list_my_project_invites", undefined);
  });
  it("orders accepted, then pending, then declined", () => {
    const m = (member_id: string, status: ProjectMember["status"], full_name: string | null) => ({ member_id, status, full_name } as ProjectMember);
    expect(sortMembers([m("1", "declined", "Z"), m("2", "pending", null), m("3", "accepted", "B"), m("4", "accepted", "A")]).map((x) => x.member_id)).toEqual(["4", "3", "2", "1"]);
  });
});

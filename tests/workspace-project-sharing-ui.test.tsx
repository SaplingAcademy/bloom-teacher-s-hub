// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), navigate: vi.fn(), success: vi.fn(), error: vi.fn(), summaries: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "owner" }, session: { user: { id: "owner" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, dismiss: vi.fn() } }));
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  Link: ({ children }: { children: unknown }) => createElement("a", null, children as never),
}));
vi.mock("@/lib/workspace-projects-data", async (original) => ({ ...(await original<object>()), fetchProjectSummaries: mocks.summaries }));
import { ProjectShareDialog } from "../src/components/bloom/workspace/ProjectShareDialog";
import { ProjectInvites } from "../src/components/bloom/workspace/ProjectInvites";
import { ProjectsList } from "../src/components/bloom/workspace/ProjectsList";

let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const mount = async (element: ReactElement) => {
  await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }, element)));
  await flush();
};
const byTestId = (id: string) => document.querySelector(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(async () => { (el as HTMLElement).click(); });
const buttonByText = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) ?? null;
const typeEmail = (value: string) => act(async () => {
  const input = document.getElementById("share-email") as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const members = [
  { member_id: "m1", user_id: "bia", full_name: "Bia Lima", avatar_url: null, invited_email: null, role: "editor", status: "accepted", created_at: "t", responded_at: "t" },
  { member_id: "m2", user_id: null, full_name: null, avatar_url: null, invited_email: "caio@x.com", role: "editor", status: "pending", created_at: "t", responded_at: null },
  { member_id: "m3", user_id: "dani", full_name: "Dani", avatar_url: null, invited_email: null, role: "editor", status: "declined", created_at: "t", responded_at: "t" },
];
const rpcResponses = (map: Record<string, unknown>) => mocks.rpc.mockImplementation(async (name: string) =>
  name in map ? (map[name] instanceof Error ? { data: null, error: { message: (map[name] as Error).message } } : { data: map[name], error: null }) : { data: null, error: null });
const project = (status = "active", user_id = "owner") => ({ id: "p1", title: "Curso B1", status, user_id });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.values(mocks).forEach((m) => m.mockReset());
  document.body.innerHTML = "";
  root = createRoot(document.body.appendChild(document.createElement("div")));
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("share dialog: owner", () => {
  const open = () => mount(createElement(ProjectShareDialog, { open: true, onClose: vi.fn(), onLeft: vi.fn(), project: project(), owner: { name: "Ana Dona", photo: null }, isOwner: true }));

  it("shows the owner badge, participants, pending e-mail with cancel, and declined without actions", async () => {
    rpcResponses({ list_project_members: members });
    await open();
    const list = byTestId("share-members")!;
    expect(list.textContent).toContain("Ana Dona (você)" .replace("(você)", "workspace.share.you"));
    expect(list.textContent).toContain("workspace.share.owner");
    const rows = [...document.querySelectorAll('[data-testid="share-member"]')];
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["accepted", "pending", "declined"]);
    expect(rows[1].textContent).toContain("caio@x.com");
    expect(rows[1].querySelector('button[aria-label^="workspace.share.cancelInvite"]')).not.toBeNull();
    expect(rows[0].querySelector('button[aria-label^="workspace.share.remove"]')).not.toBeNull();
    expect(rows[2].querySelector("button")).toBeNull();
  });
  it("invites by e-mail with the neutral message and refreshes the list", async () => {
    rpcResponses({ list_project_members: [], invite_project_member: [{ status: "sent", cooldown_until: null }] });
    await open();
    expect(byTestId("share-empty")!.textContent).toContain("workspace.share.emptyOwner");
    await typeEmail("Bia@X.com");
    await act(async () => { (document.querySelector("form") as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("invite_project_member", { p_project: "p1", p_email: "bia@x.com" });
    expect(byTestId("share-feedback")!.textContent).toBe("workspace.share.sent");
    expect(mocks.rpc.mock.calls.filter(([name]) => name === "list_project_members").length).toBeGreaterThan(1);
  });
  it("explains the cooldown and the member limit", async () => {
    rpcResponses({ list_project_members: [], invite_project_member: [{ status: "cooldown", cooldown_until: "2026-11-20T10:00:00Z" }] });
    await open();
    await typeEmail("bia@x.com");
    await act(async () => { (document.querySelector("form") as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(byTestId("share-feedback")!.textContent).toContain("workspace.share.cooldown");
    rpcResponses({ list_project_members: [], invite_project_member: new Error("project_member_limit") });
    await act(async () => { (document.querySelector("form") as HTMLFormElement).requestSubmit(); });
    await flush();
    expect(byTestId("share-feedback")!.getAttribute("role")).toBe("alert");
    expect(byTestId("share-feedback")!.textContent).toBe("workspace.share.errors.project_member_limit");
  });
  it("removes a participant after confirmation", async () => {
    rpcResponses({ list_project_members: members });
    await open();
    await click(document.querySelector('[data-status="accepted"] button'));
    await click(document.querySelector('[role="alertdialog"] button.bg-destructive'));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("remove_project_member", { p_member_id: "m1" });
    expect(mocks.success).toHaveBeenCalledWith("workspace.share.removed");
  });
  it("archived projects: no invite form", async () => {
    rpcResponses({ list_project_members: [] });
    await mount(createElement(ProjectShareDialog, { open: true, onClose: vi.fn(), onLeft: vi.fn(), project: project("archived"), owner: { name: "Ana", photo: null }, isOwner: true }));
    expect(byTestId("share-archived")).not.toBeNull();
    expect(document.getElementById("share-email")).toBeNull();
  });
});

describe("share dialog: participant", () => {
  it("has no invite or remove controls and can leave the project", async () => {
    const onLeft = vi.fn();
    rpcResponses({ list_project_members: [members[0]] });
    await mount(createElement(ProjectShareDialog, { open: true, onClose: vi.fn(), onLeft, project: project("active", "ana"), owner: { name: "Ana Dona", photo: null }, isOwner: false }));
    expect(document.getElementById("share-email")).toBeNull();
    expect(document.querySelector('[data-testid="share-member"] button')).toBeNull();
    await click(byTestId("share-leave"));
    await click(document.querySelector('[role="alertdialog"] button.bg-destructive'));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("leave_project", { p_project: "p1" });
    expect(onLeft).toHaveBeenCalled();
  });
});

describe("received invites", () => {
  const invite = { member_id: "m9", project_id: "p9", project_title: "Projeto da Ana", invited_by: "ana", inviter_name: "Ana Dona", inviter_avatar: null, created_at: "t" };
  it("renders nothing without invites", async () => {
    rpcResponses({ list_my_project_invites: [] });
    await mount(createElement(ProjectInvites));
    expect(byTestId("project-invites")).toBeNull();
  });
  it("accepts and opens the project", async () => {
    rpcResponses({ list_my_project_invites: [invite], respond_project_invite: "accepted" });
    await mount(createElement(ProjectInvites));
    expect(byTestId("project-invite")!.textContent).toContain("Projeto da Ana");
    await click(buttonByText("workspace.invites.accept"));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("respond_project_invite", { p_member_id: "m9", p_accept: true });
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/workspace/projects/$projectId", params: { projectId: "p9" } });
  });
  it("declines without navigating and reports database errors", async () => {
    rpcResponses({ list_my_project_invites: [invite], respond_project_invite: "declined" });
    await mount(createElement(ProjectInvites));
    await click(buttonByText("workspace.invites.decline"));
    await flush();
    expect(mocks.rpc).toHaveBeenCalledWith("respond_project_invite", { p_member_id: "m9", p_accept: false });
    expect(mocks.navigate).not.toHaveBeenCalled();
    rpcResponses({ list_my_project_invites: [invite], respond_project_invite: new Error("email_not_confirmed") });
    await mount(createElement(ProjectInvites));
    await click(buttonByText("workspace.invites.accept"));
    await flush();
    expect(mocks.error).toHaveBeenCalledWith("workspace.share.errors.email_not_confirmed");
  });
});

describe("projects list", () => {
  const summary = (id: string, user_id: string) => ({ project: { id, user_id, title: id, description: "", color: "green", icon: "folder", status: "active", created_at: "t", updated_at: "t" }, progress: { done: 0, total: 0, percent: 0 } });
  it("splits my projects and projects shared with me, once each, and hides owner actions on shared ones", async () => {
    rpcResponses({ list_my_project_invites: [] });
    mocks.summaries.mockResolvedValue([summary("Meu", "owner"), summary("Dela", "ana")]);
    await mount(createElement(ProjectsList, { filter: "active", onFilter: vi.fn() }));
    expect(byTestId("projects-owned")!.textContent).toContain("Meu");
    expect(byTestId("projects-shared")!.textContent).toContain("Dela");
    expect(document.querySelectorAll("li.group").length).toBe(2);
    expect(byTestId("projects-shared")!.querySelector('[data-testid="project-shared-badge"]')).not.toBeNull();
  });
  it("keeps a single grid when nothing is shared", async () => {
    rpcResponses({ list_my_project_invites: [] });
    mocks.summaries.mockResolvedValue([summary("Meu", "owner")]);
    await mount(createElement(ProjectsList, { filter: "active", onFilter: vi.fn() }));
    expect(byTestId("projects-shared")).toBeNull();
    expect(document.querySelectorAll("li.group").length).toBe(1);
  });
});

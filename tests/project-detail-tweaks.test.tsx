// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const project = { id: "p1", user_id: "owner", title: "Curso B1", description: "", color: "green", icon: "folder", status: "active", start_date: "2026-11-03", end_date: null, created_at: "t", updated_at: "t" };
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "owner" }, session: { user: { id: "owner" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("@/components/layout/TeacherAvatar", () => ({ useTeacherIdentity: () => ({ name: "Ana Dona", avatarUrl: null }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: unknown }) => createElement("a", null, children as never) }));
vi.mock("@/hooks/use-workspace-projects", () => ({
  useWorkspaceProject: () => ({ detail: { project, phases: [], items: [] }, isLoading: false, error: null, notFound: false, pending: false, execute: vi.fn(), refetch: vi.fn() }),
  useWorkspaceProjects: () => ({ execute: vi.fn() }),
}));
vi.mock("@/hooks/use-project-members", () => ({ useProjectMembers: () => ({ members: [], leave: { mutateAsync: vi.fn() } }) }));
vi.mock("../src/components/bloom/workspace/NotesBoard", () => ({ NotesBoard: () => null }));
vi.mock("../src/components/bloom/workspace/ProjectShareDialog", () => ({ ProjectShareDialog: () => null }));
import { ProjectDetailView } from "../src/components/bloom/workspace/ProjectDetailView";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const newItemButton = () => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes("workspace.project.newItem"))!;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = "";
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ProjectDetailView, { projectId: "p1" }))));
  await flush();
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("project detail header tweaks", () => {
  it("no + share button beside the creator; the header Compartilhar button stays", () => {
    expect(document.querySelector('[data-testid="project-share-plus"]')).toBeNull();
    expect(document.querySelector('[data-testid="project-summary"]')!.textContent).toContain("Ana Dona");
    expect(document.querySelector('[data-testid="project-share-button"]')!.textContent).toContain("workspace.share.button");
  });
  it("Novo item shows its tooltip on keyboard focus and still opens the item editor", async () => {
    const button = newItemButton();
    await act(async () => { button.focus(); });
    await flush();
    expect(document.body.textContent).toContain("workspace.project.newItemHint");
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    await act(async () => { button.click(); });
    await flush();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

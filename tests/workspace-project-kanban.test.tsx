// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ execute: vi.fn(), status: "active", owner: "owner", pending: false }));
const phases = [
  { id: "f1", project_id: "p1", user_id: "owner", title: "Planejar", order_index: 0, created_at: "t", updated_at: "t" },
  { id: "f2", project_id: "p1", user_id: "owner", title: "Executar", order_index: 1, created_at: "t", updated_at: "t" },
];
const item = (id: string, phase_id: string | null, title: string) => ({ id, project_id: "p1", phase_id, user_id: "owner", type: "task", title, content: "", completed: false, order_index: 0, meta: {}, created_at: "t", updated_at: "t" });
const items = [item("i0", null, "Geral A"), item("i1", "f1", "Tarefa 1"), item("i2", "f2", "Tarefa 2")];
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "me" }, session: { user: { id: "me" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("@/components/layout/TeacherAvatar", () => ({ useTeacherIdentity: () => ({ name: "Ana", avatarUrl: null }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: unknown }) => createElement("a", null, children as never) }));
vi.mock("@/hooks/use-workspace-projects", () => ({
  useWorkspaceProject: () => ({
    detail: { project: { id: "p1", user_id: state.owner, title: "P", description: "", color: "green", icon: "folder", status: state.status, start_date: "2026-11-03", end_date: null, created_at: "t", updated_at: "t" }, phases, items },
    isLoading: false, error: null, notFound: false, pending: state.pending, execute: state.execute, refetch: vi.fn(),
  }),
  useWorkspaceProjects: () => ({ execute: vi.fn() }),
}));
vi.mock("@/hooks/use-project-members", () => ({ useProjectMembers: () => ({ members: [], leave: { mutateAsync: vi.fn() } }) }));
vi.mock("@/lib/workspace-projects-data", async (original) => ({ ...(await original<object>()), fetchProjectOwnerProfile: async () => null }));
vi.mock("../src/components/bloom/workspace/NotesBoard", () => ({ NotesBoard: () => null }));
vi.mock("../src/components/bloom/workspace/ProjectShareDialog", () => ({ ProjectShareDialog: () => null }));
import { ProjectDetailView } from "../src/components/bloom/workspace/ProjectDetailView";
import { kanbanDropItem } from "../src/lib/workspace-projects";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (sel: string) => document.querySelector(sel);
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
const column = (phase: string) => q(`[data-testid="kanban-column"][data-phase="${phase}"]`)!;
const card = (id: string) => q(`[data-testid="kanban-card"][data-item="${id}"]`) as HTMLElement;
function drag(type: string, target: Element, data: Record<string, string>) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: { setData: (k: string, v: string) => { data[k] = v; }, getData: (k: string) => data[k] ?? "", dropEffect: "", effectAllowed: "" } });
  target.dispatchEvent(event);
}
const dragTo = (id: string, phase: string) => act(async () => {
  const data: Record<string, string> = {};
  drag("dragstart", card(id), data);
  drag("dragover", column(phase), data);
  drag("drop", column(phase), data);
});
const mount = async () => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ProjectDetailView, { projectId: "p1" }))));
  await flush();
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = "";
  Object.assign(state, { status: "active", owner: "owner", pending: false });
  state.execute.mockReset().mockResolvedValue(true);
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = undefined as never; });

describe("kanbanDropItem", () => {
  it("moves only to another column", () => {
    expect(kanbanDropItem(items as never, "i1", "f2")?.id).toBe("i1");
    expect(kanbanDropItem(items as never, "i1", null)?.id).toBe("i1");
    expect(kanbanDropItem(items as never, "i1", "f1")).toBeNull();
    expect(kanbanDropItem(items as never, "missing", "f2")).toBeNull();
    expect(kanbanDropItem(items as never, null, "f2")).toBeNull();
  });
});

describe("project Kanban view", () => {
  it("starts in List (unchanged) and switches to columns per phase with items as cards", async () => {
    await mount();
    expect(q('[data-testid="project-kanban"]')).toBeNull();
    expect(q('section[aria-label="Planejar"]')).not.toBeNull();
    await act(async () => button("workspace.project.view.kanban").click());
    const columns = [...document.querySelectorAll('[data-testid="kanban-column"]')].map((c) => c.getAttribute("data-phase"));
    expect(columns).toEqual(["general", "f1", "f2"]);
    expect(column("f1").textContent).toContain("Tarefa 1");
    expect(column("general").textContent).toContain("Geral A");
    expect(card("i1").getAttribute("draggable")).toBe("true");
    await act(async () => button("workspace.project.view.list").click());
    expect(q('[data-testid="project-kanban"]')).toBeNull();
  });
  it("drag & drop moves an item to another phase through the existing editItem command", async () => {
    await mount();
    await act(async () => button("workspace.project.view.kanban").click());
    await dragTo("i1", "f2");
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({ type: "editItem", id: "i1", item: expect.objectContaining({ phase_id: "f2" }) }));
    state.execute.mockClear();
    await dragTo("i2", "general");
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({ type: "editItem", id: "i2", item: expect.objectContaining({ phase_id: null }) }));
    state.execute.mockClear();
    await dragTo("i1", "f1"); // same column: nothing to save
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("participants on an archived project cannot drag or drop", async () => {
    Object.assign(state, { status: "archived", owner: "owner" });
    await mount();
    await act(async () => button("workspace.project.view.kanban").click());
    expect(card("i1").getAttribute("draggable")).toBe("false");
    await dragTo("i1", "f2");
    expect(state.execute).not.toHaveBeenCalled();
  });
  it("keeps toggling completion and adding items per column", async () => {
    await mount();
    await act(async () => button("workspace.project.view.kanban").click());
    await act(async () => (card("i1").querySelector('[role="checkbox"]') as HTMLElement).click());
    expect(state.execute).toHaveBeenCalledWith({ type: "toggleItem", id: "i1", completed: true });
    await act(async () => [...column("f2").querySelectorAll("button")].find((b) => b.textContent?.includes("workspace.project.addHere"))!.click());
    await flush();
    expect(q('[role="dialog"]')).not.toBeNull();
  });
});

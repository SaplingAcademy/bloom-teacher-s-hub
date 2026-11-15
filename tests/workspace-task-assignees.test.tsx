// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ execute: vi.fn(), status: "active", byItem: {} as Record<string, string[]>, available: true }));
const db = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), calls: [] as { table: string; op: string; args: unknown[] }[] }));
vi.mock("@/lib/supabase", () => ({ supabase: {
  auth: { getUser: db.getUser }, rpc: db.rpc,
  from: (table: string) => {
    const self: Record<string, unknown> = {};
    for (const op of ["select", "eq", "in", "order", "range", "insert", "update", "delete"]) self[op] = (...args: unknown[]) => { db.calls.push({ table, op, args }); return self; };
    self.maybeSingle = async () => ({ data: { id: "x" }, error: null });
    self.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return self;
  },
} }));
const item = (id: string, type: string, title: string) => ({ id, project_id: "p1", phase_id: null, user_id: "me", type, title, content: "", completed: false, order_index: 0, meta: {}, created_at: "t", updated_at: "t" });
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "me" }, session: { user: { id: "me" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
vi.mock("@/components/layout/TeacherAvatar", () => ({ useTeacherIdentity: () => ({ name: "Ana Dona", avatarUrl: null }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: unknown }) => createElement("a", null, children as never) }));
vi.mock("@/hooks/use-workspace-projects", () => ({
  useWorkspaceProject: () => ({
    detail: { project: { id: "p1", user_id: "me", title: "P", description: "", color: "green", icon: "folder", status: state.status, start_date: "2026-11-03", end_date: null, created_at: "t", updated_at: "t" },
      phases: [], items: [item("i1", "task", "Tarefa 1"), item("i2", "note", "Nota antiga")] },
    isLoading: false, error: null, notFound: false, pending: false, execute: state.execute, refetch: vi.fn(),
  }),
  useWorkspaceProjects: () => ({ execute: vi.fn() }),
  useItemAssignees: () => ({ byItem: state.byItem, available: state.available }),
}));
const accepted = (id: string, name: string) => ({ member_id: `m-${id}`, user_id: id, full_name: name, avatar_url: null, invited_email: null, role: "editor", status: "accepted", created_at: "t", responded_at: "t" });
vi.mock("@/hooks/use-project-members", () => ({ useProjectMembers: () => ({
  members: [accepted("bia", "Bia Lima"), accepted("caio", "Caio Souza"), accepted("dani", "Dani"), { ...accepted("eva", "Eva"), status: "pending", user_id: null }],
  leave: { mutateAsync: vi.fn() } }) }));
vi.mock("../src/components/bloom/workspace/NotesBoard", () => ({ NotesBoard: () => null }));
vi.mock("../src/components/bloom/workspace/ProjectShareDialog", () => ({ ProjectShareDialog: () => null }));
import { ProjectDetailView } from "../src/components/bloom/workspace/ProjectDetailView";
import { persistDetailCommand } from "../src/lib/workspace-projects-data";
import { itemTypeOptions } from "../src/lib/workspace-projects";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root | undefined;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const q = (sel: string) => document.querySelector(sel);
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;
const mount = async () => {
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root!.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(ProjectDetailView, { projectId: "p1" }))));
  await flush();
};
const typeTitle = (value: string) => act(async () => {
  const input = document.getElementById("item-title") as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const checkbox = (id: string) => document.getElementById(`assignee-${id}`) as HTMLButtonElement;
const submit = () => act(async () => { (q('[role="dialog"] form') as HTMLFormElement).requestSubmit(); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = "";
  Object.assign(state, { status: "active", byItem: {}, available: true });
  state.execute.mockReset().mockResolvedValue(true);
  db.calls = []; db.rpc.mockReset().mockResolvedValue({ data: [], error: null });
  db.getUser.mockResolvedValue({ data: { user: { id: "me" } }, error: null });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; });

describe("item types", () => {
  it("new items offer only Task and Link; legacy items keep their own type when edited", () => {
    expect(itemTypeOptions(true, "task")).toEqual(["task", "link"]);
    expect(itemTypeOptions(false, "note")).toEqual(["task", "link", "note"]);
    expect(itemTypeOptions(false, "checklist")).toEqual(["task", "link", "checklist"]);
    expect(itemTypeOptions(false, "link")).toEqual(["task", "link"]);
  });
});

describe("assignee persistence", () => {
  const task = { type: "task" as const, title: "T", content: "", meta: {}, phase_id: null };
  it("creates a task and its assignees atomically through create_project_task", async () => {
    await persistDetailCommand("me", "p1", { type: "createItem", id: "n1", item: task, order_index: 2, assignees: ["me", "bia"] });
    expect(db.rpc).toHaveBeenCalledWith("create_project_task", { p_id: "n1", p_project: "p1", p_phase: null, p_title: "T", p_content: "", p_order_index: 2, p_assignees: ["me", "bia"] });
    expect(db.calls.some((c) => c.op === "insert")).toBe(false);
  });
  it("keeps the previous insert when the feature is unavailable and for links", async () => {
    await persistDetailCommand("me", "p1", { type: "createItem", id: "n2", item: task, order_index: 0 });
    await persistDetailCommand("me", "p1", { type: "createItem", id: "n3", item: { ...task, type: "link", meta: { url: "https://x.io" } }, order_index: 0, assignees: ["me"] });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.calls.filter((c) => c.op === "insert")).toHaveLength(2);
  });
  it("editing a task updates it and then replaces the assignee set", async () => {
    await persistDetailCommand("me", "p1", { type: "editItem", id: "i1", item: task, order_index: 0, assignees: [] });
    expect(db.calls.some((c) => c.op === "update")).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith("set_project_item_assignees", { p_item: "i1", p_assignees: [] });
  });
  it("propagates a rejected assignee write (no silent partial success)", async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "assignee_not_eligible" } });
    await expect(persistDetailCommand("me", "p1", { type: "createItem", id: "n4", item: task, order_index: 0, assignees: ["x"] })).rejects.toMatchObject({ message: "assignee_not_eligible" });
  });
});

describe("assignees in the project UI", () => {
  it("shows assignee avatars on task cards with a compact +N", async () => {
    state.byItem = { i1: ["me", "bia", "caio", "dani"] };
    await mount();
    const avatars = q('[data-testid="assignee-avatars"]')!;
    expect(avatars.getAttribute("aria-label")).toContain("Ana Dona, Bia Lima, Caio Souza, Dani");
    expect(q('[data-testid="assignee-more"]')!.textContent).toBe("+1");
  });
  it("new task: creator preselected; can add others or remove all before saving", async () => {
    await mount();
    await act(async () => button("workspace.project.newItem").click());
    await flush();
    expect(q('[data-testid="assignee-picker"]')).not.toBeNull();
    expect(checkbox("me").getAttribute("data-state")).toBe("checked");
    expect(checkbox("eva")).toBeNull(); // pending invite is not eligible
    await act(async () => checkbox("bia").click());
    await typeTitle("Preparar aula");
    await submit(); await flush();
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({ type: "createItem", assignees: ["me", "bia"] }));
  });
  it("new task with everyone removed is saved without assignees", async () => {
    await mount();
    await act(async () => button("workspace.project.newItem").click());
    await flush();
    await act(async () => checkbox("me").click());
    expect(q('[data-testid="assignee-none"]')).not.toBeNull();
    await typeTitle("Sem responsáveis");
    await submit(); await flush();
    expect(state.execute).toHaveBeenCalledWith(expect.objectContaining({ type: "createItem", assignees: [] }));
  });
  it("archived project: assignees are read-only and never sent", async () => {
    state.status = "archived"; state.byItem = { i1: ["bia"] };
    await mount();
    await act(async () => (document.querySelectorAll('[aria-label="workspace.project.itemActions"]')[0] as HTMLButtonElement).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    await flush();
    const edit = [...document.querySelectorAll('[role="menuitem"]')].find((m) => m.textContent?.includes("workspace.mural.edit")) as HTMLElement;
    await act(async () => edit.click());
    await flush();
    expect(checkbox("bia").getAttribute("data-state")).toBe("checked");
    expect(checkbox("bia").disabled).toBe(true);
    await submit(); await flush();
    expect(state.execute).toHaveBeenCalledWith(expect.not.objectContaining({ assignees: expect.anything() }));
  });
  it("feature unavailable (migration not applied): no field, tasks saved as before", async () => {
    state.available = false;
    await mount();
    await act(async () => button("workspace.project.newItem").click());
    await flush();
    expect(q('[data-testid="assignee-picker"]')).toBeNull();
    await typeTitle("Antes da migração");
    await submit(); await flush();
    expect(state.execute).toHaveBeenCalledWith(expect.not.objectContaining({ assignees: expect.anything() }));
  });
});

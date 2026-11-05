import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyDetailCommand, computeProgress, filterAndSortProjects, phaseProgress, prepareItemDraft, prepareProjectDraft, reorder, safeUrl, type ProjectDetail, type WorkspaceItem, type WorkspacePhase, type WorkspaceProject } from "../src/lib/workspace-projects";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), eq: vi.fn(), result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { fetchProjectDetail, persistDetailCommand, persistListCommand } from "../src/lib/workspace-projects-data";
import { applyListCommand } from "../src/hooks/use-workspace-projects";

const P = "11111111-1111-4111-8111-111111111111";
const project: WorkspaceProject = { id: P, user_id: "teacher", title: "Semestre", description: "", color: "forest", icon: "folder", status: "active", created_at: "t0", updated_at: "t0" };
const phase = (id: string, order: number): WorkspacePhase => ({ id, project_id: P, user_id: "teacher", title: id, order_index: order, created_at: "t0", updated_at: "t0" });
const item = (id: string, over: Partial<WorkspaceItem> = {}): WorkspaceItem => ({ id, project_id: P, phase_id: null, user_id: "teacher", type: "task", title: id, content: "", completed: false, order_index: 0, meta: {}, created_at: "t0", updated_at: "t0", ...over });
const detail = (): ProjectDetail => ({ project, phases: [phase("f1", 0), phase("f2", 1)], items: [item("a", { phase_id: "f1", completed: true }), item("b", { phase_id: "f1" }), item("g"), item("n", { type: "note", phase_id: "f1" }), item("l", { type: "link", meta: { url: "https://x.com/" } })] });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "teacher" } }, error: null });
  mocks.result = { data: { id: "x" }, error: null };
  const chain = {
    select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockReturnThis(),
    insert: mocks.insert.mockReturnThis(), update: mocks.update.mockReturnThis(), delete: mocks.delete.mockReturnThis(),
    single: vi.fn().mockImplementation(async () => mocks.result), maybeSingle: vi.fn().mockImplementation(async () => mocks.result),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(mocks.result).then(resolve, reject),
  };
  mocks.from.mockReturnValue(chain);
});

describe("progress", () => {
  it("counts only tasks and checklists; notes and links never count", () => {
    expect(computeProgress(detail().items)).toEqual({ done: 1, total: 3, percent: 33 });
  });
  it("shows 0% (not 100%) for projects and phases without tasks", () => {
    expect(computeProgress([item("n", { type: "note" })]).percent).toBe(0);
    expect(phaseProgress(detail().items, "f2").percent).toBe(0);
  });
  it("general tasks count for the project but not for a phase", () => {
    expect(phaseProgress(detail().items, "f1")).toEqual({ done: 1, total: 2, percent: 50 });
  });
  it("updates immediately after complete, create, move and delete", () => {
    let d = applyDetailCommand(detail(), { type: "toggleItem", id: "b", completed: true }, "t1");
    expect(phaseProgress(d.items, "f1").percent).toBe(100);
    d = applyDetailCommand(d, { type: "createItem", id: "c", order_index: 9, item: { type: "checklist", title: "c", content: "", meta: {}, phase_id: "f1" } }, "t1");
    expect(phaseProgress(d.items, "f1").percent).toBe(67);
    d = applyDetailCommand(d, { type: "editItem", id: "c", order_index: 0, item: { type: "checklist", title: "c", content: "", meta: {}, phase_id: "f2" } }, "t1");
    expect(phaseProgress(d.items, "f1").percent).toBe(100);
    expect(phaseProgress(d.items, "f2").percent).toBe(0);
    d = applyDetailCommand(d, { type: "deleteItem", id: "c" }, "t1");
    expect(computeProgress(d.items)).toEqual({ done: 2, total: 3, percent: 67 });
  });
});

describe("phases", () => {
  it("deleting a phase keeps its items in the general area", () => {
    const d = applyDetailCommand(detail(), { type: "deletePhase", id: "f1" }, "t1");
    expect(d.phases.map((p) => p.id)).toEqual(["f2"]);
    expect(d.items.filter((i) => ["a", "b", "n"].includes(i.id)).every((i) => i.phase_id === null && i.project_id === P)).toBe(true);
    expect(d.items).toHaveLength(5);
  });
  it("reorders by renumbering only changed rows", () => {
    expect(reorder([phase("f1", 0), phase("f2", 1)], "f2", -1)).toEqual([{ id: "f2", order_index: 0 }, { id: "f1", order_index: 1 }]);
    expect(reorder([phase("f1", 0), phase("f2", 1)], "f1", -1)).toEqual([]);
  });
  it("rejects items linked to a phase from another project", () => {
    expect(() => prepareItemDraft({ type: "task", title: "x", content: "", url: "", phase_id: "foreign" }, [phase("f1", 0)])).toThrow("phase_not_in_project");
  });
  it("persists create/rename/delete scoped to owner and project", async () => {
    await persistDetailCommand("teacher", P, { type: "createPhase", id: "f3", title: " Fase ", order_index: 2 });
    expect(mocks.insert).toHaveBeenCalledWith({ id: "f3", project_id: P, user_id: "teacher", title: "Fase", order_index: 2 });
    await persistDetailCommand("teacher", P, { type: "renamePhase", id: "f3", title: "Nova" });
    expect(mocks.update).toHaveBeenCalledWith({ title: "Nova" });
    await persistDetailCommand("teacher", P, { type: "deletePhase", id: "f3" });
    expect(mocks.delete).toHaveBeenCalled();
    expect(mocks.eq).toHaveBeenCalledWith("project_id", P);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "teacher");
  });
});

describe("items and links", () => {
  it("accepts only http(s) links and stores the URL in meta", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
    expect(safeUrl("ftp://x.com")).toBeNull();
    expect(safeUrl("bloom.com/a")).toBe("https://bloom.com/a");
    expect(prepareItemDraft({ type: "link", title: "Ref", content: "x", url: "http://a.com", phase_id: null }, []).meta).toEqual({ url: "http://a.com/" });
    expect(() => prepareItemDraft({ type: "link", title: "Ref", content: "", url: "data:text/html,x", phase_id: null }, [])).toThrow("invalid_url");
  });
  it("creates, edits and deletes items without sending ownership changes on update", async () => {
    const prepared = prepareItemDraft({ type: "task", title: " T ", content: "", url: "", phase_id: null }, []);
    await persistDetailCommand("teacher", P, { type: "createItem", id: "i", item: prepared, order_index: 3 });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ id: "i", user_id: "teacher", project_id: P, title: "T", completed: false }));
    await persistDetailCommand("teacher", P, { type: "editItem", id: "i", item: { ...prepared, phase_id: "f1" }, order_index: 0 });
    const patch = mocks.update.mock.calls.at(-1)![0];
    expect(patch).not.toHaveProperty("user_id");
    expect(patch).not.toHaveProperty("project_id");
    expect(patch.phase_id).toBe("f1");
    await persistDetailCommand("teacher", P, { type: "deleteItem", id: "i" });
    expect(mocks.delete).toHaveBeenCalled();
  });
  it("persists completion and reopening as the completed column only", async () => {
    await persistDetailCommand("teacher", P, { type: "toggleItem", id: "b", completed: true });
    expect(mocks.update).toHaveBeenCalledWith({ completed: true });
    await persistDetailCommand("teacher", P, { type: "toggleItem", id: "b", completed: false });
    expect(mocks.update).toHaveBeenLastCalledWith({ completed: false });
  });
});

describe("projects", () => {
  it("requires a title and creates with the Auth owner", async () => {
    expect(() => prepareProjectDraft({ title: "  ", description: "", color: "forest", icon: "folder" })).toThrow("title_required");
    mocks.result = { data: project, error: null };
    await persistListCommand("teacher", { type: "create", id: P, draft: { title: "Semestre", description: "", color: "forest", icon: "folder" } });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ id: P, user_id: "teacher", status: "active" }));
  });
  it("archives, reactivates, edits and deletes optimistically", () => {
    const list = [{ project, progress: computeProgress([]) }];
    expect(applyListCommand(list, { type: "setStatus", id: P, status: "archived" }, "teacher", "t1")[0].project.status).toBe("archived");
    expect(applyListCommand(list, { type: "edit", id: P, draft: { title: "Novo", description: "d", color: "sky", icon: "target" } }, "teacher", "t1")[0].project.title).toBe("Novo");
    expect(applyListCommand(list, { type: "delete", id: P }, "teacher", "t1")).toEqual([]);
    expect(list[0].project.status).toBe("active"); // original snapshot untouched for rollback
  });
  it("filters by status and sorts by most recent update", () => {
    const a = { ...project, id: "a", updated_at: "2026-01-01" }, b = { ...project, id: "b", updated_at: "2026-02-01", status: "archived" as const };
    expect(filterAndSortProjects([a, b], "all").map((p) => p.id)).toEqual(["b", "a"]);
    expect(filterAndSortProjects([a, b], "active").map((p) => p.id)).toEqual(["a"]);
  });
});

describe("errors, rollback and isolation", () => {
  it("optimistic commands never mutate the snapshot used for rollback", () => {
    const before = detail();
    const frozen = JSON.stringify(before);
    applyDetailCommand(before, { type: "deletePhase", id: "f1" }, "t1");
    applyDetailCommand(before, { type: "toggleItem", id: "b", completed: true }, "t1");
    expect(JSON.stringify(before)).toBe(frozen);
  });
  it("surfaces persistence failures and zero-row writes instead of reporting success", async () => {
    mocks.result = { data: null, error: { message: "network" } };
    await expect(persistDetailCommand("teacher", P, { type: "toggleItem", id: "b", completed: true })).rejects.toEqual({ message: "network" });
    mocks.result = { data: null, error: null };
    await expect(persistDetailCommand("teacher", P, { type: "deleteItem", id: "b" })).rejects.toThrow("item_not_found");
  });
  it("blocks a switched account before any read or write", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(fetchProjectDetail("teacher", P)).rejects.toThrow("authentication_changed");
    await expect(persistDetailCommand("teacher", P, { type: "deleteItem", id: "b" })).rejects.toThrow("authentication_changed");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("treats invalid, missing or foreign projects as not found without leaking details", async () => {
    await expect(fetchProjectDetail("teacher", "not-a-uuid")).rejects.toThrow("project_not_found");
    mocks.result = { data: null, error: null };
    await expect(fetchProjectDetail("teacher", P)).rejects.toThrow("project_not_found");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "teacher");
  });
});

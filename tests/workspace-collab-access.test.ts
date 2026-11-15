import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceNote } from "../src/lib/workspace-notes";

/** Etapa 2: shared projects are read/written by project (RLS decides); archive and delete stay owner-only. */
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), rpc: vi.fn(), calls: [] as { table: string; op: string; args: unknown[] }[], result: { data: null as unknown, error: null as unknown } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc } }));
import { fetchProjectDetail, fetchProjectOwnerProfile, fetchProjectSummaries, persistDetailCommand, persistListCommand } from "../src/lib/workspace-projects-data";
import { fetchWorkspaceNotes, persistNoteCommand } from "../src/lib/workspace-notes-data";
import { projectCreator } from "../src/components/bloom/workspace/ProjectSummary";

const ME = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const note = (user_id: string): WorkspaceNote => ({ id: "n", user_id, title: "", content: "hi", color: "yellow", pinned: false, order_index: 0, pos_x: null, pos_y: null, project_id: PROJECT, created_at: "now", updated_at: "now" } as WorkspaceNote);
const filters = (table: string, op = "eq") => mocks.calls.filter((c) => c.table === table && c.op === op).map((c) => c.args);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.calls = [];
  mocks.getUser.mockResolvedValue({ data: { user: { id: ME } }, error: null });
  mocks.result = { data: { id: PROJECT, user_id: OWNER }, error: null };
  mocks.from.mockImplementation((table: string) => {
    const self: Record<string, unknown> = {};
    for (const op of ["select", "eq", "is", "in", "order", "range", "abortSignal", "insert", "update", "delete"]) {
      self[op] = (...args: unknown[]) => { mocks.calls.push({ table, op, args }); return self; };
    }
    self.single = async () => mocks.result;
    self.maybeSingle = async () => mocks.result;
    self.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return self;
  });
});

describe("shared projects: reads and writes by project", () => {
  it("lists and opens projects without a user_id filter (owned + shared come from RLS)", async () => {
    await fetchProjectSummaries(ME);
    await fetchProjectDetail(ME, PROJECT);
    for (const table of ["workspace_projects", "workspace_project_phases", "workspace_project_items"]) {
      expect(filters(table).some(([column]) => column === "user_id")).toBe(false);
    }
    expect(filters("workspace_project_phases")).toContainEqual(["project_id", PROJECT]);
  });
  it("participants edit details, phases and items filtered by project and id only", async () => {
    await persistDetailCommand(ME, PROJECT, { type: "editProject", draft: { title: "T", description: "", color: "lilac", icon: "folder" } } as never);
    await persistDetailCommand(ME, PROJECT, { type: "setDates", start_date: "2026-11-01", end_date: null });
    await persistDetailCommand(ME, PROJECT, { type: "toggleItem", id: "i", completed: true });
    await persistDetailCommand(ME, PROJECT, { type: "renamePhase", id: "p", title: "Fase" });
    expect(mocks.calls.filter((c) => c.op === "eq" && c.args[0] === "user_id")).toEqual([]);
    expect(filters("workspace_project_items")).toContainEqual(["project_id", PROJECT]);
  });
  it("archiving and deleting stay scoped to the signed-in owner", async () => {
    await persistDetailCommand(ME, PROJECT, { type: "setStatus", status: "archived" });
    expect(filters("workspace_projects")).toContainEqual(["user_id", ME]);
    mocks.calls = [];
    mocks.result = { data: { id: PROJECT }, error: null };
    await persistListCommand(ME, { type: "delete", id: PROJECT });
    expect(filters("workspace_projects")).toContainEqual(["user_id", ME]);
    mocks.calls = [];
    await persistListCommand(ME, { type: "setStatus", id: PROJECT, status: "active" });
    expect(filters("workspace_projects")).toContainEqual(["user_id", ME]);
  });
  it("list edits (details) are not owner-filtered", async () => {
    await persistListCommand(ME, { type: "edit", id: PROJECT, draft: { title: "T", description: "", color: "lilac", icon: "folder" } } as never);
    expect(filters("workspace_projects").some(([column]) => column === "user_id")).toBe(false);
  });
  it("shows the shared project owner's public profile; own projects keep the signed-in identity", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: OWNER, full_name: " Ana Dona ", avatar_url: "a.png" }, { id: ME, full_name: "Eu" }], error: null });
    const profile = await fetchProjectOwnerProfile(OWNER);
    expect(mocks.rpc).toHaveBeenCalledWith("get_public_teacher_profiles");
    expect(projectCreator(OWNER, ME, { name: "Eu", avatarUrl: null }, profile)).toEqual({ name: "Ana Dona", photo: "a.png" });
    expect(projectCreator(ME, ME, { name: "Eu", avatarUrl: null }, profile)).toEqual({ name: "Eu", photo: null });
    expect(projectCreator(OWNER, ME, { name: "Eu", avatarUrl: null })).toEqual({ name: "", photo: null });
  });
});

describe("shared project board", () => {
  it("reads every note of the project board; the personal board stays author-only", async () => {
    await fetchWorkspaceNotes(ME, undefined, PROJECT);
    expect(filters("workspace_notes")).toEqual([["project_id", PROJECT]]);
    mocks.calls = [];
    await fetchWorkspaceNotes(ME);
    expect(filters("workspace_notes")).toEqual([["user_id", ME]]);
    expect(filters("workspace_notes", "is")).toEqual([["project_id", null]]);
  });
  it("edits, moves and locks another author's note on a project board, scoped by project", async () => {
    mocks.result = { data: note(OWNER), error: null };
    await persistNoteCommand(ME, { type: "position", id: "n", x: 24, y: 48 }, [note(OWNER)], PROJECT);
    await persistNoteCommand(ME, { type: "pin", id: "n", pinned: true }, [note(OWNER)], PROJECT);
    expect(filters("workspace_notes")).toEqual([["project_id", PROJECT], ["id", "n"], ["project_id", PROJECT], ["id", "n"]]);
    expect(mocks.calls.filter((c) => c.op === "update").map((c) => c.args[0])).toEqual([{ pos_x: 24, pos_y: 48 }, { pinned: true }]);
  });
  it("never edits another author's personal note and never creates notes for someone else", async () => {
    await expect(persistNoteCommand(ME, { type: "pin", id: "n", pinned: true }, [note(OWNER)])).rejects.toThrow("note_not_found");
    await expect(persistNoteCommand(ME, { type: "create", id: "n", draft: { title: "", content: "x", color: "yellow" } }, [note(OWNER)], PROJECT)).rejects.toThrow("note_not_found");
  });
  it("deletes on a project board by project and id (RLS: author or project owner)", async () => {
    mocks.result = { data: { id: "n" }, error: null };
    await persistNoteCommand(ME, { type: "delete", id: "n" }, [], PROJECT);
    expect(filters("workspace_notes")).toEqual([["project_id", PROJECT], ["id", "n"]]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherChecklistItem } from "../src/lib/teacher-checklist";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(),
  eq: vi.fn(), in: vi.fn(), range: vi.fn(), single: vi.fn(), responses: [] as { data: unknown; error: unknown }[] }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser }, from: mocks.from } }));
import { fetchTeacherChecklist, persistChecklistCommand, teacherChecklistKey } from "../src/lib/teacher-checklist-data";
const saved: TeacherChecklistItem = { id: "item", teacher_id: "teacher", title: "Prepare", completed: false,
  created_at: "2026-11-06T01:00:00Z", updated_at: "2026-11-06T02:00:00Z" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "teacher" } }, error: null });
  mocks.responses = [{ data: saved, error: null }];
  const result = () => Promise.resolve(mocks.responses.length > 1 ? mocks.responses.shift() : mocks.responses[0]);
  const chain = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), abortSignal: vi.fn().mockReturnThis(),
    eq: mocks.eq.mockReturnThis(), in: mocks.in.mockReturnThis(), range: mocks.range.mockReturnThis(),
    insert: mocks.insert.mockReturnThis(), update: mocks.update.mockReturnThis(), delete: mocks.delete.mockReturnThis(),
    single: mocks.single.mockImplementation(result), maybeSingle: vi.fn().mockImplementation(result),
    then: (resolve: (value: unknown) => unknown) => result().then(resolve),
  };
  mocks.from.mockReturnValue(chain);
});

describe("Checklist session persistence", () => {
  it("uses only teacher_checklist_items and an isolated teacher cache", async () => {
    mocks.responses = [{ data: [saved], error: null }];
    expect(await fetchTeacherChecklist("teacher")).toEqual([saved]);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual(["teacher_checklist_items"]);
    expect(mocks.eq).toHaveBeenCalledWith("teacher_id", "teacher");
    expect(teacherChecklistKey("teacher")).toEqual(["teacher-checklist", "teacher"]);
    expect(teacherChecklistKey("teacher")).not.toEqual(teacherChecklistKey("other"));
  });
  it("freshly validates identity and blocks all operations after an account switch", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "other" } }, error: null });
    await expect(fetchTeacherChecklist("teacher")).rejects.toThrow("authentication_changed");
    await expect(persistChecklistCommand("teacher", { type: "delete", id: "item" })).rejects.toThrow("authentication_changed");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("creates with verified teacher ID and only granted input columns, returning saved timestamps", async () => {
    expect(await persistChecklistCommand("teacher", { type: "create", id: "item", title: " Prepare " })).toEqual({ item: saved });
    expect(mocks.insert).toHaveBeenCalledWith({ id: "item", teacher_id: "teacher", title: "Prepare", completed: false });
  });
  it("edits only title with owner and ID filters and saved readback", async () => {
    await persistChecklistCommand("teacher", { type: "edit", id: "item", title: "Updated" });
    expect(mocks.update).toHaveBeenCalledWith({ title: "Updated" });
    expect(mocks.eq).toHaveBeenCalledWith("teacher_id", "teacher");
    expect(mocks.eq).toHaveBeenCalledWith("id", "item");
  });
  it.each([true, false])("changes only completed=%s without overwriting the title", async (completed) => {
    mocks.responses = [{ data: { ...saved, completed }, error: null }];
    expect(await persistChecklistCommand("teacher", { type: "complete", id: "item", completed })).toEqual({ item: { ...saved, completed } });
    expect(mocks.update).toHaveBeenCalledWith({ completed });
  });
  it("deletes only the selected owner-scoped task", async () => {
    mocks.responses = [{ data: { id: "item" }, error: null }];
    expect(await persistChecklistCommand("teacher", { type: "delete", id: "item" })).toEqual({ deletedIds: ["item"] });
    expect(mocks.eq.mock.calls).toEqual([["teacher_id", "teacher"], ["id", "item"]]);
  });
  it("clears only confirmed IDs still completed, never pending or newly completed rows", async () => {
    mocks.responses = [{ data: [{ id: "item" }], error: null }];
    expect(await persistChecklistCommand("teacher", { type: "clear", ids: ["item", "reopened", "item"] })).toEqual({ deletedIds: ["item"] });
    expect(mocks.eq.mock.calls).toEqual([["teacher_id", "teacher"], ["completed", true]]);
    expect(mocks.in).toHaveBeenCalledWith("id", ["item", "reopened"]);
  });
  it("recovers an uncertain create with the same UUID without inserting twice", async () => {
    mocks.responses = [{ data: null, error: { code: "23505" } }, { data: saved, error: null }];
    expect(await persistChecklistCommand("teacher", { type: "create", id: "item", title: "Prepare" })).toEqual({ item: saved });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith("id", "item");
  });
  it("fails visibly on RLS/network read and write failures", async () => {
    const error = { message: "permission denied" };
    mocks.responses = [{ data: null, error }];
    await expect(fetchTeacherChecklist("teacher")).rejects.toEqual(error);
    await expect(persistChecklistCommand("teacher", { type: "complete", id: "item", completed: true })).rejects.toEqual(error);
  });
  it("rejects foreign-owner or malformed rows instead of using local defaults", async () => {
    mocks.responses = [{ data: [{ ...saved, teacher_id: "other" }], error: null }];
    await expect(fetchTeacherChecklist("teacher")).rejects.toThrow("checklist_invalid_row");
  });
  it("reads beyond the Data API row limit", async () => {
    const page = Array.from({ length: 500 }, (_, index) => ({ ...saved, id: String(index) }));
    mocks.responses = [{ data: page, error: null }, { data: [{ ...saved, id: "last" }], error: null }];
    expect(await fetchTeacherChecklist("teacher")).toHaveLength(501);
    expect(mocks.range.mock.calls).toEqual([[0, 499], [500, 999]]);
  });
});
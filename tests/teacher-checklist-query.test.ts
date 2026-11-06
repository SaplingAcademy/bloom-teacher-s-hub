// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TeacherChecklistItem } from "../src/lib/teacher-checklist";

const mocks = vi.hoisted(() => ({ owner: "teacher", read: vi.fn(), write: vi.fn(), toast: vi.fn(), priorities: vi.fn(), automation: vi.fn() }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: mocks.owner }, session: { user: { id: mocks.owner } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.toast } }));
vi.mock("@/lib/teacher-checklist-data", () => ({ teacherChecklistKey: (id: string) => ["teacher-checklist", id], fetchTeacherChecklist: mocks.read, persistChecklistCommand: mocks.write }));
vi.mock("@/lib/daily-priorities", () => ({ fetchDailyPriorities: mocks.priorities }));
vi.mock("@/lib/inactive-lead-automation", () => ({ runInactiveLeadCheckOnLoad: mocks.automation }));
import { useTeacherChecklist } from "../src/hooks/use-teacher-checklist";
import { useDailyPrioritiesQuery } from "../src/hooks/use-daily-priorities-query";

const NONE = { deadline_type: "none", due_date: null } as const;
const row = (id: string): TeacherChecklistItem => ({ id, teacher_id: "teacher", title: id, completed: false, ...NONE,
  created_at: "2026-11-06T00:00:00Z", updated_at: "2026-11-06T00:00:00Z" });
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let state: ReturnType<typeof useTeacherChecklist>;
let priorityState: ReturnType<typeof useDailyPrioritiesQuery>;
function Probe() { state = useTeacherChecklist(); return null; }
function Priorities() { priorityState = useDailyPrioritiesQuery(mocks.owner); return null; }
async function mount(priorities = false) {
  await act(async () => root.render(createElement(QueryClientProvider, { client },
    createElement("div", null, createElement(Probe), priorities ? createElement(Priorities) : null))));
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); mocks.owner = "teacher";
  mocks.read.mockResolvedValue([row("one"), row("two")]);
  mocks.priorities.mockResolvedValue({ items: [], failed: [] });
  mocks.automation.mockResolvedValue({ processedCount: 0 });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); container.remove(); });
const ready = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); }); };

describe("Checklist optimistic cache and independence", () => {
  it("updates immediately, prevents repeated same-item writes and reads back saved completion", async () => {
    await mount(); await ready();
    let finish: ((value: { item: TeacherChecklistItem }) => void) | undefined;
    mocks.write.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    let write: Promise<boolean> | undefined;
    await act(async () => { write = state.execute({ type: "complete", id: "one", completed: true }); });
    expect(client.getQueryData<TeacherChecklistItem[]>(["teacher-checklist", "teacher"])?.find((item) => item.id === "one")?.completed).toBe(true);
    expect(await state.execute({ type: "complete", id: "one", completed: false })).toBe(false);
    expect(mocks.write).toHaveBeenCalledOnce();
    await act(async () => { finish?.({ item: { ...row("one"), completed: true } }); await write; });
    await ready();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(state.items?.find((item) => item.id === "one")?.completed).toBe(true);
  });
  it("rolls back only a failed operation without undoing another successful edit", async () => {
    await mount(); await ready();
    let fail: ((error: Error) => void) | undefined;
    mocks.write.mockImplementation((_owner, command) => command.id === "one"
      ? new Promise((_resolve, reject) => { fail = reject; })
      : Promise.resolve({ item: { ...row("two"), title: "Saved edit" } }));
    let failed: Promise<boolean> | undefined;
    await act(async () => { failed = state.execute({ type: "edit", id: "one", title: "Failed edit" }); });
    await act(async () => { await state.execute({ type: "edit", id: "two", title: "Saved edit" }); });
    mocks.read.mockReturnValue(new Promise(() => undefined));
    await act(async () => { fail?.(new Error("network")); expect(await failed).toBe(false); });
    expect(client.getQueryData<TeacherChecklistItem[]>(["teacher-checklist", "teacher"])?.map((item) => [item.id, item.title])).toEqual([["one", "one"], ["two", "Saved edit"]]);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });
  it("keeps read failure distinct from an empty successful checklist", async () => {
    mocks.read.mockRejectedValueOnce(new Error("RLS"));
    await mount(); await ready();
    expect(state.items).toBeUndefined(); expect(state.error).toBeInstanceOf(Error);
    await act(async () => { await state.refetch(); }); await ready();
    expect(state.error).toBeNull(); expect(state.items).toHaveLength(2);
  });
  it("loads priorities without waiting for checklist or automation and never invalidates them on Checklist saves", async () => {
    mocks.read.mockReturnValue(new Promise(() => undefined));
    mocks.automation.mockReturnValue(new Promise(() => undefined));
    await mount(true); await ready();
    expect(mocks.priorities).toHaveBeenCalledOnce(); expect(priorityState.isSuccess).toBe(true);
    expect(state.isLoading).toBe(true);
    await act(async () => { client.setQueryData(["teacher-checklist", "teacher"], [row("one")]); }); await ready();
    mocks.write.mockResolvedValue({ item: { ...row("one"), completed: true } });
    await act(async () => { await state.execute({ type: "complete", id: "one", completed: true }); }); await ready();
    expect(mocks.priorities).toHaveBeenCalledOnce();
    expect(mocks.automation).toHaveBeenCalledOnce();
  });
  it("does not display another teacher's cached tasks on account switch", async () => {
    await mount(); await ready();
    mocks.owner = "other"; mocks.read.mockReturnValue(new Promise(() => undefined));
    await mount(); await ready();
    expect(state.items).toBeUndefined();
    expect(mocks.read).toHaveBeenLastCalledWith("other", expect.any(AbortSignal));
  });
});
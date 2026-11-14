// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cleanup: vi.fn(), persist: vi.fn(), summaries: vi.fn(), error: vi.fn(), order: [] as string[] }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "teacher" }, session: { user: { id: "teacher" } }, loading: false }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/lib/workspace-note-images", () => ({ deleteProjectNoteFiles: mocks.cleanup, workspaceNoteImagesKey: (o?: string) => ["workspace-note-images", o] }));
vi.mock("@/lib/workspace-projects-data", async (original) => ({
  ...(await original<object>()), fetchProjectSummaries: mocks.summaries, persistListCommand: mocks.persist,
}));
import { useWorkspaceProjects } from "../src/hooks/use-workspace-projects";

const project = { id: "p1", user_id: "teacher", title: "P", description: "", color: "green", icon: "folder", status: "archived", created_at: "now", updated_at: "now" };
let root: Root;
let api: ReturnType<typeof useWorkspaceProjects>;
function Probe() { api = useWorkspaceProjects(); return null; }

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.values(mocks).forEach((m) => typeof m === "function" && m.mockReset());
  mocks.order = [];
  mocks.summaries.mockResolvedValue([{ project, progress: { done: 0, total: 0, percent: 0 } }]);
  mocks.cleanup.mockImplementation(async () => { mocks.order.push("files"); });
  mocks.persist.mockImplementation(async () => { mocks.order.push("project"); return null; });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Probe))));
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
});
afterEach(async () => { await act(async () => root.unmount()); });

describe("project deletion", () => {
  it("removes the board's Storage files before deleting the project (also when archived)", async () => {
    let ok = false;
    await act(async () => { ok = await api.execute({ type: "delete", id: "p1" }); });
    expect(ok).toBe(true);
    expect(mocks.cleanup).toHaveBeenCalledWith("teacher", "p1");
    expect(mocks.order).toEqual(["files", "project"]);
  });
  it("keeps the project and shows an error when the Storage cleanup fails", async () => {
    mocks.cleanup.mockRejectedValueOnce(new Error("storage denied"));
    let ok = true;
    await act(async () => { ok = await api.execute({ type: "delete", id: "p1" }); });
    expect(ok).toBe(false);
    expect(mocks.persist).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
    expect(api.summaries?.map((s) => s.project.id)).toEqual(["p1"]);
  });
});

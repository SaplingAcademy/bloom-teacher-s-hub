// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "pt" }) }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<object>()),
  Link: ({ to, children }: { to: string; children: unknown }) => createElement("a", { href: to }, children as never),
}));
import { Route as OldNotebooksRoute } from "../src/routes/_app.workspace.notebooks";
import { Route as OldNotebookRoute } from "../src/routes/_app.workspace.notebooks_.$notebookId";
import { WorkspaceTabs } from "../src/components/bloom/workspace/WorkspaceShell";

const redirectOf = (beforeLoad: unknown) => {
  try { (beforeLoad as (ctx: object) => void)({ params: { notebookId: "n1" }, search: {} }); } catch (e) { return (e as { options: unknown }).options; }
  throw new Error("no redirect");
};

describe("Workspace without Notebooks", () => {
  it("redirects the old notebooks URLs to My Board", () => {
    expect(redirectOf(OldNotebooksRoute.options.beforeLoad)).toMatchObject({ to: "/workspace/mural", replace: true });
    expect(redirectOf(OldNotebookRoute.options.beforeLoad)).toMatchObject({ to: "/workspace/mural", replace: true });
    expect(OldNotebooksRoute.options.component).toBeUndefined();
    expect(OldNotebookRoute.options.component).toBeUndefined();
  });
  it("shows only My Board and Projects in the Workspace tabs", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const root = createRoot(document.body.appendChild(document.createElement("div")));
    await act(async () => root.render(createElement(WorkspaceTabs)));
    expect([...document.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.textContent])).toEqual([
      ["/workspace/mural", "workspace.tabs.mural"],
      ["/workspace/projects", "workspace.tabs.projects"],
    ]);
    await act(async () => root.unmount());
  });
});

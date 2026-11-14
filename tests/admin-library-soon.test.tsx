// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), setAvailability: vi.fn(), setLevel: vi.fn() }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-plan", () => ({ usePlan: () => ({ isSuperAdmin: true }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/library-access", async (original) => ({
  ...(await original<object>()),
  fetchLibraryClassifications: mocks.fetch, setLibraryAvailability: mocks.setAvailability, setLibraryClassification: mocks.setLevel,
}));
import { AdminLibraryResources } from "../src/components/bloom/AdminLibraryResources";
import { LIBRARY_CATALOG } from "../src/lib/library-catalog";
const INVOICE = LIBRARY_CATALOG.find((item) => item.id === "admin-invoice")!.title;

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
let root: Root;
let rows: unknown[];
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const row = (title: string) => Array.from(document.querySelectorAll("li")).find((li) => li.textContent?.includes(title))!;
const button = (scope: ParentNode, label: string) => Array.from(scope.querySelectorAll("button")).find((b) => b.textContent?.includes(label))!;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mocks.fetch.mockReset(); mocks.setAvailability.mockReset(); mocks.setLevel.mockReset();
  rows = [{ resource_id: "admin-invoice", access_level: "pro", availability: "available" }];
  mocks.fetch.mockImplementation(async () => rows);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(AdminLibraryResources))));
  await settle();
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("Admin Library SOON control", () => {
  it("marks a resource as SOON only after confirmation, keeping Free/Premium untouched, and refreshes", async () => {
    const title = INVOICE;
    await act(async () => button(row(title), "libraryAccess.markSoon").click());
    expect(mocks.setAvailability).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("libraryAccess.confirmSoon");
    mocks.setAvailability.mockImplementation(async () => { rows = [{ resource_id: "admin-invoice", access_level: "pro", availability: "soon" }]; return rows[0]; });
    await act(async () => button(document.querySelector('[role="dialog"]')!, "libraryAccess.confirm").click());
    await settle(); await settle();
    expect(mocks.setAvailability).toHaveBeenCalledWith("admin-invoice", "soon");
    expect(mocks.setLevel).not.toHaveBeenCalled();
    const updated = row(title);
    expect(updated.textContent).toContain("SOON");
    expect(updated.textContent).toContain("libraryAccess.premium");
    expect(button(updated, "libraryAccess.release")).toBeTruthy();
  });
  it("keeps the Free/Premium control independent", async () => {
    const title = document.querySelector("li p")!.textContent!;
    await act(async () => button(row(title), "libraryAccess.makePremium").click());
    expect(document.body.textContent).toContain("libraryAccess.confirmPremium");
    mocks.setLevel.mockResolvedValue({ resource_id: "x", access_level: "pro" });
    await act(async () => button(document.querySelector('[role="dialog"]')!, "libraryAccess.confirm").click());
    await settle();
    expect(mocks.setLevel).toHaveBeenCalled();
    expect(mocks.setAvailability).not.toHaveBeenCalled();
  });
});

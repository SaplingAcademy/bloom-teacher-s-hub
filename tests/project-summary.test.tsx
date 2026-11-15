// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt" }) }));
import { ProjectSummary } from "../src/components/bloom/workspace/ProjectSummary";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;
let root: Root;
const onSaveDates = vi.fn();
const progress = { done: 2, total: 5, percent: 40 };
const text = () => document.body.textContent ?? "";
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const render = (end: string | null, photo: string | null = null) => act(async () => root.render(createElement(ProjectSummary, {
  project: { start_date: "2026-11-03", end_date: end }, progress, pending: false, creator: { name: "Mariana Albuquerque", photo }, onSaveDates,
})));
const setInput = (id: string, value: string) => act(async () => {
  const input = document.getElementById(id) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = () => act(async () => { document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  onSaveDates.mockReset().mockResolvedValue(true);
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("project summary", () => {
  it("shows creator initials, the add-teacher slot, green progress and the start date", async () => {
    await render(null);
    expect(text()).toContain("Mariana Albuquerque");
    expect(text()).toContain("MA");
    expect(document.querySelector('button[aria-label="workspace.project.summary.addTeacher"]')).not.toBeNull();
    const bar = document.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect((bar.firstElementChild as HTMLElement).style.backgroundColor).toBe("var(--primary)");
    expect(document.querySelector('[data-testid="project-start-date"]')!.textContent).toContain("03/11/2026");
  });
  it("hides the end property when there is no end date", async () => {
    await render(null);
    expect(document.querySelector('[data-testid="project-end-date"]')).toBeNull();
    expect(text()).not.toContain("workspace.project.summary.end ");
    expect(document.querySelector('[data-testid="project-add-end"]')).not.toBeNull();
  });
  it("shows the real profile photo when available and the end date when set", async () => {
    await render("2026-12-15", "https://example.test/a.png");
    expect(document.querySelector("img")!.getAttribute("src")).toBe("https://example.test/a.png");
    expect(document.querySelector('[data-testid="project-end-date"]')!.textContent).toContain("15/12/2026");
    expect(document.querySelector('[data-testid="project-add-end"]')).toBeNull();
  });
  it("adds an end date and blocks one before the start", async () => {
    await render(null);
    await act(async () => (document.querySelector('[data-testid="project-add-end"]') as HTMLButtonElement).click());
    await setInput("project-end", "2026-11-01");
    expect(text()).toContain("workspace.project.summary.endBeforeStart");
    await submit();
    expect(onSaveDates).not.toHaveBeenCalled();
    await setInput("project-end", "2026-12-20");
    await submit();
    expect(onSaveDates).toHaveBeenCalledWith("2026-11-03", "2026-12-20");
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("edits the start date and removes the end date", async () => {
    await render("2026-12-15");
    await act(async () => (document.querySelector('[data-testid="project-start-date"]') as HTMLButtonElement).click());
    await setInput("project-start", "2026-11-10");
    await act(async () => Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) => b.textContent === "workspace.project.summary.removeEnd")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await submit();
    expect(onSaveDates).toHaveBeenCalledWith("2026-11-10", null);
  });
  it("keeps the dialog open when saving fails", async () => {
    onSaveDates.mockResolvedValue(false);
    await render(null);
    await act(async () => (document.querySelector('[data-testid="project-start-date"]') as HTMLButtonElement).click());
    await submit();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});

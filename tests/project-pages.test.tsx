// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectPages } from "../src/components/bloom/workspace/ProjectPages";

let root: Root;
const board = vi.fn(() => createElement("div", { "data-testid": "board" }, "board"));
const labels = { next: "next", previous: "previous", position: (page: number) => `page ${page}` };
const page = () => document.querySelector('[data-testid="project-page"]')!;
const indicator = () => document.querySelector('[data-testid="project-page-indicator"]')!.textContent;
const click = (label: string) => act(async () => (document.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement).click());

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  board.mockClear();
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(ProjectPages, { planning: createElement("div", { "data-testid": "planning" }, "plan"), board, labels })));
});
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("project pages (Jamboard-style)", () => {
  it("starts on planning with only a forward arrow and 1 / 2, without mounting the board", () => {
    expect(page().getAttribute("data-page")).toBe("1");
    expect(document.querySelector('[data-testid="planning"]')).not.toBeNull();
    expect(board).not.toHaveBeenCalled();
    expect(document.querySelector('button[aria-label="previous"]')).toBeNull();
    expect(indicator()).toContain("1 / 2");
  });
  it("goes to the board and back; exactly two pages", async () => {
    await click("next");
    expect(page().getAttribute("data-page")).toBe("2");
    expect(document.querySelector('[data-testid="board"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="planning"]')).toBeNull();
    expect(document.querySelector('button[aria-label="next"]')).toBeNull();
    expect(indicator()).toContain("2 / 2");
    await click("previous");
    expect(page().getAttribute("data-page")).toBe("1");
    expect(document.querySelector('[data-testid="planning"]')).not.toBeNull();
  });
  it("supports a horizontal swipe on touch screens, ignoring mostly vertical scrolls", async () => {
    const wrapper = page().parentElement!;
    const swipe = (x0: number, x1: number, y1 = 0) => act(async () => {
      wrapper.dispatchEvent(Object.assign(new Event("touchstart", { bubbles: true }), { touches: [{ clientX: x0, clientY: 0 }] }));
      wrapper.dispatchEvent(Object.assign(new Event("touchend", { bubbles: true }), { changedTouches: [{ clientX: x1, clientY: y1 }] }));
    });
    await swipe(300, 280, 200); // vertical scroll
    expect(page().getAttribute("data-page")).toBe("1");
    await swipe(300, 100);
    expect(page().getAttribute("data-page")).toBe("2");
    await swipe(100, 300);
    expect(page().getAttribute("data-page")).toBe("1");
  });
});

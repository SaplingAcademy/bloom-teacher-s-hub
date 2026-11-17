// @vitest-environment happy-dom
import { act, createElement, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/bloom/UrgentWidget", () => ({ UrgentWidget: () => createElement("section", { "data-testid": "urgent" }) }));
vi.mock("@/components/bloom/DailyPrioritiesCard", () => ({
  DailyPrioritiesCard: ({ fillHeight }: { fillHeight?: boolean }) => createElement("section", { "data-testid": "priorities", "data-fill": String(Boolean(fillHeight)) }),
}));
vi.mock("@/components/bloom/ChecklistCard", () => ({ ChecklistCard: () => createElement("section", { "data-testid": "checklist" }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "pt" }) }));
import { DashboardPrioritiesSection } from "../src/components/bloom/DashboardAttentionSections";
import { useFitViewportHeight } from "../src/hooks/use-fit-viewport-height";

let root: Root;
let desktop = true;
// Layout of the app: <main> (scrolling area below the 56px top bar) holding the page.
const layout = { mainTop: 56, mainHeight: 601, paddingBottom: 24, gridTop: 188 };

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { cb(0); return 1; });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  window.matchMedia = ((q: string) => ({ matches: desktop, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
  document.body.innerHTML = '<main style="padding-bottom:24px"><div id="page"></div></main>';
  const main = document.querySelector("main")!;
  Object.defineProperty(main, "clientHeight", { configurable: true, get: () => layout.mainHeight });
  main.getBoundingClientRect = () => ({ top: layout.mainTop } as DOMRect);
  root = createRoot(document.getElementById("page")!);
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); desktop = true; layout.mainHeight = 601; });

function Probe({ onHeight }: { onHeight: (h: number | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const height = useFitViewportHeight(ref);
  onHeight(height);
  return createElement("div", { ref, "data-probe": "" });
}
const mountProbe = async () => {
  let last: number | null | undefined;
  await act(async () => root.render(createElement(Probe, { onHeight: (h) => { last = h; } })));
  const probe = document.querySelector<HTMLElement>("[data-probe]")!;
  probe.getBoundingClientRect = () => ({ top: layout.gridTop } as DOMRect);
  await act(async () => { window.dispatchEvent(new Event("resize")); });
  return () => last;
};

describe("height available below the greeting", () => {
  it("is the visible area of <main> below the element, minus its bottom padding (1366×657 window)", async () => {
    const height = await mountProbe();
    // 601 visible − (188 − 56) from the top of <main> − 24 padding = 445
    expect(height()).toBe(445);
  });
  it("follows window resizes", async () => {
    const height = await mountProbe();
    layout.mainHeight = 712; // 1360×768
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    expect(height()).toBe(556);
  });
  it("falls back to normal page scrolling on very short screens and below the desktop breakpoint", async () => {
    layout.mainHeight = 504; // 1366×560 → 348 px left, below the legible minimum
    let height = await mountProbe();
    expect(height()).toBeNull();
    // Below the desktop breakpoint (fresh mount, as when opening the page on a phone/tablet).
    await act(async () => root.unmount());
    root = createRoot(document.getElementById("page")!);
    layout.mainHeight = 900;
    desktop = false;
    height = await mountProbe();
    expect(height()).toBeNull();
  });
});

describe("home blocks fitted to the screen", () => {
  const render = () => act(async () => root.render(createElement(DashboardPrioritiesSection, { teacherId: "t", refreshKey: 0, aside: createElement("div", { "data-testid": "indicators" }) })));
  const fit = async () => {
    await render();
    const grid = document.querySelector<HTMLElement>("[data-testid=dashboard-right-column]")!.parentElement!;
    grid.getBoundingClientRect = () => ({ top: layout.gridTop } as DOMRect);
    await act(async () => { window.dispatchEvent(new Event("resize")); });
    return grid;
  };
  it("desktop: the grid takes the available height; Priorities fill it; Checklist takes the room left; Urgent stays below the indicators", async () => {
    const grid = await fit();
    expect(grid.style.height).toBe("445px");
    expect(grid.dataset.fit).toBe("true");
    expect(document.querySelector("[data-testid=priorities]")!.getAttribute("data-fill")).toBe("true");
    const slot = document.querySelector<HTMLElement>("[data-testid=checklist-slot]")!;
    expect(slot.className).toContain("flex-1");
    expect(slot.className).not.toContain("xl:h-[20rem]"); // no fixed height that could clip on notebooks
    const right = document.querySelector<HTMLElement>("[data-testid=dashboard-right-column]")!;
    expect(right.className).toContain("h-full");
    const order = [...right.children].map((c) => c.getAttribute("data-testid"));
    expect(order).toEqual(["checklist-slot", "indicators", "urgent"]);
  });
  it("short screen or mobile: natural heights (page scrolls), no forced height", async () => {
    layout.mainHeight = 504;
    const grid = await fit();
    expect(grid.style.height).toBe("");
    expect(grid.dataset.fit).toBeUndefined();
    expect(document.querySelector("[data-testid=priorities]")!.getAttribute("data-fill")).toBe("false");
  });
});

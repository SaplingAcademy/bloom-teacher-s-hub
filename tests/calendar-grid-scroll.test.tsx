// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCalendarGridScroll } from "../src/hooks/use-calendar-grid-scroll";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
const days = [{ enabled: true, startTime: "06:15" }];
type Props = { ready: boolean; view: "day" | "week" | "month"; teacherId: string; days: typeof days };

function setup() {
  let props: Props = { ready: false, view: "week", teacherId: "teacher-1", days };
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const mounted = root;
  let area: HTMLDivElement;
  const rect = (top: number, height = 64) => ({ top, height, left: 0, right: 700, bottom: top + height, width: 700, x: 0, y: top, toJSON: () => ({}) });
  function Fixture(p: Props) {
    const { scrollRef, onScroll } = useCalendarGridScroll(p);
    return createElement("div", { ref: (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      if (!element) return;
      area = element;
      vi.spyOn(element, "getBoundingClientRect").mockImplementation(() => rect(100, 400));
      element.querySelectorAll<HTMLElement>("[data-hour]").forEach(row => {
        const hour = Number(row.dataset.hour?.slice(0, 2));
        vi.spyOn(row, "getBoundingClientRect").mockImplementation(() => rect(100 + (p.view === "week" ? 70 : 0) + hour * 64 - element.scrollTop));
      });
      const header = element.querySelector<HTMLElement>("[data-calendar-grid-header]");
      if (header) vi.spyOn(header, "getBoundingClientRect").mockImplementation(() => rect(100, 70));
    }, onScroll },
    p.view === "week" ? createElement("div", { "data-calendar-grid-header": "" }) : null,
    ...Array.from({ length: 24 }, (_, hour) => createElement("div", { key: hour, "data-calendar-drop-cell": "", "data-hour": `${String(hour).padStart(2, "0")}:00` })));
  }
  const render = (updates: Partial<Props> = {}) => { props = { ...props, ...updates }; act(() => mounted.render(createElement(Fixture, props))); };
  render();
  const getArea = () => {
    const element = container.firstElementChild;
    if (!(element instanceof HTMLDivElement)) throw new Error("Missing scroll area");
    return element;
  };
  const scroll = (top: number, left = 0) => { const element = getArea(); act(() => { element.scrollTop = top; element.scrollLeft = left; element.dispatchEvent(new Event("scroll")); }); };
  return { render, getArea, scroll };
}
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("Calendar initial scroll and preservation", () => {
  it("waits for availability/events and positions near 06:15 using rows below the sticky header", () => {
    const f = setup();
    expect(f.getArea().scrollTop).toBe(0);
    f.render({ ready: true });
    expect(f.getArea().scrollTop).toBe(6 * 64);
  });
  it("opens at 08h without configured availability", () => {
    const f = setup(); f.render({ ready: true, days: [] });
    expect(f.getArea().scrollTop).toBe(8 * 64);
  });
  it("does not reset scroll on rerenders or availability refreshes; midnight and end remain reachable", () => {
    const f = setup(); f.render({ ready: true }); f.scroll(1100, 160);
    f.render({ days: [{ enabled: true, startTime: "09:00" }] });
    expect(f.getArea().scrollTop).toBe(1100); expect(f.getArea().scrollLeft).toBe(160);
    f.scroll(0); f.render(); expect(f.getArea().scrollTop).toBe(0);
    f.scroll(1500); f.render(); expect(f.getArea().scrollTop).toBe(1500);
  });
  it("initializes day separately and restores each position after switching day/week/month", () => {
    const f = setup(); f.render({ ready: true }); f.scroll(1100, 180);
    f.render({ view: "day" }); expect(f.getArea().scrollTop).toBe(6 * 64);
    f.scroll(250); f.render({ view: "week" });
    expect(f.getArea().scrollTop).toBe(1100); expect(f.getArea().scrollLeft).toBe(180);
    f.render({ view: "month" }); f.render({ view: "day" }); expect(f.getArea().scrollTop).toBe(250);
  });
  it("does not inherit another teacher's viewport", () => {
    const f = setup(); f.render({ ready: true }); f.scroll(1100);
    f.render({ teacherId: "teacher-2", days: [] }); expect(f.getArea().scrollTop).toBe(8 * 64);
  });
});
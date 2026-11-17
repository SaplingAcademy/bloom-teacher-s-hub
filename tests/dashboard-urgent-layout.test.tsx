// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/bloom/UrgentWidget", () => ({
  UrgentWidget: () => createElement("section", { "data-testid": "urgent" }),
}));
vi.mock("@/components/bloom/DailyPrioritiesCard", () => ({
  DailyPrioritiesCard: () => createElement("section", { "data-testid": "priorities" }),
}));
// The real ChecklistCard shares one hook/cache between views; here it reports how it was rendered.
vi.mock("@/components/bloom/ChecklistCard", () => ({
  ChecklistCard: ({ expanded, onExpand }: { expanded?: boolean; onExpand?: () => void }) =>
    createElement("section", { "data-testid": expanded ? "checklist-expanded" : "checklist" },
      onExpand ? createElement("button", { "data-testid": "expand-checklist", onClick: onExpand }, "expand") : null),
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k, lang: "pt" }) }));

import { DashboardPrioritiesSection } from "../src/components/bloom/DashboardAttentionSections";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const render = () => act(async () => {
  root.render(createElement(DashboardPrioritiesSection, { teacherId: "teacher", refreshKey: 0, aside: createElement("div", { "data-testid": "indicators" }) }));
});
const q = (id: string) => document.querySelector(`[data-testid='${id}']`);
const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Home layout", () => {
  it("Priorities on the left; right column: Checklist on top, indicators below, Urgent across the column", async () => {
    await render();
    const right = q("dashboard-right-column")!;
    const priorities = q("priorities")!;
    expect(priorities.parentElement).toBe(right.parentElement);
    const [checklistSlot, indicators, urgent] = [q("checklist-slot")!, q("indicators")!, q("urgent")!];
    expect(checklistSlot.parentElement).toBe(right);
    expect(indicators.parentElement).toBe(right);
    expect(urgent.parentElement).toBe(right); // full width of the right column
    expect(follows(checklistSlot, indicators)).toBe(true);
    expect(follows(indicators, urgent)).toBe(true);
    expect(document.querySelectorAll("[data-testid='urgent']")).toHaveLength(1);
    // A little less vertical space: shorter Checklist slot and tighter gaps.
    expect(checklistSlot.className).toContain("xl:h-[17rem]");
    expect(right.className).toContain("gap-4");
  });

  it("the Checklist expands into a modal with the same component in its expanded view, and closes with Esc", async () => {
    await render();
    expect(q("checklist-expanded")).toBeNull();
    await act(async () => (q("expand-checklist") as HTMLButtonElement).click());
    expect(q("checklist-dialog")).not.toBeNull();
    expect(q("checklist-expanded")).not.toBeNull();
    expect(q("checklist")).not.toBeNull(); // compact view stays (same data, updated together)
    await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(q("checklist-dialog")).toBeNull();
  });
});

describe("Overview section order", () => {
  it("renders greeting, then Priorities (with Checklist, indicators and Urgent inside); no separate Urgent section", () => {
    const source = readFileSync(resolve(__dirname, "../src/routes/_app.index.tsx"), "utf8");
    const at = (marker: string) => {
      const index = source.indexOf(marker);
      expect(index, `missing ${marker}`).toBeGreaterThan(-1);
      return index;
    };
    expect(at("<PageHeader")).toBeLessThan(at("<DashboardPrioritiesSection"));
    expect(at("<DashboardPrioritiesSection")).toBeLessThan(at("<TodayLessonsCard"));
    expect(at("<TodayLessonsCard")).toBeLessThan(at("label={t.thisMonth}"));
    expect(source).not.toContain("DashboardUrgentSection");
    expect(source).not.toContain("label={t.activeStudents}");
    expect(source).not.toContain("label={t.newLeads}");
  });
});

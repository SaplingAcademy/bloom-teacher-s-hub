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
vi.mock("@/components/bloom/ChecklistCard", () => ({
  ChecklistCard: () => createElement("section", { "data-testid": "checklist" }),
}));

import { DashboardPrioritiesSection, DashboardUrgentSection } from "../src/components/bloom/DashboardAttentionSections";

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

describe("Dashboard attention section order", () => {
  it("renders Priorities with Checklist + indicators in the right column, and one Urgent section after", async () => {
    // Same order as the Overview: priorities block, then Urgent later (after the indicators).
    await act(async () => {
      root.render(
        createElement("div", null,
          createElement(DashboardPrioritiesSection, {
            teacherId: "teacher",
            refreshKey: 0,
            aside: createElement("div", { "data-testid": "indicators" }),
          }),
          createElement(DashboardUrgentSection, { teacherId: "teacher", refreshKey: 0 }),
        ),
      );
    });
    const urgent = container.querySelectorAll("[data-testid='urgent']");
    const priorities = container.querySelector("[data-testid='priorities']");
    const checklist = container.querySelector("[data-testid='checklist']");

    expect(urgent).toHaveLength(1);
    expect(priorities!.compareDocumentPosition(urgent[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const indicators = container.querySelector("[data-testid='indicators']");
    // Right column: Checklist slot on top, indicators right below it; Priorities is its sibling.
    const rightColumn = checklist?.parentElement?.parentElement;
    expect(priorities?.parentElement).toBe(rightColumn?.parentElement);
    expect(indicators?.parentElement).toBe(rightColumn);
    expect(priorities?.compareDocumentPosition(checklist!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(checklist?.compareDocumentPosition(indicators!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The Checklist no longer stretches to the priorities height (no absolute full-height column).
    expect(checklist?.parentElement?.className).not.toContain("absolute");
    expect(urgent[0].parentElement).not.toBe(priorities?.parentElement);
  });
});

describe("Overview section order", () => {
  it("renders greeting, then Priorities + Checklist + indicators, then Urgent; no redundant indicators", () => {
    const source = readFileSync(resolve(__dirname, "../src/routes/_app.index.tsx"), "utf8");
    const at = (marker: string) => {
      const index = source.indexOf(marker);
      expect(index, `missing ${marker}`).toBeGreaterThan(-1);
      return index;
    };
    const greeting = at("<PageHeader");
    const priorities = at("<DashboardPrioritiesSection");
    const lessons = at("<TodayLessonsCard");
    const revenue = at("label={t.thisMonth}");
    const urgent = at("<DashboardUrgentSection");
    expect(greeting).toBeLessThan(priorities);
    expect(priorities).toBeLessThan(lessons);
    expect(lessons).toBeLessThan(revenue);
    expect(revenue).toBeLessThan(urgent);
    expect(source).not.toContain("label={t.activeStudents}");
    expect(source).not.toContain("label={t.newLeads}");
  });
});

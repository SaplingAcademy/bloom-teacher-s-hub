// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
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
  it("renders Priorities first with the Checklist beside it, and one Urgent section after", async () => {
    // Same order as the Overview: priorities block first, Urgent later (after the indicators).
    await act(async () => {
      root.render(
        createElement("div", null,
          createElement(DashboardPrioritiesSection, { teacherId: "teacher", refreshKey: 0 }),
          createElement(DashboardUrgentSection, { teacherId: "teacher", refreshKey: 0 }),
        ),
      );
    });
    const urgent = container.querySelectorAll("[data-testid='urgent']");
    const priorities = container.querySelector("[data-testid='priorities']");
    const checklist = container.querySelector("[data-testid='checklist']");

    expect(urgent).toHaveLength(1);
    expect(priorities!.compareDocumentPosition(urgent[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(priorities?.parentElement).toBe(checklist?.parentElement?.parentElement);
    expect(priorities?.compareDocumentPosition(checklist!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(urgent[0].parentElement).not.toBe(priorities?.parentElement);
  });
});

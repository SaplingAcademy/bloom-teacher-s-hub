// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));
import { LessonPlanQuantityDialog } from "../src/components/bloom/LessonPlanQuantityDialog";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
const draft = { start: "2026-01-05", end: "2026-04-27", count: 20, times: ["10:15", "11:00"] };
function setup() {
  const events = { draft: { ...draft }, edited: 0, restarted: 0 };
  function Fixture() {
    const [quantity, setQuantity] = useState<{ requested: number; possible: number; missing: number } | null>({ requested: 20, possible: 17, missing: 3 });
    return createElement(LessonPlanQuantityDialog, { quantity,
      onEdit: () => { events.edited++; setQuantity(null); },
      onRestart: () => { events.restarted++; events.draft = { start: "", end: "", count: 0, times: [] }; setQuantity(null); },
    });
  }
  const container = document.createElement("div"); document.body.appendChild(container);
  root = createRoot(container); const mounted = root;
  act(() => mounted.render(createElement(Fixture)));
  const click = (key: string) => {
    const button = [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(key));
    if (!button) throw new Error(`Missing action ${key}`);
    act(() => button.click());
  };
  return { events, click };
}
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
describe("quantity dialog draft-loss rules", () => {
  it("edit exits the alert without discarding any planning values", () => {
    const { events, click } = setup(); click("lessonPlanGeneration.edit");
    expect(events.draft).toEqual(draft); expect(events.edited).toBe(1); expect(events.restarted).toBe(0);
  });
  it("requesting restart does not discard anything without explicit confirmation", () => {
    const { events, click } = setup(); click("lessonPlanGeneration.restart");
    expect(events.draft).toEqual(draft); expect(events.restarted).toBe(0);
  });
  it("cancelling restart preserves dates, quantity and times", () => {
    const { events, click } = setup(); click("lessonPlanGeneration.restart"); click("common.cancel");
    expect(events.draft).toEqual(draft); expect(events.restarted).toBe(0); expect(events.edited).toBe(0);
  });
  it("explicit restart confirms the discard exactly once", () => {
    const { events, click } = setup(); click("lessonPlanGeneration.restart"); click("lessonPlanGeneration.confirmRestart");
    expect(events.draft).toEqual({ start: "", end: "", count: 0, times: [] });
    expect(events.restarted).toBe(1); expect(events.edited).toBe(0);
  });
});
// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayLessonsCard } from "../src/components/bloom/TodayLessonsCard";

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
  document.body.innerHTML = "";
});

const events = [
  { id: "e1", startTime: "08:00", endTime: "09:00", duration: 60, studentName: "Ana Lima" },
  { id: "e2", startTime: "10:00", endTime: "11:00", duration: 60, studentName: "Turma B1" },
] as any[];

async function render(overrides: Record<string, unknown> = {}) {
  const props = {
    events, loading: false, error: false, label: "Aulas hoje", title: "Aulas de hoje", hint: "Próxima às 08:00",
    emptyLabel: "Nenhuma aula", errorLabel: "Erro", calendarLabel: "Abrir calendário",
    onOpenLesson: vi.fn(), onOpenCalendar: vi.fn(), compact: true, ...overrides,
  };
  await act(async () => root.render(createElement(TodayLessonsCard, props as any)));
  return props;
}

describe("TodayLessonsCard", () => {
  it("shows the count and next lesson, and the whole card opens the Agenda", async () => {
    const props = await render();
    expect(container.textContent).toContain("2");
    expect(container.textContent).toContain("Próxima às 08:00");
    const card = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Aulas hoje"))!;
    await act(async () => card.click());
    expect(props.onOpenCalendar).toHaveBeenCalledTimes(1);
  });

  it("lists today's lessons from the chevron button (touch/keyboard) and opens a lesson by id", async () => {
    const props = await render();
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Aulas de hoje"]')!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    await act(async () => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.textContent).toContain("Ana Lima");
    expect(document.body.textContent).toContain("Turma B1");
    const lesson = [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes("Ana Lima"))!;
    await act(async () => lesson.click());
    expect(props.onOpenLesson).toHaveBeenCalledWith("e1");
    expect(props.onOpenCalendar).not.toHaveBeenCalled();
  });

  it("keeps the loading and empty states", async () => {
    await render({ loading: true });
    expect(container.textContent).toContain("—");
    await render({ events: [], hint: undefined });
    const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Aulas de hoje"]')!;
    await act(async () => toggle.click());
    expect(document.body.textContent).toContain("Nenhuma aula");
  });
});

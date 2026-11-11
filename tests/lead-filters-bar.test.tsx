// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LABELS: Record<string, string> = {
  "leadFilters.filters": "Filtros", "leadFilters.clearAll": "Limpar tudo", "leadFilters.clearFilters": "Limpar filtros",
  "leadFilters.close": "Fechar", "leadFilters.groupFollowUp": "Etapa e acompanhamento", "leadFilters.groupProfile": "Perfil do lead",
  "leadFilters.groupDatesValues": "Datas e valores", "leadFilters.removeFilter": "Remover filtro: {label}",
  "leadFilters.stage": "Estágio", "leadFilters.tasks": "Tarefas", "leadFilters.tasksOverdue": "Com tarefas atrasadas",
  "leadFilters.valueMin": "Valor mínimo (R$)", "leadFilters.manyFound": "{count} leads encontrados", "leadFilters.oneFound": "1 lead encontrado",
  "leadFilters.onlyPending": "Sem primeiro contato", "leadFilters.activeFilters": "Filtros ativos", "stages.talking": "Em conversa",
};
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => LABELS[k] ?? k }) }));
vi.mock("@/hooks/use-catalog-options", () => ({ useCatalogOptions: () => ({ catalogOptions: null }) }));
vi.mock("@/hooks/use-teacher-languages", () => ({ useTeacherLanguages: () => ({ languages: [], formatLanguageLabel: (v: string) => v }) }));

import { LeadFiltersBar } from "../src/components/bloom/LeadFiltersBar";
import { EMPTY_LEAD_FILTERS, type LeadFilters } from "../src/lib/lead-filters";

let root: Root;
let container: HTMLDivElement;
let latest: LeadFilters;
const clearSearch = vi.fn();

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

function Harness({ initial }: { initial: LeadFilters }) {
  const [filters, setFilters] = useState(initial);
  latest = filters;
  return createElement(LeadFiltersBar, {
    filters, onChange: setFilters, stages: [{ id: "Em conversa", labelKey: "stages.talking" }], leads: [], resultCount: 3,
    hasSearch: false, onClearSearch: clearSearch, tasksError: false, onRetryTasks: () => {},
    search: createElement("input", { "aria-label": "search" }), viewToggle: createElement("div", null, "Kanban"),
  });
}
const render = (initial: LeadFilters) => act(async () => root.render(createElement(Harness, { initial })));
const buttons = (text: string) => [...document.body.querySelectorAll("button")].filter((b) => b.textContent?.includes(text));

describe("LeadFiltersBar", () => {
  it("starts closed with no chips and no counter", async () => {
    await render(EMPTY_LEAD_FILTERS);
    expect(document.body.textContent).not.toContain("Etapa e acompanhamento");
    expect(container.querySelector("[role=group]")).toBeNull();
    expect(buttons("Filtros")[0].textContent?.trim()).toBe("Filtros");
  });

  it("opens the grouped panel and closes it", async () => {
    await render(EMPTY_LEAD_FILTERS);
    await act(async () => buttons("Filtros")[0].click());
    for (const g of ["Etapa e acompanhamento", "Perfil do lead", "Datas e valores"]) expect(document.body.textContent).toContain(g);
    await act(async () => (document.body.querySelector('button[aria-label="Fechar"]') as HTMLButtonElement).click());
    expect(document.body.textContent).not.toContain("Perfil do lead");
  });

  it("shows active filters as chips with a counter; removes one and clears all", async () => {
    await render({ ...EMPTY_LEAD_FILTERS, stage: "Em conversa", tasks: "overdue", valueMin: "100" });
    expect(buttons("Filtros")[0].textContent?.trim()).toBe("Filtros3");
    const chips = container.querySelector("[role=group]")!.textContent!;
    expect(chips).toContain("Estágio: Em conversa");
    expect(chips).toContain("Tarefas: Com tarefas atrasadas");
    expect(chips).toContain("Valor mínimo (R$): 100");
    await act(async () => (container.querySelector('button[aria-label="Remover filtro: Tarefas: Com tarefas atrasadas"]') as HTMLButtonElement).click());
    expect(latest).toEqual({ ...EMPTY_LEAD_FILTERS, stage: "Em conversa", valueMin: "100" });
    expect(buttons("Filtros")[0].textContent?.trim()).toBe("Filtros2");
    await act(async () => buttons("Limpar tudo")[0].click());
    expect(latest).toEqual(EMPTY_LEAD_FILTERS);
    expect(clearSearch).toHaveBeenCalled();
    expect(container.querySelector("[role=group]")).toBeNull();
  });

  it("clears filters from the panel footer", async () => {
    await render({ ...EMPTY_LEAD_FILTERS, stage: "Em conversa" });
    await act(async () => buttons("Filtros")[0].click());
    await act(async () => buttons("Limpar filtros")[0].click());
    expect(latest).toEqual(EMPTY_LEAD_FILTERS);
  });
});

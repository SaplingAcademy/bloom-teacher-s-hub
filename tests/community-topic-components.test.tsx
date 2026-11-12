// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t as translate } from "@/lib/i18n";
import { CommunityFilterBar } from "../src/components/community/CommunityFilterBar";
import { CommunityTopicPicker } from "../src/components/community/CommunityTopicPicker";
import { CommunitySaveButton } from "../src/components/community/CommunitySaveButton";

const t = (k: string) => translate(k, "pt");
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
const render = (el: any) => act(async () => root.render(el));
const button = (text: string) => [...container.querySelectorAll("button")].find((b) => b.textContent?.startsWith(text))!;

describe("CommunityFilterBar", () => {
  it("shows Tudo, the five topics and Ajude outro professor with the unanswered count", async () => {
    await render(createElement(CommunityFilterBar, { value: "all", onChange: () => {}, helpCount: 2, t }));
    expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Tudo", "Dúvidas", "Ideias de aulas", "Materiais", "Gestão", "Conquistas", "Ajude outro professor2", "Salvos",
    ]);
    expect(button("Tudo").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[role=group]")?.getAttribute("aria-label")).toBe("Filtrar publicações");
  });

  it("reports the chosen filter and hides the badge when nothing needs help", async () => {
    const onChange = vi.fn();
    await render(createElement(CommunityFilterBar, { value: "materials", onChange, helpCount: 0, t }));
    expect(button("Materiais").getAttribute("aria-pressed")).toBe("true");
    expect(button("Ajude outro professor").textContent).toBe("Ajude outro professor");
    await act(async () => button("Ajude outro professor").click());
    await act(async () => button("Gestão").click());
    expect(onChange.mock.calls.map((c) => c[0])).toEqual(["help", "management"]);
  });
});

describe("CommunityTopicPicker", () => {
  it("offers the five topics as a single choice and shows the required message", async () => {
    const onChange = vi.fn();
    await render(createElement(CommunityTopicPicker, { value: null, onChange, showError: true, t }));
    const radios = [...container.querySelectorAll("[role=radio]")];
    expect(radios.map((r) => r.textContent)).toEqual(["Dúvidas", "Ideias de aulas", "Materiais", "Gestão", "Conquistas"]);
    expect(radios.every((r) => r.getAttribute("aria-checked") === "false")).toBe(true);
    expect(container.querySelector("[role=alert]")?.textContent).toBe("Escolha o assunto da publicação.");
    await act(async () => (radios[3] as HTMLButtonElement).click());
    expect(onChange).toHaveBeenCalledWith("management");

    await render(createElement(CommunityTopicPicker, { value: "management", onChange, showError: false, t }));
    const selected = container.querySelector("[role=radio][aria-checked=true]")!;
    expect(selected.textContent).toBe("Gestão");
    // High-contrast selected state, marked by a check icon (not color alone) and without a color transition.
    expect(selected.className).toContain("bg-primary");
    expect(selected.className).toContain("text-primary-foreground");
    expect(selected.className).not.toContain("transition-colors");
    expect(selected.querySelector("svg")).not.toBeNull();
    expect(container.querySelectorAll("[role=radio] svg")).toHaveLength(1);
    expect(container.querySelector("[role=alert]")).toBeNull();
  });
});

describe("CommunityFilterBar with visible filters", () => {
  it("renders only the given filters (e.g. Salvos hidden before the migration)", async () => {
    await render(createElement(CommunityFilterBar, { value: "all", onChange: () => {}, helpCount: 0, t, filters: ["all", "saved"] }));
    expect([...container.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Tudo", "Salvos"]);
  });
});

describe("CommunitySaveButton", () => {
  it("toggles between Salvar and Salvo with a bookmark icon and pressed state", async () => {
    const onToggle = vi.fn();
    await render(createElement(CommunitySaveButton, { saved: false, busy: false, onToggle, t }));
    let btn = container.querySelector("button")!;
    expect(btn.textContent).toBe("Salvar");
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.getAttribute("aria-label")).toBe("Salvar publicação");
    expect(btn.querySelector("svg")).not.toBeNull();
    await act(async () => btn.click());
    expect(onToggle).toHaveBeenCalledTimes(1);

    await render(createElement(CommunitySaveButton, { saved: true, busy: false, onToggle, t }));
    btn = container.querySelector("button")!;
    expect(btn.textContent).toBe("Salvo");
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.getAttribute("aria-label")).toBe("Remover dos salvos");

    await render(createElement(CommunitySaveButton, { saved: true, busy: true, onToggle, t }));
    expect(container.querySelector("button")!.disabled).toBe(true);
  });
});


// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InfoTooltip } from "../src/components/bloom/InfoTooltip";

const TEXT = "Ações descobertas automaticamente nos dados dos seus alunos, aulas e leads.";
let root: Root;
let container: HTMLDivElement;
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as any;

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
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const tooltipText = () => document.body.querySelector("[role=tooltip]")?.textContent ?? null;
const mount = () => act(async () => root.render(createElement(InfoTooltip, { label: "Sobre as Prioridades de Hoje", text: TEXT })));

describe("InfoTooltip", () => {
  it("is a labelled button with an info icon, closed by default", async () => {
    await mount();
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Sobre as Prioridades de Hoje");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.querySelector("svg.lucide-info")).not.toBeNull();
    expect(tooltipText()).toBeNull();
  });

  it("touch tap opens and a second tap closes (pointerdown → focus → click sequence)", async () => {
    await mount();
    const button = container.querySelector("button")!;
    const tap = async (withFocus: boolean) => {
      await act(async () => {
        button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
        document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "touch" }));
        if (withFocus) button.focus();
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      });
      await settle();
    };
    await tap(true);
    expect(tooltipText()).toBe(TEXT);
    await tap(false);
    expect(tooltipText()).toBeNull();
  });

  it("Enter/Space-style click (detail 0) toggles the tooltip", async () => {
    await mount();
    const button = container.querySelector("button")!;
    await act(async () => button.click());
    await settle();
    expect(tooltipText()).toBe(TEXT);
    await act(async () => button.click());
    await settle();
    expect(tooltipText()).toBeNull();
  });

  it("opens on keyboard focus and closes with Escape", async () => {
    await mount();
    const button = container.querySelector("button")!;
    await act(async () => button.focus());
    await settle();
    expect(tooltipText()).toBe(TEXT);
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    await settle();
    expect(tooltipText()).toBeNull();
  });
});

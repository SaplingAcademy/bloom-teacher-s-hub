// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useScrollFade } from "../src/hooks/use-scroll-fade";

let root: Root;
let container: HTMLDivElement;
const metrics = { scrollHeight: 600, clientHeight: 300 };

function List() {
  const fade = useScrollFade<HTMLDivElement>("list");
  return createElement("div", { ref: fade.ref, "data-testid": "list", "data-fade": fade.fade || undefined, style: fade.style },
    createElement("button", { type: "button" }, "Resolver"));
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => metrics.scrollHeight });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => metrics.clientHeight });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

const list = () => container.querySelector<HTMLDivElement>("[data-testid=list]")!;

describe("useScrollFade", () => {
  it("fades the bottom while more content sits below and removes it at the end of the list", async () => {
    metrics.scrollHeight = 600;
    await act(async () => root.render(createElement(List)));
    expect(list().dataset.fade).toBe("true");
    expect(list().style.maskImage || list().getAttribute("style")).toContain("linear-gradient");
    await act(async () => { list().scrollTop = 300; list().dispatchEvent(new Event("scroll")); });
    expect(list().dataset.fade).toBeUndefined();
    expect(list().getAttribute("style") ?? "").not.toContain("gradient");
    // The controls under the fade stay in the DOM and clickable (a mask covers nothing).
    expect(list().querySelector("button")!.textContent).toBe("Resolver");
  });

  it("shows no fade when the content fits", async () => {
    metrics.scrollHeight = 300;
    await act(async () => root.render(createElement(List)));
    expect(list().dataset.fade).toBeUndefined();
  });
});

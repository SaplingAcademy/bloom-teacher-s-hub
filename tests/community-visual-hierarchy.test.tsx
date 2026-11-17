// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommunityFilterBar } from "../src/components/community/CommunityFilterBar";
import { CommunitySaveButton } from "../src/components/community/CommunitySaveButton";

const t = (k: string) => k;
let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); root = createRoot(document.body.appendChild(document.createElement("div"))); });
afterEach(async () => { await act(async () => root.unmount()); document.body.innerHTML = ""; });

describe("Community: lighter filters and secondary actions", () => {
  it("inactive filters get a softer outline; the active one stays clearly highlighted", async () => {
    await act(async () => root.render(createElement(CommunityFilterBar, { value: "all", onChange: vi.fn(), helpCount: 0, t, filters: ["all", "questions", "help"] as never })));
    const [all, questions, help] = [...document.querySelectorAll("button")];
    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(all.className).toContain("bg-primary text-primary-foreground");
    expect(questions.className).toContain("border-border/50");
    expect(help.className).toContain("border-accent/25");
  });
  it("Salvar is visually secondary, and the saved state is still clear", async () => {
    await act(async () => root.render(createElement(CommunitySaveButton, { saved: false, busy: false, onToggle: vi.fn(), t })));
    expect(document.querySelector("button")!.className).toContain("text-muted-foreground");
    await act(async () => root.render(createElement(CommunitySaveButton, { saved: true, busy: false, onToggle: vi.fn(), t })));
    const saved = document.querySelector("button")!;
    expect(saved.className).toContain("text-primary");
    expect(saved.getAttribute("aria-pressed")).toBe("true");
  });
});

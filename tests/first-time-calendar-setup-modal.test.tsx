// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { translations } from "../src/lib/i18n";

const m = vi.hoisted(() => ({ seen: vi.fn(async () => {}) }));
vi.mock("@/lib/time-off-engine", () => ({ markCalendarSetupSeen: m.seen }));
vi.mock("@/hooks/use-language", async () => {
  const { translations: tr } = await import("../src/lib/i18n");
  const get = (key: string) => key.split(".").reduce((o: any, k) => o?.[k], tr.pt) ?? key;
  return { useLanguage: () => ({ t: get, lang: "pt" }) };
});
import { FirstTimeCalendarSetupModal } from "../src/components/bloom/FirstTimeCalendarSetupModal";

let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; m.seen.mockClear(); root = createRoot(document.body.appendChild(document.createElement("div"))); });
afterEach(async () => { await act(async () => root.unmount()); });

const open = (props: { onClose: () => void; onOpenSetupFlow: () => void }) =>
  act(async () => root.render(createElement(FirstTimeCalendarSetupModal, { isOpen: true, teacherId: "t1", ...props })));
const button = (text: string) => [...document.querySelectorAll("button")].find((b) => b.textContent?.includes(text)) as HTMLButtonElement;

describe("first-time availability pop-up (Agenda)", () => {
  it("shows only the calendar icon, the new title, one sentence and the two buttons", async () => {
    await open({ onClose: vi.fn(), onOpenSetupFlow: vi.fn() });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelector("h2")!.textContent).toBe("Configure sua disponibilidade");
    expect([...dialog.querySelectorAll("p")].map((p) => p.textContent)).toEqual(["Defina seus dias e horários de trabalho. Você pode alterar isso depois."]);
    expect(dialog.textContent).not.toContain("🌱");
    expect(dialog.querySelector(".lucide-clock")).toBeNull();
    expect(dialog.querySelector(".bg-emerald-50\\/60")).toBeNull();
    expect(dialog.querySelectorAll(".lucide-calendar-days").length).toBeGreaterThan(0);
    expect(button("Fazer depois")).toBeTruthy();
    expect(button("Configurar agora")).toBeTruthy();
    expect((translations.en as any).calendar.firstTimeSetupTitle).toBe("Set up your availability");
  });
  it("keeps the current actions: later only marks as seen; now also opens the setup flow", async () => {
    const onClose = vi.fn(); const onOpenSetupFlow = vi.fn();
    await open({ onClose, onOpenSetupFlow });
    await act(async () => button("Fazer depois").click());
    expect(m.seen).toHaveBeenCalledWith("t1");
    expect(onClose).toHaveBeenCalled();
    expect(onOpenSetupFlow).not.toHaveBeenCalled();
    await act(async () => button("Configurar agora").click());
    expect(onOpenSetupFlow).toHaveBeenCalledTimes(1);
  });
});

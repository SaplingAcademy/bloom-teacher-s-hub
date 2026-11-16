// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key, lang: "pt", setLang: vi.fn() }) }));
import { PackageFormModal } from "../src/components/bloom/PackageFormModal";

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
let root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); document.body.innerHTML = ""; root = createRoot(document.body.appendChild(document.createElement("div"))); });
afterEach(async () => { await act(async () => root.unmount()); });

const base = { name: "Inglês B1", price: 400, duration: 60, lessons: 4, method: "Pix", defaultInstallmentCount: null, contractMonths: 6 };
const fieldOrder = () => [...document.querySelectorAll('[id^="modal-pkg-"]')].map((el) => el.id.replace("modal-pkg-", ""))
  .filter((id, i, all) => all.indexOf(id) === i);
const open = (initialData: object | null) => act(async () => root.render(createElement(PackageFormModal, { isOpen: true, onClose: vi.fn(), onSave: vi.fn(), initialData } as never)));

describe("package modal field order", () => {
  it("edit (monthly, fixed period): model and value come right after the name, then the billing durations", async () => {
    await open({ ...base, frequency: "Monthly", billingDurationType: "fixed" });
    expect(fieldOrder().slice(0, 5)).toEqual(["name", "freq", "price", "duration-type", "contract-months"]);
    expect(fieldOrder().slice(5)).toEqual(["lessons", "duration", "method"]);
  });
  it("create (default monthly, continuous): no contract months field, same order", async () => {
    await open(null);
    expect(fieldOrder()).toEqual(["name", "freq", "price", "duration-type", "lessons", "duration", "method"]);
  });
  it("total course value: no billing-duration fields, installments keep their place", async () => {
    await open({ ...base, frequency: "total", billingDurationType: "continuous", defaultInstallmentCount: 3 });
    expect(fieldOrder()).toEqual(["name", "freq", "price", "lessons", "duration", "installments", "method"]);
  });
});

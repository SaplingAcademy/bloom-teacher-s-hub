// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t as translate } from "@/lib/i18n";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ supabase: { from } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1", email: "mariana@escola.com" }, profile: { full_name: "Mariana Albuquerque" } }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => translate(k, "pt") }) }));
vi.mock("@/hooks/use-students-query", () => ({ useStudentsQuery: () => ({ students: [{ id: "s1", name: "Ana Lima" }], error: null }) }));
const contracts = vi.hoisted(() => vi.fn());
vi.mock("@/lib/student-contracts", () => ({ listStudentContracts: contracts }));
vi.mock("@/components/layout/TeacherAvatar", () => ({ useTeacherIdentity: () => ({ name: "Mariana Albuquerque", email: "mariana@escola.com", avatarUrl: null }) }));
const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/receipt-pdf", async (orig) => ({ ...(await orig<any>()), renderReceiptPdf: vi.fn(async () => ({ save })) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as any;

import { ReceiptGenerator } from "../src/components/resources/ReceiptGenerator";

let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
async function type(id: string, value: string) {
  const el = input(id);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event("input", { bubbles: true })); });
}
const button = (text: string) => [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(text))!;

describe("ReceiptGenerator", () => {
  it("prefills the issuer, updates the preview live and downloads only when valid, without writing anything", async () => {
    await act(async () => root.render(createElement(ReceiptGenerator, { open: true, onOpenChange: () => {} })));
    expect(input("receipt-issuerName").value).toBe("Mariana Albuquerque");
    expect(input("receipt-issuerEmail").value).toBe("mariana@escola.com");

    await act(async () => button("Baixar PDF").click());
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Campo obrigatório.");

    await type("receipt-payerName", "Ana Lima");
    await type("receipt-amount", "640,00");
    await type("receipt-description", "aulas de inglês de novembro");
    const preview = document.querySelector("[data-testid=receipt-document]")!;
    expect(preview.textContent).toContain("Recebi de Ana Lima");
    expect(preview.textContent).toContain("seiscentos e quarenta reais");

    await act(async () => button("Baixar PDF").click());
    expect(save).toHaveBeenCalledWith(expect.stringMatching(/^recibo-.*-ana-lima\.pdf$/));
    expect(from).not.toHaveBeenCalled();
  });
});

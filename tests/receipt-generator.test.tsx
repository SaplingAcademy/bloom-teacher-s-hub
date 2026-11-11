// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t as translate } from "@/lib/i18n";

// Supabase double that records every call. Reads resolve with `db.contracts`; any write method,
// RPC or storage access is recorded so the test can prove the generator never writes.
const db = vi.hoisted(() => ({
  calls: [] as string[],
  contracts: [] as any[],
  gate: null as Promise<void> | null,
}));
vi.mock("@/lib/supabase", () => {
  const builder = (table: string): any => {
    const chain: any = {};
    for (const m of ["select", "eq", "order", "limit", "maybeSingle", "single"]) chain[m] = (..._a: unknown[]) => { db.calls.push(`${table}.${m}`); return chain; };
    for (const m of ["insert", "update", "upsert", "delete"]) chain[m] = (..._a: unknown[]) => { db.calls.push(`WRITE ${table}.${m}`); return chain; };
    chain.then = (resolve: (v: unknown) => void) => (db.gate ?? Promise.resolve()).then(() => resolve({ data: db.contracts, error: null }));
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => { db.calls.push(`from ${table}`); return builder(table); },
      rpc: (...a: unknown[]) => { db.calls.push(`WRITE rpc ${String(a[0])}`); return Promise.resolve({ data: null, error: null }); },
      storage: { from: () => { db.calls.push("WRITE storage"); return {}; } },
      auth: { getUser: async () => ({ data: { user: { id: "t1" } }, error: null }) },
    },
  };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "t1", email: "mariana@escola.com" }, profile: { full_name: "Mariana Albuquerque" } }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ lang: "pt", t: (k: string) => translate(k, "pt") }) }));
vi.mock("@/hooks/use-students-query", () => ({ useStudentsQuery: () => ({ students: [{ id: "s1", name: "Lucas Ferreira" }], error: null }) }));
vi.mock("@/components/layout/TeacherAvatar", () => ({ useTeacherIdentity: () => ({ name: "Mariana Albuquerque", email: "mariana@escola.com", avatarUrl: null }) }));
const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/receipt-pdf", async (orig) => ({ ...(await orig<any>()), renderReceiptPdf: vi.fn(async () => ({ save })) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
globalThis.ResizeObserver ??= class { observe() {} disconnect() {} unobserve() {} } as any;
// Radix Select needs these in happy-dom.
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

import { contractPayer, ReceiptGenerator } from "../src/components/resources/ReceiptGenerator";

let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  db.calls = []; db.contracts = []; db.gate = null;
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
const open = () => act(async () => root.render(createElement(ReceiptGenerator, { open: true, onOpenChange: () => {} })));
async function pickStudent(name: string) {
  const trigger = document.getElementById("receipt-student")!;
  await act(async () => { trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" })); });
  const option = [...document.body.querySelectorAll("[role=option]")].find((o) => o.textContent === name) as HTMLElement;
  await act(async () => { option.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType: "mouse" })); option.click(); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const guardian = { status: "active", signer_type: "guardian", signer_name: "Patrícia Ferreira", signer_document: "987.654.321-00" };

describe("contractPayer", () => {
  it("pairs the document only with the person it belongs to", () => {
    expect(contractPayer(guardian, "Lucas Ferreira")).toEqual({ payerName: "Patrícia Ferreira", payerDocument: "987.654.321-00" });
    expect(contractPayer({ ...guardian, signer_name: null }, "Lucas Ferreira")).toBeNull();
    expect(contractPayer({ ...guardian, signer_type: "company", signer_name: "Acme Ltda", signer_document: null }, "Lucas Ferreira"))
      .toEqual({ payerName: "Acme Ltda", payerDocument: "" });
    expect(contractPayer({ signer_type: "student", signer_name: "Lucas", signer_document: "111.222.333-44" }, "Lucas Ferreira"))
      .toEqual({ payerName: "Lucas Ferreira", payerDocument: "111.222.333-44" });
    expect(contractPayer({ signer_type: "student", signer_name: null, signer_document: null }, "Lucas Ferreira")).toBeNull();
  });
});

describe("ReceiptGenerator", () => {
  it("prefills the issuer, updates the preview live and downloads only when valid", async () => {
    await open();
    expect(input("receipt-issuerName").value).toBe("Mariana Albuquerque");
    expect(input("receipt-issuerEmail").value).toBe("mariana@escola.com");
    expect(input("receipt-number").readOnly).toBe(false);

    await act(async () => button("Baixar PDF").click());
    expect(save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Campo obrigatório.");

    await type("receipt-payerName", "Ana Lima");
    await type("receipt-number", "REC-77");
    await type("receipt-amount", "640,00");
    await type("receipt-description", "aulas de inglês de novembro");
    const preview = document.querySelector("[data-testid=receipt-document]")!;
    expect(preview.textContent).toContain("Recebi de Ana Lima");
    expect(preview.textContent).toContain("Nº REC-77");
    expect(preview.textContent).toContain("seiscentos e quarenta reais");

    await act(async () => button("Baixar PDF").click());
    expect(save).toHaveBeenCalledWith("recibo-rec-77-ana-lima.pdf");
    expect(db.calls.filter((c) => c.startsWith("WRITE"))).toEqual([]);
  });

  it("uses a named guardian as payer and keeps the teacher as issuer, reading contracts only", async () => {
    db.contracts = [guardian];
    await open();
    await pickStudent("Lucas Ferreira");
    expect(input("receipt-payerName").value).toBe("Patrícia Ferreira");
    expect(input("receipt-payerDocument").value).toBe("987.654.321-00");
    expect(input("receipt-issuerName").value).toBe("Mariana Albuquerque");
    expect(input("receipt-issuerDocument").value).toBe("");

    await type("receipt-amount", "640,00");
    await type("receipt-description", "aulas de novembro");
    await act(async () => button("Baixar PDF").click());
    expect(save).toHaveBeenCalledTimes(1);
    expect(db.calls).toContain("from student_contracts");
    expect(db.calls.every((c) => c.startsWith("from student_contracts") || c.startsWith("student_contracts."))).toBe(true);
    expect(db.calls.filter((c) => c.startsWith("WRITE"))).toEqual([]);
  });

  it("never pairs the student's name with an unnamed guardian's document", async () => {
    db.contracts = [{ ...guardian, signer_name: null }];
    await open();
    await pickStudent("Lucas Ferreira");
    expect(input("receipt-payerName").value).toBe("Lucas Ferreira");
    expect(input("receipt-payerDocument").value).toBe("");
  });

  it("does not overwrite payer edits made before the contract read finishes", async () => {
    let release!: () => void;
    db.gate = new Promise<void>((resolve) => { release = resolve; });
    db.contracts = [guardian];
    await open();
    await pickStudent("Lucas Ferreira");
    expect(input("receipt-payerName").value).toBe("Lucas Ferreira");
    await type("receipt-payerName", "Avó do Lucas");
    await act(async () => { release(); await new Promise((r) => setTimeout(r, 0)); });
    expect(input("receipt-payerName").value).toBe("Avó do Lucas");
    expect(input("receipt-payerDocument").value).toBe("");
  });
});

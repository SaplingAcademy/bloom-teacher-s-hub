import { describe, expect, it } from "vitest";
import {
  amountInWords,
  buildReceiptModel,
  emptyReceipt,
  parseAmountToCents,
  receiptFileName,
  validateReceipt,
  type ReceiptData,
} from "@/lib/receipt";
import { renderReceiptPdf } from "@/lib/receipt-pdf";
import { t as translate } from "@/lib/i18n";

const pt = (k: string) => translate(k, "pt");
const en = (k: string) => translate(k, "en");
const now = new Date(2026, 10, 11, 14, 30);
const filled = (over: Partial<ReceiptData> = {}): ReceiptData => ({
  ...emptyReceipt("pt", { name: "Mariana Albuquerque", email: "mariana@escola.com" }, now),
  payerName: "Ana Lima",
  amount: "640,00",
  description: "aulas de inglês de novembro",
  issuerCity: "São Paulo/SP",
  ...over,
});

describe("receipt amounts", () => {
  it("parses pt-BR and plain decimals into cents", () => {
    expect(parseAmountToCents("640")).toBe(64000);
    expect(parseAmountToCents("640,5")).toBe(64050);
    expect(parseAmountToCents("1.234,56")).toBe(123456);
    expect(parseAmountToCents("R$ 1.234,56")).toBe(123456);
    expect(parseAmountToCents("1234.56")).toBe(123456);
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("12,345")).toBeNull();
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("writes the amount in words (pt-BR and en)", () => {
    expect(amountInWords(64000, "pt")).toBe("seiscentos e quarenta reais");
    expect(amountInWords(100, "pt")).toBe("um real");
    expect(amountInWords(10000, "pt")).toBe("cem reais");
    expect(amountInWords(123456, "pt")).toBe("mil duzentos e trinta e quatro reais e cinquenta e seis centavos");
    expect(amountInWords(110000, "pt")).toBe("mil e cem reais");
    expect(amountInWords(5, "pt")).toBe("cinco centavos");
    expect(amountInWords(100000000, "pt")).toBe("um milhão de reais");
    expect(amountInWords(250000000, "pt")).toBe("dois milhões e quinhentos mil reais");
    expect(amountInWords(64050, "en")).toBe("six hundred forty reais and fifty centavos");
  });
});

describe("receipt validation and model", () => {
  it("requires payer, amount, description, date, number and issuer", () => {
    const errors = validateReceipt({ ...filled(), payerName: " ", amount: "0", description: "", issuerName: "" });
    expect(errors).toMatchObject({ payerName: "required", amount: "invalidAmount", description: "required", issuerName: "required" });
    expect(validateReceipt(filled())).toEqual({});
    expect(validateReceipt(filled({ paymentMethod: "other" }))).toEqual({ paymentMethodOther: "required" });
  });

  it("builds the document text with the amount in words and optional rows", () => {
    const model = buildReceiptModel(filled({ payerDocument: "123.456.789-00" }), "pt", pt);
    expect(model.title).toBe("Recibo");
    expect(model.amountText).toContain("640,00");
    expect(model.statement).toBe(
      "Recebi de Ana Lima, inscrito(a) no CPF/CNPJ 123.456.789-00, a importância de R$ 640,00 (seiscentos e quarenta reais), referente a aulas de inglês de novembro, período de referência novembro de 2026.",
    );
    expect(model.rows.map((r) => r.label)).toEqual(["Pagador", "CPF/CNPJ", "Descrição", "Período de referência", "Data do pagamento", "Forma de pagamento", "Valor"]);
    expect(model.placeAndDate).toBe("São Paulo/SP, 11 de novembro de 2026");
    expect(buildReceiptModel(filled({ period: "" }), "pt", pt).rows.map((r) => r.label)).not.toContain("Período de referência");
    expect(buildReceiptModel(filled(), "en", en).statement.startsWith("I received from Ana Lima the amount of")).toBe(true);
    expect(model.disclaimer).toContain("Não é nota fiscal");
  });

  it("names the file after the number and payer", () => {
    expect(receiptFileName(filled({ number: "2026-001", payerName: "João da Silva" }), "pt")).toBe("recibo-2026-001-joao-da-silva.pdf");
  });
});

describe("receipt PDF", () => {
  it("renders a single A4 page with the receipt text, even with long names and descriptions", async () => {
    const long = filled({
      payerName: "Maria Eduarda de Albuquerque Cavalcanti Figueiredo Nascimento e Souza Bragança Monteiro de Castro",
      description: "Aulas particulares de inglês com foco em conversação para viagens internacionais e preparação para entrevistas de emprego, incluindo material didático digital e acompanhamento semanal por mensagens entre as aulas, conforme contrato vigente.",
      issuerName: "Mariana Albuquerque Figueiredo de Castro Nascimento",
      issuerDocument: "12.345.678/0001-90",
      payerDocument: "123.456.789-00",
    });
    expect(validateReceipt(long)).toEqual({});
    const pdf = await renderReceiptPdf(buildReceiptModel(long, "pt", pt));
    expect(pdf.getNumberOfPages()).toBe(1);
    const size = pdf.internal.pageSize;
    expect([Math.round(size.getWidth()), Math.round(size.getHeight())]).toEqual([210, 297]);
    const raw = pdf.output();
    expect(raw).toContain("Recibo");
    expect(raw.startsWith("%PDF-")).toBe(true);
  });
});

describe("receipt statement punctuation", () => {
  it("does not double the punctuation when the description ends with a period", () => {
    const model = buildReceiptModel(filled({ description: "aulas de novembro." }), "pt", pt);
    expect(model.statement).toContain("referente a aulas de novembro, período de referência");
    expect(model.rows.find((r) => r.label === "Descrição")?.value).toBe("aulas de novembro.");
    expect(buildReceiptModel(filled({ description: "aulas.", period: "" }), "pt", pt).statement.endsWith("referente a aulas.")).toBe(true);
  });
});

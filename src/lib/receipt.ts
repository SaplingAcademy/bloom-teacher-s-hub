/**
 * Receipt generator (Resources → Administrative → Finance → Receipts): pure data, validation and
 * document model. A receipt documents a payment the teacher already received; generating one never
 * reads or writes invoices, payments or any other Finance record, and it is not a tax invoice.
 * Both the on-screen preview and the PDF render the same ReceiptModel, so they always agree.
 */

export type ReceiptLang = "pt" | "en";

export const RECEIPT_PAYMENT_METHODS = ["pix", "cash", "bankTransfer", "creditCard", "debitCard", "boleto", "other"] as const;
export type ReceiptPaymentMethod = (typeof RECEIPT_PAYMENT_METHODS)[number];

/** Input limits keep every receipt on a single A4 page without clipping. */
export const RECEIPT_LIMITS = {
  number: 30,
  name: 120,
  document: 24,
  description: 300,
  period: 60,
  methodOther: 40,
  email: 80,
  phone: 30,
  city: 60,
  amountCents: 99_999_999_99,
} as const;

export interface ReceiptData {
  number: string;
  payerName: string;
  payerDocument: string;
  /** As typed by the teacher (pt-BR or plain decimal); see parseAmountToCents. */
  amount: string;
  description: string;
  period: string;
  /** YYYY-MM-DD */
  paymentDate: string;
  paymentMethod: ReceiptPaymentMethod;
  paymentMethodOther: string;
  issuerName: string;
  issuerDocument: string;
  issuerEmail: string;
  issuerPhone: string;
  issuerCity: string;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function localYmd(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Suggested, editable receipt number (no database sequence in this version). */
export function suggestReceiptNumber(now = new Date()): string {
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

export function defaultReferencePeriod(lang: ReceiptLang, now = new Date()): string {
  const month = new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", { month: "long" }).format(now);
  return lang === "pt" ? `${month} de ${now.getFullYear()}` : `${month[0].toUpperCase()}${month.slice(1)} ${now.getFullYear()}`;
}

export function emptyReceipt(lang: ReceiptLang, issuer: { name?: string; email?: string } = {}, now = new Date()): ReceiptData {
  return {
    number: suggestReceiptNumber(now),
    payerName: "",
    payerDocument: "",
    amount: "",
    description: "",
    period: defaultReferencePeriod(lang, now),
    paymentDate: localYmd(now),
    paymentMethod: "pix",
    paymentMethodOther: "",
    issuerName: issuer.name ?? "",
    issuerDocument: "",
    issuerEmail: issuer.email ?? "",
    issuerPhone: "",
    issuerCity: "",
  };
}

/**
 * "640", "640,5", "1.234,56", "1234.56" → cents. Returns null for anything that is not a
 * positive amount with at most two decimals.
 */
export function parseAmountToCents(raw: string): number | null {
  const value = raw.replace(/\s|R\$/gi, "");
  if (!value) return null;
  let normalized: string;
  if (value.includes(",")) normalized = value.replace(/\./g, "").replace(",", ".");
  else if (/^\d+\.\d{1,2}$/.test(value)) normalized = value;
  else normalized = value.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isFinite(cents) && cents > 0 ? cents : null;
}

export function formatBRL(cents: number, lang: ReceiptLang): string {
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "BRL" }).format(cents / 100);
}

// ── Amount in words ──────────────────────────────────────────────────────────────────────────
const PT_UNITS = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze",
  "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const PT_TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const PT_HUNDREDS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ptBelowThousand(n: number): string {
  if (n === 100) return "cem";
  const parts: string[] = [];
  const h = Math.floor(n / 100), rest = n % 100;
  if (h) parts.push(PT_HUNDREDS[h]);
  if (rest) {
    if (rest < 20) parts.push(PT_UNITS[rest]);
    else {
      const tens = Math.floor(rest / 10), unit = rest % 10;
      parts.push(unit ? `${PT_TENS[tens]} e ${PT_UNITS[unit]}` : PT_TENS[tens]);
    }
  }
  return parts.join(" e ");
}

/** Joins with " e " when the lower part is below 100 or a round hundred (pt-BR convention). */
const ptJoin = (high: string, low: number) => (!low ? high : `${high}${low < 100 || low % 100 === 0 ? " e " : " "}${ptInteger(low)}`);

function ptInteger(n: number): string {
  if (n < 1000) return ptBelowThousand(n);
  if (n < 1_000_000) {
    const th = Math.floor(n / 1000);
    return ptJoin(th === 1 ? "mil" : `${ptBelowThousand(th)} mil`, n % 1000);
  }
  const mi = Math.floor(n / 1_000_000);
  return ptJoin(mi === 1 ? "um milhão" : `${ptInteger(mi)} milhões`, n % 1_000_000);
}

const EN_UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function enBelowThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100), rest = n % 100;
  if (h) parts.push(`${EN_UNITS[h]} hundred`);
  if (rest) parts.push(rest < 20 ? EN_UNITS[rest] : `${EN_TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${EN_UNITS[rest % 10]}` : ""}`);
  return parts.join(" ");
}

function enInteger(n: number): string {
  if (n < 1000) return enBelowThousand(n);
  if (n < 1_000_000) return [`${enBelowThousand(Math.floor(n / 1000))} thousand`, n % 1000 ? enBelowThousand(n % 1000) : ""].filter(Boolean).join(" ");
  return [`${enInteger(Math.floor(n / 1_000_000))} million`, n % 1_000_000 ? enInteger(n % 1_000_000) : ""].filter(Boolean).join(" ");
}

/** "R$ 1.234,56" → "mil duzentos e trinta e quatro reais e cinquenta e seis centavos". */
export function amountInWords(cents: number, lang: ReceiptLang): string {
  const reais = Math.floor(cents / 100), cent = cents % 100;
  if (lang === "en") {
    const r = reais ? `${enInteger(reais)} ${reais === 1 ? "real" : "reais"}` : "";
    const c = cent ? `${enInteger(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
    return [r, c].filter(Boolean).join(" and ");
  }
  // "um milhão de reais": "de" before the currency when the integer ends in a round million.
  const ofCurrency = reais >= 1_000_000 && reais % 1_000_000 === 0 ? " de" : "";
  const r = reais ? `${ptInteger(reais)}${ofCurrency} ${reais === 1 ? "real" : "reais"}` : "";
  const c = cent ? `${ptInteger(cent)} ${cent === 1 ? "centavo" : "centavos"}` : "";
  return [r, c].filter(Boolean).join(" e ");
}

// ── Validation ───────────────────────────────────────────────────────────────────────────────
export type ReceiptField = keyof ReceiptData;
export type ReceiptErrors = Partial<Record<ReceiptField, "required" | "invalidAmount" | "tooLong">>;

export function validateReceipt(d: ReceiptData): ReceiptErrors {
  const errors: ReceiptErrors = {};
  const required: ReceiptField[] = ["number", "payerName", "description", "paymentDate", "issuerName"];
  for (const key of required) if (!String(d[key]).trim()) errors[key] = "required";
  if (!d.amount.trim()) errors.amount = "required";
  else {
    const cents = parseAmountToCents(d.amount);
    if (cents === null) errors.amount = "invalidAmount";
    else if (cents > RECEIPT_LIMITS.amountCents) errors.amount = "tooLong";
  }
  if (d.paymentMethod === "other" && !d.paymentMethodOther.trim()) errors.paymentMethodOther = "required";
  const limits: [ReceiptField, number][] = [
    ["number", RECEIPT_LIMITS.number], ["payerName", RECEIPT_LIMITS.name], ["payerDocument", RECEIPT_LIMITS.document],
    ["description", RECEIPT_LIMITS.description], ["period", RECEIPT_LIMITS.period], ["paymentMethodOther", RECEIPT_LIMITS.methodOther],
    ["issuerName", RECEIPT_LIMITS.name], ["issuerDocument", RECEIPT_LIMITS.document], ["issuerEmail", RECEIPT_LIMITS.email],
    ["issuerPhone", RECEIPT_LIMITS.phone], ["issuerCity", RECEIPT_LIMITS.city],
  ];
  for (const [key, max] of limits) if (!errors[key] && String(d[key]).length > max) errors[key] = "tooLong";
  return errors;
}

// ── Document model ───────────────────────────────────────────────────────────────────────────
export interface ReceiptModel {
  title: string;
  numberLabel: string;
  amountText: string;
  statement: string;
  rows: { label: string; value: string }[];
  placeAndDate: string;
  signatureName: string;
  signatureDocument: string;
  footerLines: string[];
  disclaimer: string;
}

/** Translator for the "receiptDoc.*" dictionary (i18n-ui), injected so this module stays pure. */
export type ReceiptText = (key: string) => string;

export function paymentMethodLabel(d: Pick<ReceiptData, "paymentMethod" | "paymentMethodOther">, text: ReceiptText): string {
  return d.paymentMethod === "other" && d.paymentMethodOther.trim() ? d.paymentMethodOther.trim() : text(`receiptDoc.methods.${d.paymentMethod}`);
}

const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? "");

export function formatLongDate(ymd: string, lang: ReceiptLang): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  return new Intl.DateTimeFormat(lang === "pt" ? "pt-BR" : "en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${ymd}T12:00:00Z`));
}

/**
 * Builds what the receipt shows. Missing values render as a neutral dash in the preview so the
 * layout is stable while typing; the PDF is only exported once validateReceipt passes.
 */
/** "CPF" for 11 digits, "CNPJ" for 14, otherwise a generic label ("CPF/CNPJ" / "tax ID"). */
export function documentKindLabel(document: string, T: (key: string) => string): string {
  const digits = document.replace(/\D/g, "").length;
  return digits === 11 ? T("cpf") : digits === 14 ? T("cnpj") : T("docGeneric");
}

/**
 * The description as it reads inside the sentence: trailing punctuation removed (the sentence adds
 * its own) and, in Portuguese, a lowercase first letter ("como pagamento de aulas…") unless the first
 * word is an acronym such as "TOEFL" or "IELTS".
 */
export function statementDescription(description: string, lang: ReceiptLang): string {
  const text = description.trim().replace(/[\s.;,]+$/, "");
  if (lang !== "pt" || !text) return text;
  const firstWord = text.split(/\s/)[0];
  const isAcronym = firstWord.length > 1 && firstWord === firstWord.toLocaleUpperCase("pt-BR") && /\p{L}{2}/u.test(firstWord);
  return isAcronym ? text : text.charAt(0).toLocaleLowerCase("pt-BR") + text.slice(1);
}

export function buildReceiptModel(d: ReceiptData, lang: ReceiptLang, text: ReceiptText): ReceiptModel {
  const T = (k: string) => text(`receiptDoc.${k}`);
  const dash = "—";
  const cents = parseAmountToCents(d.amount);
  const amount = cents ? formatBRL(cents, lang) : dash;
  const words = cents ? amountInWords(cents, lang) : dash;
  const payer = d.payerName.trim() || dash;
  const payerDocument = d.payerDocument.trim();
  const description = d.description.trim() || dash;
  const period = d.period.trim();
  const date = formatLongDate(d.paymentDate, lang);
  const city = d.issuerCity.trim();
  const issuerName = d.issuerName.trim();
  const issuerDocument = d.issuerDocument.trim();
  const rows = [
    { label: T("payer"), value: payer },
    ...(payerDocument ? [{ label: T("document"), value: payerDocument }] : []),
    { label: T("description"), value: description },
    ...(period ? [{ label: T("period"), value: period }] : []),
    { label: T("date"), value: date || dash },
    { label: T("method"), value: paymentMethodLabel(d, text) },
    { label: T("amount"), value: amount },
  ];
  return {
    title: T("title"),
    numberLabel: `${T("number")} ${d.number.trim() || dash}`,
    amountText: amount,
    statement: fill(T("statement"), {
      payer,
      doc: payerDocument ? fill(T("statementDoc"), { docLabel: documentKindLabel(payerDocument, T), doc: payerDocument }) : "",
      amount,
      words,
      description: statementDescription(description, lang) || dash,
      period: period ? fill(T("statementPeriod"), { period }) : "",
    }),
    rows,
    placeAndDate: [city, date].filter(Boolean).join(", "),
    signatureName: issuerName || dash,
    signatureDocument: issuerDocument ? `${T("document")}: ${issuerDocument}` : "",
    // Name and CPF/CNPJ already sit under the signature; the footer keeps contacts and city only.
    footerLines: [[d.issuerEmail.trim(), d.issuerPhone.trim(), city].filter(Boolean).join(" · ")].filter(Boolean),
    disclaimer: T("disclaimer"),
  };
}

export function receiptFileName(d: ReceiptData, lang: ReceiptLang): string {
  const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  return `${lang === "pt" ? "recibo" : "receipt"}-${slug(d.number) || "sem-numero"}${d.payerName.trim() ? `-${slug(d.payerName).slice(0, 40)}` : ""}.pdf`;
}

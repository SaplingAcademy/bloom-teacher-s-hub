import type { ReceiptModel } from "@/lib/receipt";

/**
 * A4 receipt layout in millimetres, shared by the PDF renderer and the HTML preview so both place
 * every block in the same spot. Colours follow Bloom's forest/cream palette on a light green page.
 */
export const RECEIPT_LAYOUT = {
  page: { width: 210, height: 297 },
  margin: 18,
  accentBar: 6,
  titleY: 30,
  dividerY: 44,
  statementY: 54,
  statementLine: 5.6,
  statementSize: 11,
  tableGap: 7,
  labelWidth: 52,
  rowPadding: 3,
  rowLine: 5,
  valueSize: 10.5,
  labelSize: 8,
  placeGap: 12,
  placeLine: 5,
  /** Signature line below the place/date line (room for a handwritten signature), or below the table. */
  signatureAfterPlace: 26,
  signatureAfterTable: 30,
  signatureWidth: 80,
  footerY: 270,
  colors: {
    page: "#EEF4EC",
    forest: "#163020",
    cream: "#F4EBE1",
    text: "#1F2A22",
    muted: "#5E6E61",
    border: "#CAD8C6",
    white: "#FFFFFF",
  },
} as const;

/** Renders the receipt model into a single-page A4 PDF (vector text) and returns the document. */
export async function renderReceiptPdf(model: ReceiptModel) {
  const { jsPDF } = await import("jspdf");
  const L = RECEIPT_LAYOUT;
  const C = L.colors;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  const W = L.page.width, M = L.margin, contentW = W - 2 * M;
  doc.setProperties({ title: `${model.title} ${model.numberLabel}`, creator: "Bloom" });
  /** One line that fits `width` at the current font, ending in "…" when it had to be shortened. */
  const fit = (text: string, width: number) => {
    if (doc.getTextWidth(text) <= width) return text;
    let cut = text;
    while (cut.length > 1 && doc.getTextWidth(`${cut}…`) > width) cut = cut.slice(0, -1);
    return `${cut.trimEnd()}…`;
  };

  // Page background + top accent bar
  doc.setFillColor(C.page); doc.rect(0, 0, W, L.page.height, "F");
  doc.setFillColor(C.forest); doc.rect(0, 0, W, L.accentBar, "F");

  // Header: title (left), number + amount pill (right)
  doc.setFont("helvetica", "bold"); doc.setFontSize(30); doc.setTextColor(C.forest);
  doc.text(model.title, M, L.titleY);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(C.muted);
  doc.text(model.numberLabel, W - M, 21, { align: "right" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  const pillW = doc.getTextWidth(model.amountText) + 12;
  doc.setFillColor(C.forest); doc.roundedRect(W - M - pillW, 25, pillW, 12, 3, 3, "F");
  doc.setTextColor(C.white); doc.text(model.amountText, W - M - pillW / 2, 33.2, { align: "center" });

  doc.setDrawColor(C.border); doc.setLineWidth(0.3); doc.line(M, L.dividerY, W - M, L.dividerY);

  // Statement
  doc.setFont("helvetica", "normal"); doc.setFontSize(L.statementSize); doc.setTextColor(C.text);
  const statement = doc.splitTextToSize(model.statement, contentW) as string[];
  doc.text(statement, M, L.statementY, { lineHeightFactor: L.statementLine / (L.statementSize * 0.3528) });
  let y = L.statementY + (statement.length - 1) * L.statementLine + L.tableGap;

  // Table (white card with separators)
  const valueW = contentW - L.labelWidth - 2 * L.rowPadding;
  doc.setFontSize(L.valueSize);
  const rows = model.rows.map((row) => {
    doc.setFont("helvetica", row === model.rows[model.rows.length - 1] ? "bold" : "normal");
    const lines = doc.splitTextToSize(row.value, valueW) as string[];
    return { ...row, lines, height: Math.max(1, lines.length) * L.rowLine + 2 * L.rowPadding };
  });
  const tableH = rows.reduce((sum, r) => sum + r.height, 0);
  doc.setFillColor(C.white); doc.setDrawColor(C.border);
  doc.roundedRect(M, y, contentW, tableH, 2.5, 2.5, "FD");
  rows.forEach((row, index) => {
    const top = y;
    if (index > 0) doc.line(M, top, W - M, top);
    doc.setFont("helvetica", "bold"); doc.setFontSize(L.labelSize); doc.setTextColor(C.muted);
    doc.text(row.label.toUpperCase(), M + L.rowPadding + 1, top + L.rowPadding + 3.6);
    const last = index === rows.length - 1;
    doc.setFont("helvetica", last ? "bold" : "normal"); doc.setFontSize(L.valueSize); doc.setTextColor(last ? C.forest : C.text);
    doc.text(row.lines, M + L.labelWidth + L.rowPadding, top + L.rowPadding + 3.7, { lineHeightFactor: L.rowLine / (L.valueSize * 0.3528) });
    y += row.height;
  });

  // Place and date
  const placeY = y + L.placeGap;
  if (model.placeAndDate) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(L.valueSize); doc.setTextColor(C.text);
    doc.text(model.placeAndDate, W - M, placeY, { align: "right" });
  }

  // Signature follows the content (field limits keep it clear of the footer; clamped as a safeguard)
  const sigY = Math.min(model.placeAndDate ? placeY + L.signatureAfterPlace : y + L.signatureAfterTable, L.footerY - 24);
  const sigX = (W - L.signatureWidth) / 2;
  doc.setDrawColor(C.forest); doc.setLineWidth(0.35); doc.line(sigX, sigY, sigX + L.signatureWidth, sigY);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(C.text);
  const sigName = (doc.splitTextToSize(model.signatureName, 120) as string[]).slice(0, 2);
  sigName.forEach((line, i) => doc.text(line, W / 2, sigY + 5.5 + i * 5, { align: "center" }));
  if (model.signatureDocument) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(C.muted);
    doc.text(fit(model.signatureDocument, 120), W / 2, sigY + 5.5 + sigName.length * 5, { align: "center" });
  }

  // Footer band: issuer contacts and city (name/CPF-CNPJ are under the signature) + disclaimer
  doc.setFillColor(C.forest); doc.rect(0, L.footerY, W, L.page.height - L.footerY, "F");
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(C.cream);
  let fy = L.footerY + 10.5;
  for (const line of model.footerLines) {
    doc.text(fit(line, contentW), W / 2, fy, { align: "center" });
    fy += 5;
  }
  doc.setFontSize(7.5); doc.setTextColor("#C9D6C4");
  doc.text(model.disclaimer, W / 2, L.page.height - 6, { align: "center" });
  return doc;
}

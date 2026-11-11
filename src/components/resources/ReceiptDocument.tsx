import { useLayoutEffect, useRef, useState } from "react";
import type { ReceiptModel } from "@/lib/receipt";
import { RECEIPT_LAYOUT as L } from "@/lib/receipt-pdf";

const MM_PX = 96 / 25.4;
const C = L.colors;

/**
 * On-screen A4 preview of the receipt. It is laid out in millimetres with the same coordinates and
 * palette as renderReceiptPdf, then scaled to the available width, so what the teacher sees is what
 * the PDF contains (long values wrap instead of overflowing).
 */
export function ReceiptDocument({ model }: { model: ReceiptModel }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / (L.page.width * MM_PX)));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const mm = (v: number) => `${v}mm`;
  const last = model.rows.length - 1;

  return (
    <div ref={wrapRef} className="w-full" style={{ height: L.page.height * MM_PX * scale }}>
      <div
        data-testid="receipt-document"
        aria-label={`${model.title} ${model.numberLabel}`}
        className="relative overflow-hidden shadow-[var(--shadow-lg)] ring-1 ring-black/5"
        style={{
          width: mm(L.page.width),
          height: mm(L.page.height),
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          background: C.page,
          color: C.text,
          fontFamily: "Helvetica, Arial, sans-serif",
        }}
      >
        <div className="absolute inset-x-0 top-0" style={{ height: mm(L.accentBar), background: C.forest }} />

        <h2 className="absolute m-0 font-bold leading-none" style={{ left: mm(L.margin), top: mm(L.titleY - 8.3), fontSize: "30pt", color: C.forest }}>
          {model.title}
        </h2>
        <p className="absolute m-0 leading-none" style={{ right: mm(L.margin), top: mm(18.5), fontSize: "9.5pt", color: C.muted }}>
          {model.numberLabel}
        </p>
        <div
          className="absolute flex items-center justify-center whitespace-nowrap font-bold"
          style={{ right: mm(L.margin), top: mm(25), height: mm(12), padding: `0 ${mm(6)}`, borderRadius: mm(3), background: C.forest, color: C.white, fontSize: "16pt" }}
        >
          {model.amountText}
        </div>
        <div className="absolute" style={{ left: mm(L.margin), right: mm(L.margin), top: mm(L.dividerY), borderTop: `0.3mm solid ${C.border}` }} />

        <div className="absolute" style={{ left: mm(L.margin), right: mm(L.margin), top: mm(L.statementY - 4.2) }}>
          <p className="m-0 [overflow-wrap:anywhere]" style={{ fontSize: `${L.statementSize}pt`, lineHeight: mm(L.statementLine) }}>{model.statement}</p>

          <div className="overflow-hidden" style={{ marginTop: mm(L.tableGap - 1.4), background: C.white, border: `0.3mm solid ${C.border}`, borderRadius: mm(2.5) }}>
            {model.rows.map((row, index) => (
              <div
                key={row.label}
                className="grid"
                style={{ gridTemplateColumns: `${mm(L.labelWidth)} minmax(0,1fr)`, padding: mm(L.rowPadding), borderTop: index ? `0.3mm solid ${C.border}` : undefined }}
              >
                <span className="font-bold uppercase" style={{ fontSize: `${L.labelSize}pt`, lineHeight: mm(L.rowLine), color: C.muted, paddingLeft: mm(1) }}>{row.label}</span>
                <span
                  className="[overflow-wrap:anywhere]"
                  style={{ fontSize: `${L.valueSize}pt`, lineHeight: mm(L.rowLine), fontWeight: index === last ? 700 : 400, color: index === last ? C.forest : C.text }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {model.placeAndDate && (
            <p className="m-0 text-right" style={{ marginTop: mm(L.placeGap - 4), fontSize: `${L.valueSize}pt` }}>{model.placeAndDate}</p>
          )}
        </div>

        <div className="absolute text-center" style={{ left: mm((L.page.width - 120) / 2), width: mm(120), top: mm(L.signatureMinY) }}>
          <div className="mx-auto" style={{ width: mm(L.signatureWidth), borderTop: `0.35mm solid ${C.forest}` }} />
          <p className="m-0 font-bold [overflow-wrap:anywhere] line-clamp-2" style={{ marginTop: mm(1.6), fontSize: "11pt", lineHeight: mm(5) }}>{model.signatureName}</p>
          {model.signatureDocument && <p className="m-0 truncate" style={{ fontSize: "9pt", lineHeight: mm(5), color: C.muted }}>{model.signatureDocument}</p>}
        </div>

        <footer className="absolute inset-x-0 bottom-0 text-center" style={{ top: mm(L.footerY), background: C.forest, color: C.cream, padding: `${mm(5)} ${mm(L.margin)} 0` }}>
          {model.footerLines.map((line) => (
            <p key={line} className="m-0 truncate" style={{ fontSize: "9pt", lineHeight: mm(5) }}>{line}</p>
          ))}
          <p className="absolute inset-x-0 m-0" style={{ bottom: mm(4.2), fontSize: "7.5pt", color: "#C9D6C4" }}>{model.disclaimer}</p>
        </footer>
      </div>
    </div>
  );
}

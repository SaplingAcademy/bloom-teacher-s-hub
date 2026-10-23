import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { buildMonthlyCashFlow } from "@/lib/finance-cashflow";
import { useFinancialPrivacy } from "@/lib/financial-privacy";
import { formatCentsToBRL, type Expense, type RealInvoice } from "@/lib/finance-engine";

export function MonthlyCashFlowChart({ invoices, expenses, lang }: { invoices: RealInvoice[]; expenses: Expense[]; lang: string }) {
  const pt = lang === "pt";
  const { money, financialValuesHidden } = useFinancialPrivacy();
  const [months, setMonths] = useState<6 | 12>(6);
  const locale = pt ? "pt-BR" : "en-US";
  const data = buildMonthlyCashFlow(invoices, expenses, months).map((r) => {
    const [y, m] = r.month.split("-").map(Number);
    return {
      label: new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short", year: "2-digit" }),
      income: r.incomeCents / 100,
      expenses: r.expenseCents / 100,
    };
  });
  const config: ChartConfig = {
    income: { label: pt ? "Entradas" : "Income", color: "var(--chart-1)" },
    expenses: { label: pt ? "Saídas" : "Expenses", color: "var(--chart-2)" },
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground">{pt ? "Fluxo mensal" : "Monthly cash flow"}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pt ? "Entradas pela data real do pagamento; saídas pela data da despesa." : "Income by actual payment date; expenses by expense date."}
          </p>
        </div>
        <div className="inline-flex rounded-xl border border-border p-0.5">
          {([6, 12] as const).map((n) => (
            <button key={n} type="button" onClick={() => setMonths(n)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold ${months === n ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"}`}>
              {pt ? `${n} meses` : `${n} months`}
            </button>
          ))}
        </div>
      </div>
      <ChartContainer config={config} className="h-64 w-full">
        <BarChart data={data} margin={{ left: 4, right: 4 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={56}
            tickFormatter={(v: number) => financialValuesHidden ? "•••" : v.toLocaleString(locale, { notation: "compact" })} />
          <ChartTooltip content={<ChartTooltipContent formatter={(value, name) => (
            <span className="flex w-full justify-between gap-3">
              <span className="text-muted-foreground">{config[name as string]?.label}</span>
              <span className="font-semibold text-foreground">{money(formatCentsToBRL(Math.round(Number(value) * 100)))}</span>
            </span>
          )} />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="income" fill="var(--color-income)" radius={[6, 6, 0, 0]} />
          <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}

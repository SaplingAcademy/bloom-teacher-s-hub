import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";

/** One selectable growth indicator. Values come ready from the page's existing calculations. */
export interface GrowthMetricOption {
  key: string;
  label: string;
  /** Current value, already formatted by the page (privacy masking included). */
  currentText: string;
  /** Optional comparison vs. the previous period, already formatted (e.g. "+12%"). */
  trend?: { value: string; positive: boolean };
  /** Monthly values aligned with `months` (null = no data), or null when the indicator has no history. */
  series: (number | null)[] | null;
  /** Formats a value for the tooltip (privacy masking included). */
  formatValue: (value: number) => string;
  /** Formats a vertical-axis tick; return "" to hide it. */
  formatTick: (value: number) => string;
  /** Unit shown above the vertical axis (e.g. "alunos", "%", "R$"). */
  unit: string;
  /** Integer ticks only (counts). */
  integer?: boolean;
}

interface GrowthMetricsChartProps {
  options: GrowthMetricOption[];
  /** "YYYY-MM" keys, oldest first. */
  months: string[];
  locale: string;
  loading: boolean;
  texts: { noHistory: string; insufficient: string; current: string };
}

const chartConfig = { value: { label: "value", color: "var(--color-primary)" } } satisfies ChartConfig;

/** Indicator selector + smooth line chart of real monthly values (no invented or zero-filled points). */
export function GrowthMetricsChart({ options, months, locale, loading, texts }: GrowthMetricsChartProps) {
  const [selectedKey, setSelectedKey] = useState(options[0]?.key);
  const selected = options.find((option) => option.key === selectedKey) ?? options[0];
  if (!selected) return null;

  const monthLabel = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const name = new Date(year, month - 1, 1).toLocaleDateString(locale, { month: "short" }).replace(".", "");
    return `${name}/${String(year).slice(-2)}`;
  };
  const data = months.map((key, index) => ({ month: monthLabel(key), value: selected.series?.[index] ?? null }));
  const points = data.filter((point) => point.value !== null).length;
  const emptyText = !selected.series ? texts.noHistory : points < 2 ? texts.insufficient : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
      <div role="tablist" aria-label={texts.current} className="-mx-1 flex gap-1 overflow-x-auto pb-1">
        {options.map((option) => {
          const active = option.key === selected.key;
          return (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls="growth-metrics-panel"
              onClick={() => setSelectedKey(option.key)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                active ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      <div id="growth-metrics-panel" role="tabpanel" aria-label={selected.label} className="mt-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-3xl font-extrabold text-foreground tabular-nums">{selected.currentText}</span>
          {selected.trend && (
            <span className={`text-xs font-bold ${selected.trend.positive ? "text-success" : "text-destructive"}`}>{selected.trend.value}</span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{texts.current}</p>

        <div className="mt-4">
          {loading ? (
            <div className="h-56 animate-pulse rounded-xl bg-secondary/40" role="status" aria-label={selected.label} />
          ) : emptyText ? (
            <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-border px-6 text-center">
              <p className="max-w-sm text-sm text-muted-foreground">{emptyText}</p>
            </div>
          ) : (
            <>
              <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{selected.unit}</p>
              <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} interval={0} padding={{ left: 16, right: 20 }} />
                  <YAxis
                    width={56}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={!selected.integer}
                    tickFormatter={(value: number) => selected.formatTick(value)}
                  />
                  <ChartTooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    content={({ active, payload, label }) => {
                      const value = payload?.[0]?.value;
                      if (!active || typeof value !== "number") return null;
                      return (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <p className="font-semibold text-foreground">{label}</p>
                          <p className="text-muted-foreground tabular-nums">{selected.formatValue(value)}</p>
                        </div>
                      );
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-value)"
                    strokeWidth={2.5}
                    dot={{ r: 3, strokeWidth: 0, fill: "var(--color-value)" }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--color-card)" }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { usePlan } from "@/hooks/use-plan";
import { DIAGNOSTIC_STEPS, OBJECTIVE_QUESTIONS, diagnosticsCsv, distribution, isVisible, listDiagnostics, type DiagnosticRow } from "@/lib/teacher-diagnostic";

export const ADMIN_DIAGNOSTICS_QUERY_KEY = ["admin-teacher-diagnostics"] as const;

/**
 * Diagnósticos (super_admin only): totals, list, individual answers, simple distributions of the
 * objective questions, most selected difficulties and CSV export. Data comes only from the
 * super_admin RPC list_teacher_diagnostics (teachers cannot call it).
 */
export function AdminDiagnostics() {
  const { t, lang } = useLanguage();
  const { isSuperAdmin } = usePlan();
  const query = useQuery({ queryKey: ADMIN_DIAGNOSTICS_QUERY_KEY, queryFn: listDiagnostics, enabled: isSuperAdmin, staleTime: 0 });
  const [viewing, setViewing] = useState<DiagnosticRow | null>(null);
  const rows = query.data ?? [];
  const completed = rows.filter((row) => row.status === "completed").length;
  const label = (key: string) => t(`diagnostic.admin.${key}`);
  const option = (questionId: string, value: string) => t(`diagnostic.q.${questionId}.options.${value}`);
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === "en" ? "en" : "pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "—");
  const pains = useMemo(() => {
    const question = OBJECTIVE_QUESTIONS.find((q) => q.id === "pain_points")!;
    return distribution(rows, question).items.filter((item) => item.count > 0).sort((a, b) => b.count - a.count);
  }, [rows]);

  if (!isSuperAdmin) return null;

  const exportCsv = () => {
    const csv = diagnosticsCsv(rows, (key) => key.startsWith("q.") ? t(`diagnostic.${key}.label`) : key.startsWith("statusValue.") ? label(key) : label(key === "completed" ? "completed_at" : key), option);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diagnosticos-bloom-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const answerText = (row: DiagnosticRow, id: string) => {
    const value = row.answers[id];
    if (Array.isArray(value)) return value.length ? value.map((v) => option(id, v)).join(", ") : label("notAnswered");
    if (value === undefined || value === "") return label("notAnswered");
    const question = OBJECTIVE_QUESTIONS.find((q) => q.id === id);
    return question?.type === "single" ? option(id, String(value)) : String(value);
  };

  return (
    <section className="space-y-5 border-t border-border pt-6" data-testid="admin-diagnostics">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{label("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{label("subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} data-testid="diagnostics-export"><Download aria-hidden />{label("export")}</Button>
      </div>
      {query.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden /> : query.isError ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{label("loadError")}</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>{label("retry")}</Button>
        </div>
      ) : rows.length === 0 ? <p className="text-sm text-muted-foreground">{label("empty")}</p> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label("completed")}</p><p className="font-display text-2xl font-bold" data-testid="diagnostics-completed">{completed}</p></div>
            <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">{label("inProgress")}</p><p className="font-display text-2xl font-bold" data-testid="diagnostics-in-progress">{rows.length - completed}</p></div>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border" data-testid="diagnostics-list">
            {rows.map((row) => (
              <li key={row.teacher_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.full_name?.trim() || label("unnamed")}</p>
                  <p className="text-xs text-muted-foreground">{row.status === "completed" ? `${label("completed_at")}: ${date(row.completed_at)}` : `${label("stepOf").replace("{step}", String(row.current_step))} · ${date(row.updated_at)}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={row.status === "completed" ? "default" : "secondary"}>{label(`statusValue.${row.status}`)}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setViewing(row)}><Eye aria-hidden />{label("view")}</Button>
                </div>
              </li>
            ))}
          </ul>
          {pains.length > 0 && (
            <div className="space-y-2 rounded-xl border border-border bg-card p-4" data-testid="diagnostics-top-pains">
              <h3 className="text-sm font-semibold">{label("topPains")}</h3>
              <ol className="space-y-1.5">
                {pains.slice(0, 5).map((item) => (
                  <li key={item.option} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate">{option("pain_points", item.option)}</span><span className="tabular-nums text-muted-foreground">{item.count}</span></li>
                ))}
              </ol>
            </div>
          )}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">{label("charts")}</h3>
            <p className="text-xs text-muted-foreground">{label("basedOn").replace("{count}", String(completed))}</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {OBJECTIVE_QUESTIONS.map((question) => {
                const data = distribution(rows, question);
                const max = Math.max(1, ...data.items.map((item) => item.count));
                return (
                  <figure key={question.id} className="space-y-2 rounded-xl border border-border bg-card p-4" data-testid={`chart-${question.id}`}>
                    <figcaption className="text-sm font-medium">{t(`diagnostic.q.${question.id}.label`)}</figcaption>
                    <ul className="space-y-1">
                      {data.items.map((item) => (
                        <li key={item.option} className="grid grid-cols-[minmax(0,8rem)_1fr_2rem] items-center gap-2 text-xs">
                          <span className="truncate" title={question.type === "scale" ? item.option : option(question.id, item.option)}>{question.type === "scale" ? item.option : option(question.id, item.option)}</span>
                          <span className="h-2 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(item.count / max) * 100}%` }} /></span>
                          <span className="text-right tabular-nums text-muted-foreground">{item.count}</span>
                        </li>
                      ))}
                    </ul>
                  </figure>
                );
              })}
            </div>
          </div>
        </>
      )}
      <Dialog open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{viewing?.full_name?.trim() || label("unnamed")}</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-5 text-sm" data-testid="diagnostic-answers">
              <p className="text-xs text-muted-foreground">{label("consent")}: {date(viewing.consent_accepted_at)} · {label("started")}: {date(viewing.started_at)} · {label("completed_at")}: {date(viewing.completed_at)}</p>
              {DIAGNOSTIC_STEPS.map((step) => (
                <section key={step.key} className="space-y-2">
                  <h3 className="font-semibold">{t(`diagnostic.steps.${step.key}`)}</h3>
                  <dl className="space-y-2">
                    {step.questions.filter((q) => isVisible(q, viewing.answers)).map((q) => (
                      <div key={q.id}>
                        <dt className="text-muted-foreground">{t(`diagnostic.q.${q.id}.label`)}</dt>
                        <dd className="whitespace-pre-line break-words font-medium">{answerText(viewing, q.id)}{q.type === "multi" && Array.isArray(viewing.answers[q.id]) && (viewing.answers[q.id] as string[]).includes("other") && viewing.answers[q.otherKey] ? ` (${String(viewing.answers[q.otherKey])})` : ""}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

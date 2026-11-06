import { useCallback, useEffect, useState } from "react";
import { Clock, FileText, Mail, MessageSquare, Phone, Plus, Users, Workflow, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import type { AutomationActivity } from "@/lib/automation-engine";
import {
  fetchLeadAutomationActivity,
  fetchLeadInteractions,
  mergeLeadTimeline,
  type LeadInteraction,
} from "@/lib/lead-interactions";

const TYPE_ICONS: Record<string, LucideIcon> = {
  whatsapp: MessageSquare, call: Phone, email: Mail, meeting: Users, note: FileText, other: Clock,
};

interface Props {
  teacherId?: string;
  leadId: string;
  /** Bumped by the parent after an interaction is saved. */
  refreshKey: number;
  onAddInteraction: () => void;
}

type Source<T> = { data: T[]; error: boolean; loading: boolean };

export function LeadHistoryPanel({ teacherId, leadId, refreshKey, onAddInteraction }: Props) {
  const { t, lang } = useLanguage();
  const L = (k: string) => t(`leadInteractions.${k}`);
  const [manual, setManual] = useState<Source<LeadInteraction>>({ data: [], error: false, loading: true });
  const [auto, setAuto] = useState<Source<AutomationActivity>>({ data: [], error: false, loading: true });

  const loadManual = useCallback(async () => {
    if (!teacherId) return;
    setManual((s) => ({ ...s, loading: true }));
    try { setManual({ data: await fetchLeadInteractions(teacherId, leadId), error: false, loading: false }); }
    catch (e) { console.error("[Leads] history manual:", e); setManual((s) => ({ ...s, error: true, loading: false })); }
  }, [teacherId, leadId]);

  const loadAuto = useCallback(async () => {
    if (!teacherId) return;
    setAuto((s) => ({ ...s, loading: true }));
    try { setAuto({ data: await fetchLeadAutomationActivity(teacherId, leadId), error: false, loading: false }); }
    catch (e) { console.error("[Leads] history automatic:", e); setAuto((s) => ({ ...s, error: true, loading: false })); }
  }, [teacherId, leadId]);

  useEffect(() => { loadManual(); }, [loadManual, refreshKey]);
  useEffect(() => { loadAuto(); }, [loadAuto, refreshKey]);

  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const fmt = (v: string) => new Date(v).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const timeline = mergeLeadTimeline(manual.error ? [] : manual.data, auto.error ? [] : auto.data);
  const loading = manual.loading || auto.loading;

  const ErrorRow = ({ msg, retry }: { msg: string; retry: () => void }) => (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
      <span>{msg}</span>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={retry}>{L("retry")}</Button>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="gap-2" onClick={onAddInteraction}>
          <Plus className="w-3.5 h-3.5" /> {L("new")}
        </Button>
      </div>
      {manual.error && <ErrorRow msg={L("manualError")} retry={loadManual} />}
      {auto.error && <ErrorRow msg={L("autoError")} retry={loadAuto} />}
      {loading && timeline.length === 0 ? (
        <p className="text-xs text-muted-foreground">{L("loading")}</p>
      ) : timeline.length === 0 && !manual.error && !auto.error ? (
        <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4 text-center">{L("empty")}</p>
      ) : (
        <ol className="space-y-2">
          {timeline.map((e) => {
            const Icon = e.kind === "manual" ? TYPE_ICONS[e.type] ?? Clock : Workflow;
            return (
              <li key={e.id} className="rounded-lg border border-border p-3 text-xs space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {e.kind === "manual" ? (TYPE_ICONS[e.type] ? L(`types.${e.type}`) : e.type) : e.kind === "confirmation" ? t("leadStageConfirmation.historyLabel") : L("automatic")}
                  </span>
                  <Badge variant={e.kind !== "automatic" ? "secondary" : "outline"} className="text-[10px]">
                    {e.kind !== "automatic" ? L("manual") : L("automatic")}
                  </Badge>
                  <span className="ml-auto text-muted-foreground">{fmt(e.at)}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{e.description}</p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

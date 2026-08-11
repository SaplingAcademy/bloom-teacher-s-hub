import { useState, useEffect } from "react";
import { AttentionItem, fetchAttentionQueue } from "@/lib/attention-queue";
import { retryFailedAutomation } from "@/lib/automation-engine";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock,
  Calendar,
  FileText,
  Flame,
  UserX,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface AttentionQueueWidgetProps {
  teacherId?: string;
  onNavigateToLead?: (leadId: string) => void;
  maxItems?: number;
  className?: string;
}

export function AttentionQueueWidget({
  teacherId,
  onNavigateToLead,
  maxItems = 6,
  className = "",
}: AttentionQueueWidgetProps) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const loadQueue = async () => {
    if (!teacherId) return;
    setLoading(true);
    const queue = await fetchAttentionQueue(teacherId);
    setItems(queue);
    setLoading(false);
  };

  useEffect(() => {
    loadQueue();
  }, [teacherId]);

  const handleDismissTask = async (taskId?: string, itemId?: string) => {
    if (taskId) {
      const { error } = await supabase
        .from("tasks")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", taskId);

      if (error) {
        toast.error("Erro ao concluir tarefa");
        return;
      }
      toast.success("Tarefa concluída!");
    }
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  const handleRetry = async (eventId?: string, itemId?: string) => {
    if (!eventId) return;
    setRetryingId(eventId);
    const res = await retryFailedAutomation(eventId);
    setRetryingId(null);
    if (res.success) {
      toast.success("Automação executada novamente com sucesso!");
      loadQueue();
    } else {
      toast.error(`Falha ao reprocessar: ${res.error}`);
    }
  };

  const getCategoryIcon = (category: AttentionItem["category"]) => {
    switch (category) {
      case "overdue_followup":
        return <Clock className="w-4 h-4 text-amber-500" />;
      case "trial_soon":
        return <Calendar className="w-4 h-4 text-emerald-500" />;
      case "pending_proposal":
        return <FileText className="w-4 h-4 text-blue-500" />;
      case "hot_no_action":
        return <Flame className="w-4 h-4 text-orange-500" />;
      case "inactive_lead":
        return <UserX className="w-4 h-4 text-rose-400" />;
      case "failed_automation":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "package_renewal":
        return <RefreshCw className="w-4 h-4 text-amber-600" />;
      default:
        return <Sparkles className="w-4 h-4 text-purple-500" />;
    }
  };

  const displayedItems = items.slice(0, maxItems);

  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base text-card-foreground flex items-center gap-2">
              Precisa de atenção
              {items.length > 0 && (
                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-none font-bold">
                  {items.length}
                </Badge>
              )}
            </h3>
            <p className="text-xs text-muted-foreground">
              Ações pendentes e automações que exigem acompanhamento do professor
            </p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={loadQueue} disabled={loading} className="h-8 gap-1 text-xs">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Carregando fila de atenção...
        </div>
      ) : displayedItems.length === 0 ? (
        <div className="py-8 text-center rounded-lg border border-dashed border-border bg-muted/20">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
          <p className="font-medium text-sm text-card-foreground">Tudo em dia!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Nenhum lead pendente ou automação com falha no momento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedItems.map((item) => (
            <div
              key={item.id}
              className="group flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border border-border bg-background hover:border-primary/40 transition-all gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 p-1.5 rounded-md bg-muted/60 flex-shrink-0">
                  {getCategoryIcon(item.category)}
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-card-foreground">{item.title}</span>
                    <Badge
                      variant="outline"
                      className={
                        item.urgency === "high"
                          ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 text-[10px]"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]"
                      }
                    >
                      {item.urgency === "high" ? "Urgente" : "Pendente"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                  <p className="text-xs font-medium text-primary flex items-center gap-1">
                    💡 {item.recommendedAction}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0">
                {item.category === "failed_automation" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    disabled={retryingId === item.automationEventId}
                    onClick={() => handleRetry(item.automationEventId, item.id)}
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${retryingId === item.automationEventId ? "animate-spin" : ""}`} />
                    Tentar novamente
                  </Button>
                ) : item.category === "package_renewal" ? (
                  <a
                    href={item.targetUrl}
                    className="inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-amber-600 hover:bg-amber-700 text-white shadow-sm h-8 px-3 text-xs gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Renovar pacote
                  </a>
                ) : (
                  <>
                    {item.taskId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                        onClick={() => handleDismissTask(item.taskId, item.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Concluir
                      </Button>
                    )}

                    {item.leadId && onNavigateToLead && (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs gap-1"
                        onClick={() => onNavigateToLead(item.leadId!)}
                      >
                        Abrir lead <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

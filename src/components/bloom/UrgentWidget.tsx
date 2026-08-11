import React, { useState, useEffect } from "react";
import { fetchAttentionQueue, AttentionItem } from "@/lib/attention-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { ShieldAlert, CheckCircle2, AlertTriangle, ArrowUpRight, RefreshCw } from "lucide-react";

interface UrgentWidgetProps {
  teacherId: string;
}

export function UrgentWidget({ teacherId }: UrgentWidgetProps) {
  const navigate = useNavigate();
  const [urgentItems, setUrgentItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUrgentItems = async () => {
    if (!teacherId) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const items = await fetchAttentionQueue(teacherId);
      // Filter high-urgency items
      const highUrgent = items.filter((item) => item.urgency === "high");
      setUrgentItems(highUrgent);
    } catch (e) {
      console.warn("[UrgentWidget] Failed to load urgent items:", e);
      setUrgentItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUrgentItems();
  }, [teacherId]);

  const handleAction = (targetUrl: string) => {
    if (targetUrl) {
      navigate({ to: targetUrl as any });
    }
  };

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-card p-5 sm:p-6 shadow-sm select-none transition-all">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-outfit text-lg font-extrabold text-foreground tracking-tight">
                Urgente
              </h2>
              <Badge
                variant="outline"
                className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                  urgentItems.length > 0
                    ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
                    : "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800 dark:text-stone-300"
                }`}
              >
                {urgentItems.length} {urgentItems.length === 1 ? "item" : "itens"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Exceções e problemas que exigem intervenção imediata.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={loadUrgentItems}
          disabled={loading}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          title="Atualizar urgências"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Content area */}
      <div className="mt-4">
        {urgentItems.length === 0 ? (
          /* Compact Empty State (Requirement 11) */
          <div className="py-4 px-5 rounded-xl border border-dashed border-stone-200/80 bg-stone-50/50 dark:bg-stone-900/20 dark:border-stone-800 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-foreground">
                Tudo tranquilo por aqui.
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                Nenhuma situação urgente no momento.
              </p>
            </div>
          </div>
        ) : (
          /* Urgent Items List */
          <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
            {urgentItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-900/50 hover:border-rose-300 transition-all text-xs"
              >
                <div className="flex items-start gap-3 min-w-0 pr-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="font-bold text-rose-950 dark:text-rose-200 truncate block text-xs">
                      {item.title}
                    </span>
                    <span className="text-[11px] text-rose-800/80 dark:text-rose-300/80 block truncate">
                      {item.reason}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleAction(item.targetUrl)}
                  className="h-8 px-3 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white shrink-0 gap-1 cursor-pointer"
                >
                  <span>Resolver</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

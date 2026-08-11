import { supabase } from "@/lib/supabase";
import { formatDateString } from "@/lib/calendar-sync";

export type AttentionCategory =
  | "overdue_followup"
  | "trial_soon"
  | "pending_proposal"
  | "hot_no_action"
  | "inactive_lead"
  | "failed_automation"
  | "incomplete_conversion"
  | "package_renewal";

export interface AttentionItem {
  id: string;
  category: AttentionCategory;
  title: string;
  reason: string;
  recommendedAction: string;
  leadId?: string;
  studentId?: string;
  taskId?: string;
  automationEventId?: string;
  dueDate?: string;
  urgency: "high" | "medium" | "low";
  targetUrl: string;
}

/**
 * Fetch unified Attention Queue ("Precisa de Atenção") items for a teacher
 */
export async function fetchAttentionQueue(teacherId: string): Promise<AttentionItem[]> {
  if (!teacherId) return [];

  const items: AttentionItem[] = [];
  const now = new Date();
  const todayStr = formatDateString(now);
  const nowIso = now.toISOString();

  try {
    // 0. Package expiration alerts (30-day monitoring)
    try {
      const { checkPackageExpirationAlerts } = await import("@/lib/finance-engine");
      const renewalAlerts = await checkPackageExpirationAlerts(teacherId);
      renewalAlerts.forEach((alert) => {
        items.push({
          id: `renewal-alert-${alert.studentId}`,
          category: "package_renewal",
          title: `Renovação necessária: ${alert.studentName}`,
          reason: alert.alertMessage,
          recommendedAction: "Clique em Renovar Pacote para abrir o fluxo de renovação",
          studentId: alert.studentId,
          dueDate: alert.endDate,
          urgency: alert.alertLevel === "expired" || alert.alertLevel === "warning" ? "high" : "medium",
          targetUrl: `/finance?studentId=${alert.studentId}&action=renew`,
        });
      });
    } catch (renErr) {
      console.warn("[attention-queue] Note on package renewal queue check:", renErr);
    }

    // 1. Overdue lead follow-ups & pending tasks
    const { data: overdueTasks } = await supabase
      .from("tasks")
      .select("id, title, due_date, description, lead_id, student_id")
      .eq("teacher_id", teacherId)
      .eq("status", "pending")
      .lt("due_date", nowIso)
      .order("due_date", { ascending: true })
      .limit(10);

    if (overdueTasks) {
      for (const t of overdueTasks) {
        items.push({
          id: `overdue-task-${t.id}`,
          category: "overdue_followup",
          title: t.title,
          reason: `Tarefa em atraso (Vencimento: ${new Date(t.due_date).toLocaleDateString("pt-BR")})`,
          recommendedAction: "Concluir tarefa ou reagendar contato",
          leadId: t.lead_id || undefined,
          studentId: t.student_id || undefined,
          taskId: t.id,
          dueDate: t.due_date,
          urgency: "high",
          targetUrl: t.lead_id ? `/leads?leadId=${t.lead_id}` : "/tasks",
        });
      }
    }

    // 2. Upcoming trial lessons (today and next 48 hours)
    const next48hDate = new Date();
    next48hDate.setDate(next48hDate.getDate() + 2);
    const next48hStr = formatDateString(next48hDate);

    const { data: trialEvents } = await supabase
      .from("calendar_events")
      .select("id, student_name, date, start_time, lead_id")
      .eq("teacher_id", teacherId)
      .eq("status", "Scheduled")
      .gte("date", todayStr)
      .lte("date", next48hStr)
      .ilike("notes", "%experimental%")
      .limit(5);

    if (trialEvents) {
      for (const evt of trialEvents) {
        items.push({
          id: `trial-event-${evt.id}`,
          category: "trial_soon",
          title: `Aula experimental com ${evt.student_name || "Lead"}`,
          reason: `Agendada para ${evt.date} às ${evt.start_time?.substring(0, 5)}`,
          recommendedAction: "Enviar confirmação e material preparatório",
          leadId: evt.lead_id || undefined,
          dueDate: `${evt.date}T${evt.start_time}`,
          urgency: "high",
          targetUrl: "/calendar",
        });
      }
    }

    // 3. Proposals awaiting response (leads in "Proposta enviada")
    const { data: proposalLeads } = await supabase
      .from("leads")
      .select("id, full_name, potential_value, updated_at")
      .eq("teacher_id", teacherId)
      .in("stage", ["Proposta enviada", "proposal"])
      .limit(5);

    if (proposalLeads) {
      for (const l of proposalLeads) {
        const valText = l.potential_value ? ` (R$ ${Number(l.potential_value).toFixed(2)})` : "";
        items.push({
          id: `proposal-lead-${l.id}`,
          category: "pending_proposal",
          title: `Proposta pendente: ${l.full_name}${valText}`,
          reason: "Lead aguardando resposta sobre a proposta enviada",
          recommendedAction: "Fazer follow-up da proposta enviada",
          leadId: l.id,
          dueDate: l.updated_at,
          urgency: "medium",
          targetUrl: `/leads?leadId=${l.id}`,
        });
      }
    }

    // 4. Hot leads with no next action (in "Em conversa" without future pending tasks)
    const { data: hotLeads } = await supabase
      .from("leads")
      .select("id, full_name, stage, updated_at")
      .eq("teacher_id", teacherId)
      .in("stage", ["Em conversa", "contacted"])
      .limit(5);

    if (hotLeads) {
      for (const l of hotLeads) {
        const { data: leadTasks } = await supabase
          .from("tasks")
          .select("id")
          .eq("lead_id", l.id)
          .eq("status", "pending");

        if (!leadTasks || leadTasks.length === 0) {
          items.push({
            id: `hot-no-action-${l.id}`,
            category: "hot_no_action",
            title: `Lead ativo sem próxima ação: ${l.full_name}`,
            reason: "Lead em conversa sem nenhuma tarefa de acompanhamento agendada",
            recommendedAction: "Agendar próxima ação ou enviar mensagem",
            leadId: l.id,
            urgency: "high",
            targetUrl: `/leads?leadId=${l.id}`,
          });
        }
      }
    }

    // 5. Inactive leads (no activity for 7+ days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: inactiveLeads } = await supabase
      .from("leads")
      .select("id, full_name, last_interaction_at, updated_at")
      .eq("teacher_id", teacherId)
      .not("stage", "in", '("Convertido","won","Perdido","lost")')
      .lt("updated_at", sevenDaysAgo.toISOString())
      .limit(5);

    if (inactiveLeads) {
      for (const l of inactiveLeads) {
        items.push({
          id: `inactive-lead-${l.id}`,
          category: "inactive_lead",
          title: `Lead inativo: ${l.full_name}`,
          reason: "Sem nenhuma interação há mais de 7 dias",
          recommendedAction: "Retomar contato com convite para aula experimental",
          leadId: l.id,
          urgency: "medium",
          targetUrl: `/leads?leadId=${l.id}`,
        });
      }
    }

    // 6. Failed automations requiring retry
    const { data: failedEvents } = await supabase
      .from("automation_events")
      .select("id, event_type, source_id, error_message, created_at")
      .eq("teacher_id", teacherId)
      .eq("status", "failed")
      .limit(5);

    if (failedEvents) {
      for (const e of failedEvents) {
        items.push({
          id: `failed-event-${e.id}`,
          category: "failed_automation",
          title: `Falha de automação: ${e.event_type}`,
          reason: e.error_message || "Erro durante o processamento automático",
          recommendedAction: "Tentar novamente o processamento",
          automationEventId: e.id,
          dueDate: e.created_at,
          urgency: "high",
          targetUrl: "/settings",
        });
      }
    }

    return items;
  } catch (err) {
    console.error("[attention-queue] Error compiling attention queue:", err);
    return items;
  }
}

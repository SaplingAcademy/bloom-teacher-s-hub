import type { AttentionItem } from "./attention-queue";
import type { DailyPriorityItem } from "./daily-priorities";
import type { PriorityModuleAction } from "@/components/bloom/PriorityModuleActions";

/**
 * How each real Urgent item is resolved, reusing the existing flows (no second resolution logic):
 * - attendance: the inline attendance panel of Today's priorities (records statuses, with confirm);
 * - renewal: the existing renewal modal; lead tasks / hot leads: the existing lead sheet;
 * - task without a lead: complete it here after confirmation (its old link pointed to a missing route);
 * - failed automation: retry here with the existing retryFailedAutomation;
 * - trial soon: a notice with no completion state: open the lesson in the Agenda.
 */
export type UrgentResolution =
  | { type: "attendance"; item: DailyPriorityItem }
  | { type: "module"; action: PriorityModuleAction }
  | { type: "complete_task"; taskId: string }
  | { type: "retry"; automationEventId: string }
  | { type: "navigate"; url: string };

export function urgentResolution(item: AttentionItem): UrgentResolution {
  if (item.category === "attendance_pending" && item.eventId && item.studentId) {
    const adapted: DailyPriorityItem = {
      id: item.id, category: "attendance", urgency: "critical", reason: "attendance_missing", title: item.title,
      params: {}, date: item.dueDate ?? null,
      ref: { eventId: item.eventId, studentId: item.studentId, ...(item.classId ? { classId: item.classId } : {}) },
      action: { route: item.targetUrl },
    };
    return { type: "attendance", item: adapted };
  }
  if (item.category === "package_renewal" && item.studentId) {
    return { type: "module", action: { kind: "contract", studentId: item.studentId, studentName: item.studentName ?? item.title } };
  }
  if ((item.category === "overdue_followup" || item.category === "hot_no_action") && item.leadId) {
    return { type: "module", action: { kind: "lead", leadId: item.leadId } };
  }
  if (item.category === "overdue_followup" && item.taskId) return { type: "complete_task", taskId: item.taskId };
  if (item.category === "failed_automation" && item.automationEventId) return { type: "retry", automationEventId: item.automationEventId };
  return { type: "navigate", url: item.targetUrl };
}

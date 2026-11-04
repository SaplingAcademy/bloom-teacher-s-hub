import { supabase } from "@/lib/supabase";
import { CLOSED_INACTIVITY_STAGES, inactivityPeriodDays, isInactiveLead, type InactivityLead } from "@/lib/lead-inactivity";

export interface InactivitySettings {
  id: string;
  teacher_id: string;
  inactivity_period_days: number;
  auto_task_creation_enabled: boolean;
  updated_at: string;
}

/** Read-only and fail-closed; unlike settings provisioning, never inserts defaults. */
export async function readInactivitySettings(teacherId: string): Promise<InactivitySettings> {
  const { data, error } = await supabase.from("automation_settings")
    .select("id, teacher_id, inactivity_period_days, auto_task_creation_enabled, updated_at")
    .eq("teacher_id", teacherId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.id || data.teacher_id !== teacherId || typeof data.auto_task_creation_enabled !== "boolean") {
    throw new Error("Automation inactivity settings unavailable");
  }
  inactivityPeriodDays(data.inactivity_period_days);
  return data as InactivitySettings;
}

export async function readInactiveLeads(teacherId: string, days: number, now: Date): Promise<InactivityLead[]> {
  const threshold = new Date(now.getTime() - inactivityPeriodDays(days) * 86_400_000).toISOString();
  const rows: InactivityLead[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("leads")
      .select("id, teacher_id, full_name, stage, last_interaction_at, created_at")
      .eq("teacher_id", teacherId)
      .not("stage", "in", `(${CLOSED_INACTIVITY_STAGES.map((s) => `"${s}"`).join(",")})`)
      .or(`last_interaction_at.lte.${threshold},and(last_interaction_at.is.null,created_at.lte.${threshold})`)
      .order("created_at", { ascending: true }).order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = (data || []) as InactivityLead[];
    rows.push(...page.filter((lead) => lead.teacher_id === teacherId && isInactiveLead(lead, days, now)));
    if (page.length < pageSize) break;
  }
  return rows;
}

export async function fetchInactiveLeadCandidates(teacherId: string, now: Date) {
  const settings = await readInactivitySettings(teacherId);
  const leads = await readInactiveLeads(teacherId, settings.inactivity_period_days, now);
  return { settings, leads };
}
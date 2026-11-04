import { supabase } from "@/lib/supabase";
import { readInactivitySettings, readInactiveLeads, type InactivitySettings } from "@/lib/lead-inactivity-data";
import { canCreateInactivityTask, inactivityCycleKey, inactivityReference, type InactivityLead } from "@/lib/lead-inactivity";

export interface InactivityCheckResult { processedCount: number; error?: string }
const checks = new Map<string, { at: number; promise: Promise<InactivityCheckResult> }>();

/** Load/refresh boundary only; dedupes simultaneous queue loads and throttles remounts. */
export function runInactiveLeadCheckOnLoad(teacherId: string): Promise<InactivityCheckResult> {
  const prior = checks.get(teacherId);
  if (prior && Date.now() - prior.at < 60_000) return prior.promise;
  const promise = processInactiveLeadCheck(teacherId);
  checks.set(teacherId, { at: Date.now(), promise });
  void promise.then((result) => {
    if (result.error) {
      checks.delete(teacherId);
      console.warn("[lead-inactivity] Check failed:", result.error);
    }
  });
  return promise;
}

/** Persist activation in the existing event ledger, not browser storage/settings/schema. */
async function activationTime(settings: InactivitySettings): Promise<string> {
  if (!settings.updated_at || !Number.isFinite(new Date(settings.updated_at).getTime())) {
    throw new Error("Inactivity settings activation unavailable");
  }
  const key = `inactivity-monitor:${settings.teacher_id}:${settings.id}:${settings.updated_at}`;
  const { error } = await supabase.from("automation_events").upsert({
    teacher_id: settings.teacher_id,
    event_type: "lead.inactivity_monitor",
    source_table: "automation_settings",
    source_id: settings.id,
    idempotency_key: key,
    status: "completed",
    payload: { inactivity_days: settings.inactivity_period_days },
  }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  const result = await supabase.from("automation_events").select("created_at")
    .eq("teacher_id", settings.teacher_id).eq("idempotency_key", key).single();
  if (result.error) throw new Error(result.error.message);
  if (!result.data?.created_at || !Number.isFinite(new Date(result.data.created_at).getTime())) {
    throw new Error("Inactivity activation event unavailable");
  }
  return result.data.created_at;
}

/** Atomic event ownership prevents parallel tabs from both inserting a cycle's task. */
async function claimCycle(lead: InactivityLead, key: string, days: number) {
  const payload = { inactivity_days: days, last_activity: inactivityReference(lead)?.toISOString() };
  const { data, error } = await supabase.from("automation_events").upsert({
    teacher_id: lead.teacher_id, event_type: "lead.inactive", source_table: "leads",
    source_id: lead.id, idempotency_key: key, payload, status: "processing", processing_attempts: 1,
  }, { onConflict: "idempotency_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.id) return data.id as string;

  const existing = await supabase.from("automation_events").select("id, status, processing_attempts, updated_at")
    .eq("teacher_id", lead.teacher_id).eq("idempotency_key", key).single();
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data || existing.data.status !== "failed") return null;
  const retry = await supabase.from("automation_events").update({
    status: "processing", error_message: null, processing_attempts: (existing.data.processing_attempts || 0) + 1,
  }).eq("teacher_id", lead.teacher_id).eq("id", existing.data.id)
    .eq("status", "failed").eq("updated_at", existing.data.updated_at).select("id").maybeSingle();
  if (retry.error) throw new Error(retry.error.message);
  return retry.data?.id as string | undefined ?? null;
}

async function finishEvent(teacherId: string, eventId: string, status: "completed" | "failed", message?: string) {
  const { data, error } = await supabase.from("automation_events").update({
    status, error_message: message || null, processed_at: new Date().toISOString(),
  }).eq("teacher_id", teacherId).eq("id", eventId).select("id").single();
  if (error || !data) throw new Error(error?.message || "Inactivity event status not saved");
}

async function createCycleTask(lead: InactivityLead, eventId: string, days: number, now: Date) {
  // Read back on retry: an inserted or completed task must never be recreated.
  const existing = await supabase.from("tasks").select("id, status")
    .eq("teacher_id", lead.teacher_id).eq("lead_id", lead.id)
    .eq("automation_event_id", eventId).eq("activity_type", "follow_up").limit(1);
  if (existing.error) throw new Error(existing.error.message);
  if (!existing.data?.length) {
    const inserted = await supabase.from("tasks").insert({
      teacher_id: lead.teacher_id, lead_id: lead.id, automation_event_id: eventId,
      activity_type: "follow_up", status: "pending", due_date: now.toISOString(),
      title: `Retomar contato com ${lead.full_name} (Inativo há ${days} dias)`,
      description: "Lead sem interação comercial recente. Sugestão: enviar mensagem de acompanhamento.",
    }).select("id").single();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Inactivity task not saved");
  }

  const activity = await supabase.from("automation_activity").select("id")
    .eq("teacher_id", lead.teacher_id).eq("automation_event_id", eventId)
    .eq("action_type", "task_created").limit(1);
  if (activity.error) throw new Error(activity.error.message);
  if (!activity.data?.length) {
    const inserted = await supabase.from("automation_activity").insert({
      teacher_id: lead.teacher_id, automation_event_id: eventId, action_type: "task_created",
      target_table: "leads", target_id: lead.id,
      description: `Bloom criou um acompanhamento de inatividade para ${lead.full_name}.`,
    });
    if (inserted.error) throw new Error(inserted.error.message);
  }
  await finishEvent(lead.teacher_id, eventId, "completed");
}

/** Rule E runs only with verified session ownership and persisted settings. */
export async function processInactiveLeadCheck(teacherId: string, now: Date = new Date()): Promise<InactivityCheckResult> {
  let processedCount = 0;
  const errors: string[] = [];
  try {
    if (!teacherId) throw new Error("Missing teacherId");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth.user?.id !== teacherId) throw new Error("Inactivity check requires the owning teacher session");
    const settings = await readInactivitySettings(teacherId);
    if (!settings.auto_task_creation_enabled) return { processedCount: 0 };
    const activatedAt = await activationTime(settings);
    const leads = await readInactiveLeads(teacherId, settings.inactivity_period_days, now);
    for (const lead of leads) {
      if (!canCreateInactivityTask(lead, settings.inactivity_period_days, now, activatedAt)) continue;
      let eventId: string | null = null;
      try {
        // Honor a real future pending action (manual or automated), without touching it.
        const future = await supabase.from("tasks").select("id")
          .eq("teacher_id", teacherId).eq("lead_id", lead.id).eq("status", "pending")
          .gt("due_date", now.toISOString()).limit(1);
        if (future.error) throw new Error(future.error.message);
        if (future.data?.length) continue;
        const key = inactivityCycleKey(lead);
        if (!key) continue;
        eventId = await claimCycle(lead, key, settings.inactivity_period_days);
        if (!eventId) continue;
        // Fresh read before task creation: notes/profile changes do not change the key;
        // real contact or closing the lead cancels this stale cycle.
        const current = await supabase.from("leads")
          .select("id, teacher_id, full_name, stage, last_interaction_at, created_at")
          .eq("teacher_id", teacherId).eq("id", lead.id).single();
        if (current.error) throw new Error(current.error.message);
        const fresh = current.data as InactivityLead;
        const currentSettings = await readInactivitySettings(teacherId);
        if (!fresh || inactivityCycleKey(fresh) !== key ||
            !currentSettings.auto_task_creation_enabled || currentSettings.updated_at !== settings.updated_at ||
            !canCreateInactivityTask(fresh, settings.inactivity_period_days, now, activatedAt)) {
          await finishEvent(teacherId, eventId, "completed");
          continue;
        }
        await createCycleTask(fresh, eventId, settings.inactivity_period_days, now);
        processedCount++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(message);
        if (eventId) {
          try { await finishEvent(teacherId, eventId, "failed", message); }
          catch (statusError) { errors.push(statusError instanceof Error ? statusError.message : String(statusError)); }
        }
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }
  return { processedCount, ...(errors.length ? { error: errors.join("; ") } : {}) };
}
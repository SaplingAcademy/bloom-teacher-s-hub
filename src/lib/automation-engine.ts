import { supabase } from "@/lib/supabase";
import { formatTimeHHMMSS, calculateEndTime, formatDateString } from "@/lib/calendar-sync";
import { processInactiveLeadCheck } from "@/lib/inactive-lead-automation";
import { conversionOptionalText } from "@/lib/lead-conversion";
export { processInactiveLeadCheck } from "@/lib/inactive-lead-automation";

export interface AutomationSettings {
  id?: string;
  teacher_id: string;
  lead_followup_delay_days: number;
  proposal_followup_delay_days: number;
  trial_confirmation_lead_hours: number;
  inactivity_period_days: number;
  auto_stage_transitions_enabled: boolean;
  auto_task_creation_enabled: boolean;
}

export interface AutomationEvent {
  id: string;
  teacher_id: string;
  event_type: string;
  source_table: string;
  source_id: string;
  payload: Record<string, any>;
  status: "pending" | "processing" | "completed" | "failed" | "retrying";
  processing_attempts: number;
  processed_at?: string;
  error_message?: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationActivity {
  id: string;
  teacher_id: string;
  automation_event_id?: string;
  action_type: string;
  target_table?: string;
  target_id?: string;
  description: string;
  created_at: string;
}

export interface Lead {
  id: string;
  teacher_id: string;
  full_name: string;
  email?: string;
  phone?: string;
  source?: string;
  stage: string; // 'Novo contato', 'Em conversa', 'Aula experimental agendada', 'Proposta enviada', 'Convertido', 'Perdido' (or legacy 'new', 'contacted', 'trial', 'won', 'lost')
  notes?: string;
  converted_student_id?: string;
  language_studied?: string;
  level?: string;
  focus?: string;
  modality?: string;
  package_id?: string;
  potential_value?: number;
  preferred_schedule?: string;
  last_interaction_at?: string;
  trial_scheduled_at?: string;
  trial_calendar_event_id?: string;
  contacted_at?: string | null;
  campaign?: string | null;
  tags?: string[] | null;
  lost_reason?: string | null;
  converted_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_SETTINGS: Omit<AutomationSettings, "teacher_id"> = {
  lead_followup_delay_days: 1,
  proposal_followup_delay_days: 2,
  trial_confirmation_lead_hours: 24,
  inactivity_period_days: 7,
  auto_stage_transitions_enabled: true,
  auto_task_creation_enabled: true,
};

// Map legacy stages to clean Portuguese labels
export function normalizeLeadStage(stage?: string): string {
  if (!stage) return "Novo contato";
  const s = stage.trim().toLowerCase();
  if (s === "new" || s === "novo contato") return "Novo contato";
  if (s === "contacted" || s === "em conversa") return "Em conversa";
  if (s === "trial" || s === "aula experimental agendada") return "Aula experimental agendada";
  if (s === "proposal" || s === "proposta enviada") return "Proposta enviada";
  if (s === "won" || s === "convertido") return "Convertido";
  if (s === "lost" || s === "perdido") return "Perdido";
  return stage;
}

/**
 * Fetch or initialize teacher settings with sensible defaults
 */
export async function getOrCreateAutomationSettings(teacherId: string): Promise<AutomationSettings> {
  try {
    const { data, error } = await supabase
      .from("automation_settings")
      .select("*")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("[automation-engine] Error reading automation settings:", error);
    }

    if (data) {
      return data as AutomationSettings;
    }

    // Insert default settings
    const newSettings: AutomationSettings = {
      teacher_id: teacherId,
      ...DEFAULT_SETTINGS,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("automation_settings")
      .insert(newSettings)
      .select()
      .single();

    if (insertErr) {
      console.warn("[automation-engine] Could not insert default settings, returning fallback:", insertErr);
      return newSettings;
    }

    return inserted as AutomationSettings;
  } catch (err) {
    console.error("[automation-engine] Error in getOrCreateAutomationSettings:", err);
    return { teacher_id: teacherId, ...DEFAULT_SETTINGS };
  }
}

/**
 * Save updated automation settings
 */
export async function saveAutomationSettings(
  teacherId: string,
  settings: Partial<AutomationSettings>
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from("automation_settings")
      .upsert(
        {
          teacher_id: teacherId,
          ...settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "teacher_id" }
      );

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Helper to register an automation activity log idempotently
 */
export async function logAutomationActivity(
  teacherId: string,
  eventId: string | null,
  actionType: string,
  targetTable: string | null,
  targetId: string | null,
  description: string
) {
  try {
    await supabase.from("automation_activity").insert({
      teacher_id: teacherId,
      automation_event_id: eventId,
      action_type: actionType,
      target_table: targetTable,
      target_id: targetId,
      description,
    });
  } catch (err) {
    console.error("[automation-engine] Failed to log activity:", err);
  }
}

/**
 * Helper to record or update an automation event status
 */
export async function recordAutomationEvent(
  teacherId: string,
  eventType: string,
  sourceTable: string,
  sourceId: string,
  idempotencyKey: string,
  payload: Record<string, any>,
  status: "processing" | "completed" | "failed" = "completed",
  errorMessage?: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("automation_events")
      .upsert(
        {
          teacher_id: teacherId,
          event_type: eventType,
          source_table: sourceTable,
          source_id: sourceId,
          payload,
          status,
          processing_attempts: 1,
          processed_at: new Date().toISOString(),
          error_message: errorMessage || null,
          idempotency_key: idempotencyKey,
        },
        { onConflict: "idempotency_key" }
      )
      .select("id")
      .single();

    if (error) {
      console.warn("[automation-engine] Event upsert returned notice:", error.message);
      return null;
    }

    return data?.id || null;
  } catch (err) {
    console.error("[automation-engine] Failed to record event:", err);
    return null;
  }
}

import { planAutoTasks, resolveProposalCycle, type AutoTaskRow, type AutoTaskSpec, type ProposalEventRow } from "@/lib/automation-task-plan";

/** Event IDs of a given rule type for this lead (teacher-scoped). Throws on read failure. */
async function fetchRuleEventIds(teacherId: string, leadId: string, eventType: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("automation_events")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("source_id", leadId)
    .eq("event_type", eventType);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r: any) => r.id));
}

/** Applies planned automatic tasks; always links the real current event ID on insert. */
async function syncAutoTasks(
  lead: Lead,
  eventType: string,
  currentEventId: string,
  specs: AutoTaskSpec[],
  updatePending: boolean,
  currentEventOnly = false,
): Promise<string[]> {
  // currentEventOnly: tasks of earlier cycles (e.g. a previous proposal) never block a new cycle.
  const ruleIds = currentEventOnly ? new Set<string>() : await fetchRuleEventIds(lead.teacher_id, lead.id, eventType);
  ruleIds.add(currentEventId);
  const { data: rows, error } = await supabase
    .from("tasks")
    .select("id, status, automation_event_id, activity_type")
    .eq("teacher_id", lead.teacher_id)
    .eq("lead_id", lead.id)
    .not("automation_event_id", "is", null);
  if (error) throw new Error(error.message);
  const ids: string[] = [];
  for (const action of planAutoTasks((rows || []) as AutoTaskRow[], ruleIds, specs, updatePending)) {
    if (action.kind === "skip") { ids.push(action.taskId); continue; }
    if (action.kind === "update") {
      const { error: upErr } = await supabase
        .from("tasks")
        .update({ description: action.spec.description, due_date: action.spec.due_date, updated_at: new Date().toISOString() })
        .eq("id", action.taskId)
        .eq("teacher_id", lead.teacher_id)
        .neq("status", "completed");
      if (upErr) throw new Error(upErr.message);
      ids.push(action.taskId);
      continue;
    }
    const { data: created, error: insErr } = await supabase
      .from("tasks")
      .insert({
        teacher_id: lead.teacher_id,
        lead_id: lead.id,
        status: "pending",
        automation_event_id: currentEventId,
        ...action.spec,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    if (created) ids.push(created.id);
  }
  return ids;
}

/** Standard initial check: reads the event for this idempotency key. Throws on read failure. */
async function readAutomationEvent(teacherId: string, key: string): Promise<{ id: string; status: string; payload: any } | null> {
  const { data, error } = await supabase
    .from("automation_events")
    .select("id, status, payload")
    .eq("teacher_id", teacherId)
    .eq("idempotency_key", key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as any) ?? null;
}

/** Marks the event failed with its message so it never stays in processing and can be retried. */
async function failAutomationEvent(teacherId: string, eventType: string, leadId: string, key: string, payload: Record<string, any>, err: any) {
  const errMsg = err?.message || String(err);
  await recordAutomationEvent(teacherId, eventType, "leads", leadId, key, { ...payload, error: errMsg }, "failed", errMsg);
  return errMsg;
}

/** Records the event first (processing) so tasks can carry its real ID. */
async function beginAutomationEvent(
  teacherId: string, eventType: string, leadId: string, key: string, payload: Record<string, any>,
): Promise<string> {
  const id = await recordAutomationEvent(teacherId, eventType, "leads", leadId, key, payload, "processing");
  if (!id) throw new Error("automation_event_unavailable");
  return id;
}

/**
 * RULE A — NEW LEAD
 * Triggered on creation of a new lead.
 * Actions:
 * - Stage set to "Novo contato" if missing
 * - Create next-action task "Entrar em contato com {name}"
 * - Idempotency check prevents duplicate task creation
 * - Log activity timeline entry
 */
export async function processNewLeadAutomation(
  lead: Lead
): Promise<{ success: boolean; eventId?: string | null; error?: string }> {
  if (!lead || !lead.id || !lead.teacher_id) return { success: false, error: "Invalid lead" };

  const settings = await getOrCreateAutomationSettings(lead.teacher_id);
  const idempotencyKey = `lead-created:${lead.id}`;

  try {
    // 1. Check idempotency: Has this event already been processed cleanly?
    const existing = await readAutomationEvent(lead.teacher_id, idempotencyKey);
    if (existing && existing.status === "completed") {
      return { success: true, eventId: existing.id };
    }

    let createdTaskId: string | null = null;
    const currentStage = normalizeLeadStage(lead.stage);

    // 2. Stage defaults to "Novo contato" if not already set or legacy "new"
    if (settings.auto_stage_transitions_enabled && (!lead.stage || lead.stage === "new")) {
      await supabase
        .from("leads")
        .update({ stage: "Novo contato", updated_at: new Date().toISOString() })
        .eq("id", lead.id);
    }

    // 3. Create follow-up task if auto task creation enabled (linked to the real event)
    if (settings.auto_task_creation_enabled) {
      const delayDays = settings.lead_followup_delay_days || 1;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + delayDays);
      const taskTitle = `Entrar em contato com ${lead.full_name}`;

      // Legacy tasks created before event linkage (no automation_event_id) still count, never rewritten.
      const { data: legacy, error: legacyErr } = await supabase
        .from("tasks")
        .select("id")
        .eq("teacher_id", lead.teacher_id)
        .eq("lead_id", lead.id)
        .is("automation_event_id", null)
        .eq("title", taskTitle)
        .limit(1);
      if (legacyErr) throw new Error(legacyErr.message);

      if (legacy && legacy.length > 0) {
        createdTaskId = legacy[0].id;
      } else {
        const eventId = await beginAutomationEvent(lead.teacher_id, "lead.created", lead.id, idempotencyKey, { lead_name: lead.full_name });
        const ids = await syncAutoTasks(lead, "lead.created", eventId, [{
          activity_type: "follow_up",
          title: taskTitle,
          description: `Primeiro contato agendado via automação Bloom. Origem: ${lead.source || "não informada"}.`,
          due_date: dueDate.toISOString(),
        }], false);
        createdTaskId = ids[0] ?? null;
      }
    }

    // 4. Record event and activity timeline
    const eventId = await recordAutomationEvent(
      lead.teacher_id,
      "lead.created",
      "leads",
      lead.id,
      idempotencyKey,
      { lead_name: lead.full_name, task_id: createdTaskId }
    );

    await logAutomationActivity(
      lead.teacher_id,
      eventId,
      "task_created",
      "leads",
      lead.id,
      `Bloom criou a tarefa de primeiro contato para o lead ${lead.full_name}.`
    );

    return { success: true, eventId };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    await recordAutomationEvent(
      lead.teacher_id,
      "lead.created",
      "leads",
      lead.id,
      idempotencyKey,
      { error: errMsg },
      "failed",
      errMsg
    );
    return { success: false, error: errMsg };
  }
}

/**
 * RULE B — LEAD INTERACTION
 * Triggered when first interaction is registered.
 * Actions:
 * - Advances stage to "Em conversa" (preserves later stages/converted/lost)
 * - Timeline log
 */
export async function processLeadInteractionAutomation(
  lead: Lead
): Promise<{ success: boolean; eventId?: string | null; error?: string }> {
  if (!lead || !lead.id || !lead.teacher_id) return { success: false, error: "Invalid lead" };

  const settings = await getOrCreateAutomationSettings(lead.teacher_id);
  const idempotencyKey = `lead-interaction:${lead.id}`;

  try {
    const currentStage = normalizeLeadStage(lead.stage);

    // Do not move converted, lost, or later stages backwards
    if (
      currentStage === "Convertido" ||
      currentStage === "Perdido" ||
      currentStage === "Aula experimental agendada" ||
      currentStage === "Proposta enviada"
    ) {
      return { success: true };
    }

    // Update stage to "Em conversa" and record last_interaction_at
    if (settings.auto_stage_transitions_enabled && currentStage === "Novo contato") {
      await supabase
        .from("leads")
        .update({
          stage: "Em conversa",
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
    } else {
      await supabase
        .from("leads")
        .update({
          last_interaction_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead.id);
    }

    const eventId = await recordAutomationEvent(
      lead.teacher_id,
      "lead.interaction",
      "leads",
      lead.id,
      idempotencyKey,
      { previous_stage: currentStage, new_stage: "Em conversa" }
    );

    await logAutomationActivity(
      lead.teacher_id,
      eventId,
      "stage_updated",
      "leads",
      lead.id,
      `Bloom atualizou o lead ${lead.full_name} para 'Em conversa' após o registro de interação.`
    );

    return { success: true, eventId };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * RULE C — TRIAL LESSON SCHEDULED
 * Triggered when a trial lesson is scheduled.
 * Actions:
 * - Create calendar event linked to lead
 * - Stage -> "Aula experimental agendada"
 * - Create confirmation task and follow-up task
 * - Handles reschedule/cancel without duplication
 */
export async function processTrialLessonScheduledAutomation(
  lead: Lead,
  trialDate: string, // YYYY-MM-DD
  startTime: string, // HH:MM
  duration = 60
): Promise<{ success: boolean; eventId?: string | null; calendarEventId?: string; error?: string }> {
  if (!lead || !lead.id || !lead.teacher_id) return { success: false, error: "Invalid lead" };

  const settings = await getOrCreateAutomationSettings(lead.teacher_id);
  const trialTimestamp = `${trialDate}T${startTime}`;
  const idempotencyKey = `trial-scheduled:${lead.id}:${trialTimestamp}`;
  const basePayload = { trial_date: trialDate, trial_time: startTime };

  try {
    // Standard initial check: completed + still the lead's current trial → nothing to do.
    // Failed/processing events are reprocessed; task planning prevents duplicates.
    const existing = await readAutomationEvent(lead.teacher_id, idempotencyKey);
    if (
      existing && existing.status === "completed" &&
      lead.trial_calendar_event_id && existing.payload?.calendar_event_id === lead.trial_calendar_event_id &&
      lead.trial_scheduled_at && new Date(lead.trial_scheduled_at).getTime() === new Date(`${trialDate}T${formatTimeHHMMSS(startTime)}`).getTime()
    ) {
      return { success: true, eventId: existing.id, calendarEventId: lead.trial_calendar_event_id };
    }

    const formattedStart = formatTimeHHMMSS(startTime);
    const formattedEnd = calculateEndTime(startTime, duration);

    let eventIdToUse = lead.trial_calendar_event_id;

    // Check if calendar event already exists for this lead's trial
    if (eventIdToUse) {
      const { data: existingCal } = await supabase
        .from("calendar_events")
        .select("id")
        .eq("id", eventIdToUse)
        .maybeSingle();

      if (existingCal) {
        // Update existing calendar event (reschedule flow)
        await supabase
          .from("calendar_events")
          .update({
            date: trialDate,
            start_time: formattedStart,
            end_time: formattedEnd,
            duration,
            status: "Scheduled",
            notes: `Aula Experimental com ${lead.full_name} (Lead)`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", eventIdToUse);
      } else {
        eventIdToUse = undefined;
      }
    }

    if (!eventIdToUse) {
      // Create new linked calendar event
      const { data: newCal, error: calErr } = await supabase
        .from("calendar_events")
        .insert({
          teacher_id: lead.teacher_id,
          lead_id: lead.id,
          student_name: lead.full_name,
          level: lead.level || "A1",
          focus: lead.focus || "General English",
          date: trialDate,
          start_time: formattedStart,
          end_time: formattedEnd,
          duration,
          type: "Private",
          delivery_mode: (lead.modality as any) || "Online",
          status: "Scheduled",
          notes: `Aula Experimental com ${lead.full_name} (Lead)`,
        })
        .select("id")
        .single();

      if (calErr) {
        console.error("[automation-engine] Error creating trial calendar event:", calErr);
      } else if (newCal) {
        eventIdToUse = newCal.id;
      }
    }

    // Update lead record stage and trial info
    await supabase
      .from("leads")
      .update({
        stage: "Aula experimental agendada",
        trial_scheduled_at: new Date(`${trialDate}T${formattedStart}`).toISOString(),
        trial_calendar_event_id: eventIdToUse || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    // Confirmation + follow-up tasks: one of each per lead trial; reschedule updates pending ones.
    if (settings.auto_task_creation_enabled) {
      const confirmDueDate = new Date(`${trialDate}T09:00:00`);
      confirmDueDate.setDate(confirmDueDate.getDate() - 1);
      const evId = await beginAutomationEvent(lead.teacher_id, "lead.trial_scheduled", lead.id, idempotencyKey, {
        trial_date: trialDate, trial_time: startTime, calendar_event_id: eventIdToUse,
      });
      await syncAutoTasks(lead, "lead.trial_scheduled", evId, [
        {
          activity_type: "whatsapp",
          title: `Confirmar aula experimental com ${lead.full_name}`,
          description: `Enviar mensagem de confirmação para a aula agendada em ${trialDate} às ${startTime}.`,
          due_date: confirmDueDate.toISOString(),
        },
        {
          activity_type: "follow_up",
          title: `Dar feedback da aula experimental com ${lead.full_name}`,
          description: `Verificar se a aula experimental ocorreu e enviar proposta.`,
          due_date: new Date(`${trialDate}T18:00:00`).toISOString(),
        },
      ], true);
    }

    const eventId = await recordAutomationEvent(
      lead.teacher_id,
      "lead.trial_scheduled",
      "leads",
      lead.id,
      idempotencyKey,
      { trial_date: trialDate, trial_time: startTime, calendar_event_id: eventIdToUse }
    );

    await logAutomationActivity(
      lead.teacher_id,
      eventId,
      "calendar_created",
      "leads",
      lead.id,
      `Bloom agendou a aula experimental para ${lead.full_name} na Agenda e criou as tarefas de acompanhamento.`
    );

    return { success: true, eventId, calendarEventId: eventIdToUse };
  } catch (err: any) {
    const errMsg = await failAutomationEvent(lead.teacher_id, "lead.trial_scheduled", lead.id, idempotencyKey, basePayload, err);
    return { success: false, error: errMsg };
  }
}

/**
 * RULE D — PROPOSAL RECORDED
 * Triggered when a proposal/package offer is registered for a lead.
 * Actions:
 * - Update stage to "Proposta enviada"
 * - Calculate potential value
 * - Create follow-up task using configurable delay (default 2 days)
 */
export async function processProposalRecordedAutomation(
  lead: Lead,
  packageId?: string,
  potentialValue?: number
): Promise<{ success: boolean; eventId?: string | null; error?: string }> {
  if (!lead || !lead.id || !lead.teacher_id) return { success: false, error: "Invalid lead" };

  const settings = await getOrCreateAutomationSettings(lead.teacher_id);
  let idempotencyKey = "";
  const basePayload = { package_id: packageId };

  try {
    // Stable proposal cycle: same cycle while the latest proposal event is unfinished or
    // its follow-up is still pending (update); otherwise a new cycle number (new follow-up).
    const { data: events, error: evErr } = await supabase
      .from("automation_events")
      .select("id, status, idempotency_key")
      .eq("teacher_id", lead.teacher_id)
      .eq("source_id", lead.id)
      .eq("event_type", "lead.proposal_recorded");
    if (evErr) throw new Error(evErr.message);
    const { data: pend, error: pendErr } = await supabase
      .from("tasks")
      .select("automation_event_id")
      .eq("teacher_id", lead.teacher_id)
      .eq("lead_id", lead.id)
      .neq("status", "completed")
      .not("automation_event_id", "is", null);
    if (pendErr) throw new Error(pendErr.message);
    const cycle = resolveProposalCycle(
      lead.id,
      (events || []) as ProposalEventRow[],
      new Set((pend || []).map((t: any) => t.automation_event_id)),
    );
    idempotencyKey = cycle.key;

    let finalValue = potentialValue || lead.potential_value || 0;

    // Fetch package price if packageId provided and value not set
    if (packageId && !potentialValue) {
      const { data: pkg } = await supabase
        .from("packages")
        .select("price")
        .eq("id", packageId)
        .maybeSingle();

      if (pkg && pkg.price) {
        finalValue = pkg.price;
      }
    }

    // Update lead stage & potential value
    await supabase
      .from("leads")
      .update({
        stage: "Proposta enviada",
        package_id: packageId || lead.package_id || null,
        potential_value: finalValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    // Create follow-up task for proposal
    if (settings.auto_task_creation_enabled) {
      const delayDays = settings.proposal_followup_delay_days || 2;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + delayDays);

      const evId = await beginAutomationEvent(lead.teacher_id, "lead.proposal_recorded", lead.id, idempotencyKey, {
        package_id: packageId, potential_value: finalValue,
      });
      await syncAutoTasks(lead, "lead.proposal_recorded", evId, [{
        activity_type: "follow_up",
        title: `Acompanhar proposta com ${lead.full_name}`,
        description: `Verificar resposta referente à proposta enviada de R$ ${finalValue.toFixed(2)}.`,
        due_date: dueDate.toISOString(),
      }], true, true);
    }

    const eventId = await recordAutomationEvent(
      lead.teacher_id,
      "lead.proposal_recorded",
      "leads",
      lead.id,
      idempotencyKey,
      { package_id: packageId, potential_value: finalValue }
    );

    await logAutomationActivity(
      lead.teacher_id,
      eventId,
      "stage_updated",
      "leads",
      lead.id,
      `Bloom registrou a proposta enviada para ${lead.full_name} (R$ ${finalValue.toFixed(2)}) e criou a tarefa de acompanhamento.`
    );

    return { success: true, eventId };
  } catch (err: any) {
    if (!idempotencyKey) return { success: false, error: err.message || String(err) };
    const errMsg = await failAutomationEvent(lead.teacher_id, "lead.proposal_recorded", lead.id, idempotencyKey, basePayload, err);
    return { success: false, error: errMsg };
  }
}

/**
 * RULE F & G — LEAD CONVERTED TO STUDENT
 * Calls the secure Supabase RPC `convert_lead_to_student` for transactional execution.
 * Pre-fills student information from lead and creates student, package link, schedule, and 8-week calendar events.
 */
export async function convertLeadToStudentAutomation(params: {
  leadId: string;
  teacherId: string;
  fullName: string;
  email?: string;
  phone?: string;
  languageStudied?: string;
  level?: string;
  focus?: string;
  modality?: string;
  packageId?: string;
  notes?: string;
  scheduleText?: string;
  schedules?: Array<{ weekday: string; startTime: string; duration: number }>;
}): Promise<{ success: boolean; studentId?: string; error?: string }> {
  const {
    leadId,
    teacherId,
    fullName,
    email,
    phone,
    languageStudied,
    level,
    focus,
    modality,
    packageId,
    notes,
    scheduleText,
    schedules = [],
  } = params;

  if (!leadId || !teacherId) return { success: false, error: "Missing leadId or teacherId" };

  try {
    // 1. Invoke secure transactional RPC
    const { data: rpcRes, error: rpcErr } = await supabase.rpc("convert_lead_to_student", {
      p_lead_id: leadId,
      p_teacher_id: teacherId,
      p_full_name: fullName,
      p_email: email || null,
      p_phone: phone || null,
      p_language_studied: conversionOptionalText(languageStudied),
      p_level: conversionOptionalText(level),
      p_focus: conversionOptionalText(focus),
      p_modality: conversionOptionalText(modality),
      p_package_id: packageId || null,
      p_notes: notes || null,
      p_schedule_text: scheduleText || null,
    });

    if (rpcErr) {
      console.error("[automation-engine] convert_lead_to_student RPC error:", rpcErr);
      return { success: false, error: rpcErr.message };
    }

    if (!rpcRes || !rpcRes.success) {
      return { success: false, error: rpcRes?.error || "Failed to convert lead" };
    }

    const studentId = rpcRes.student_id;

    // The RPC's locked duplicate guard is authoritative: do not recreate schedules
    // or calendar occurrences when the lead was already converted.
    if (rpcRes.already_converted) return { success: true, studentId };

    // 2. If schedules provided, insert student_schedules and trigger 8-week calendar event generation
    if (schedules.length > 0 && studentId) {
      const { insertStudentSchedules } = await import("@/lib/student-schedules");
      // Plain INSERT: several lessons may share a weekday (no student_id+weekday uniqueness).
      const insertedRows = await insertStudentSchedules(
        studentId,
        schedules.map((s: any) => ({
          weekday: s.weekday,
          startTime: s.startTime,
          duration: s.duration || 60,
          deliveryMode: s.deliveryMode === "In person" ? "In person" : "Online",
          locationLink: s.locationLink || s.meetingUrl || "",
        })),
      );

      const { syncStudentSchedulesToSupabaseEvents } = await import("@/lib/calendar-sync");
      await syncStudentSchedulesToSupabaseEvents(
        studentId,
        teacherId,
        fullName,
        level as any,
        focus as any,
        "Private",
        insertedRows,
      );
    }

    return { success: true, studentId };
  } catch (err: any) {
    console.error("[automation-engine] Lead conversion exception:", err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Fetch automation activity log for teacher
 */
export async function fetchAutomationActivity(
  teacherId: string,
  limit = 20
): Promise<AutomationActivity[]> {
  try {
    const { data, error } = await supabase
      .from("automation_activity")
      .select("*")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[automation-engine] Error fetching activity history:", error);
      return [];
    }

    return data as AutomationActivity[];
  } catch (err) {
    console.error("[automation-engine] Failed to fetch activity history:", err);
    return [];
  }
}

/**
 * Retry a failed automation event safely
 */
export async function retryFailedAutomation(
  eventId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: event, error } = await supabase
      .from("automation_events")
      .select("*")
      .eq("id", eventId)
      .single();

    if (error || !event) return { success: false, error: "Event not found" };

    if (event.event_type === "lead.inactive") {
      const result = await processInactiveLeadCheck(event.teacher_id);
      if (result.error) return { success: false, error: result.error };
      const saved = await supabase.from("automation_events").select("status, error_message")
        .eq("teacher_id", event.teacher_id).eq("id", eventId).single();
      if (saved.error || saved.data?.status !== "completed") {
        return { success: false, error: saved.error?.message || saved.data?.error_message || "Inactivity cycle could not be reprocessed" };
      }
      return { success: true };
    }

    // Update event status to retrying
    await supabase
      .from("automation_events")
      .update({
        status: "retrying",
        processing_attempts: (event.processing_attempts || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);

    // Re-run appropriate event handler based on event_type
    if (event.event_type === "lead.created") {
      const { data: lead } = await supabase.from("leads").select("*").eq("id", event.source_id).single();
      if (lead) return await processNewLeadAutomation(lead);
    } else if (event.event_type === "lead.trial_scheduled") {
      const { data: lead } = await supabase.from("leads").select("*").eq("id", event.source_id).single();
      const payload = event.payload || {};
      if (lead) return await processTrialLessonScheduledAutomation(lead, payload.trial_date, payload.trial_time);
    }

    // Mark completed if successfully re-executed
    await supabase
      .from("automation_events")
      .update({ status: "completed", processed_at: new Date().toISOString(), error_message: null })
      .eq("id", eventId);

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || String(err) };
  }
}

import { supabase } from "@/lib/supabase";
import { fetchTeacherTimeOff, type TeacherTimeOff } from "./time-off-engine";
import { requireLessonQuantity, validateLessonPeriod } from "./lesson-plan-quantity";
import type { GeneratedOccurrence, LessonPlan } from "./lesson-plans";

interface GenerationRequest {
  teacherId: string;
  entityId: string;
  kind: "student" | "class";
  name: string;
  level?: string;
  focus?: string;
  startDate: string;
  endDate?: string;
  requested: number;
  compute: (timeOff: TeacherTimeOff[]) => GeneratedOccurrence[];
}

interface SavedEvent {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration: number;
  status: string;
  original_date?: string | null;
  original_start_time?: string | null;
  rescheduled_at?: string | null;
}

// One local attempt per teacher/entity; database transactions remain a separate concern.
const pending = new Set<string>();
const eventKey = (date: string, time: string) => `${date}|${time.slice(0, 5)}`;

async function readExistingGenerationRows(table: "calendar_events" | "lesson_plans", teacherId: string, ownerColumn: string, entityId: string) {
  const rows: Array<Record<string, any>> = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from(table).select("*").eq("teacher_id", teacherId)
      .eq(ownerColumn, entityId).order("id").range(offset, offset + 499);
    if (error) throw error;
    if (!data) throw new Error("Unable to verify existing lessons");
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

/** Generation-only persistence. Never uses edit/attendance writes or browser cache as input. */
export async function persistGeneratedLessonPlan(request: GenerationRequest): Promise<LessonPlan[]> {
  const key = `${request.teacherId}:${request.kind}:${request.entityId}`;
  if (pending.has(key)) throw new Error("Lesson generation already in progress");
  pending.add(key);
  try {
    validateLessonPeriod(request.startDate, request.endDate);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!auth.user || auth.user.id !== request.teacherId) throw new Error("Teacher session changed");

    // Preflight before preparation; shortage must perform no writes of any kind.
    requireLessonQuantity(request.compute(await fetchTeacherTimeOff(request.teacherId)), request.requested);
    const ownerColumn = request.kind === "class" ? "class_id" : "student_id";
    if (request.kind === "class") {
      const { data: cls, error } = await supabase.from("classes").select("status")
        .eq("teacher_id", request.teacherId).eq("id", request.entityId).single();
      if (error) throw error;
      if (!cls || cls.status === "archived") throw new Error("Archived classes cannot generate lessons");
    }
    const [eventRows, planRows] = await Promise.all([
      readExistingGenerationRows("calendar_events", request.teacherId, ownerColumn, request.entityId),
      readExistingGenerationRows("lesson_plans", request.teacherId, ownerColumn, request.entityId),
    ]);

    // Read fresh exclusions AFTER asynchronous preparation. No UI snapshot is merged in.
    const selected = requireLessonQuantity(request.compute(await fetchTeacherTimeOff(request.teacherId)), request.requested);
    const events = eventRows as SavedEvent[];
    const bySlot = new Map<string, SavedEvent>();
    for (const event of events) {
      if (event.rescheduled_at && event.original_date) {
        bySlot.set(eventKey(event.original_date, event.original_start_time || event.start_time), event);
      }
    }
    for (const event of events) {
      const slot = eventKey(event.date, event.start_time);
      if (!bySlot.has(slot)) bySlot.set(slot, event);
    }
    const oldPlans = new Map<string, Record<string, any>>(planRows.map((p) => [p.event_id, p]));
    const reused = selected.flatMap((o) => {
      const event = bySlot.get(eventKey(o.date, o.start_time));
      return event ? [event] : [];
    });
    if (new Set(reused.map((e) => e.id)).size !== reused.length) throw new Error("Overlapping lesson identities");
    if (reused.some((e) => oldPlans.get(e.id)?.archived_document_id)) {
      throw new Error("The selected period overlaps an archived lesson plan");
    }
    const missingEvents = selected.filter((o) => !bySlot.has(eventKey(o.date, o.start_time)));
    if (missingEvents.length) {
      const payload = missingEvents.map((o) => ({
        teacher_id: request.teacherId,
        [ownerColumn]: request.entityId,
        ...(request.kind === "class" ? { class_schedule_id: o.schedule_id, event_type: "class" } : {
          schedule_id: o.schedule_id, is_recurring: true, recurrence_series_id: `series-lessonplan-${request.entityId}`,
        }),
        student_name: request.name,
        level: request.level || null,
        focus: request.focus || null,
        date: o.date, start_time: o.start_time, end_time: o.end_time, duration: o.duration,
        type: request.kind === "class" ? "Group" : "Private",
        delivery_mode: o.delivery_mode, location_link: o.location_link || "", status: "Scheduled",
      }));
      const { data, error } = await supabase.from("calendar_events").insert(payload)
        .select("id, date, start_time, end_time, duration, status");
      if (error) throw error;
      if (!data || data.length !== missingEvents.length) throw new Error("Unable to confirm all generated events");
      for (const event of data as SavedEvent[]) bySlot.set(eventKey(event.date, event.start_time), event);
    }
    const matched = selected.map((o) => {
      const event = bySlot.get(eventKey(o.date, o.start_time));
      if (!event) throw new Error("Generated event is missing");
      return event;
    });
    if (new Set(matched.map((e) => e.id)).size !== request.requested) throw new Error("Incomplete generated event set");
    let number = request.kind === "class"
      ? planRows.reduce((max, p) => Math.max(max, Number(p.lesson_number) || 0), 0) : 0;
    const newPlans = matched.flatMap((event, index) => oldPlans.has(event.id) ? [] : [{
      teacher_id: request.teacherId, event_id: event.id,
      class_id: request.kind === "class" ? request.entityId : null,
      student_id: request.kind === "student" ? request.entityId : null,
      lesson_number: request.kind === "class" ? ++number : index + 1,
      scheduled_date: event.date, start_time: event.start_time, end_time: event.end_time, duration: event.duration,
      content: "", homework: "", homework_posted: null, notes: "", attachments: [], completed: false,
    }]);
    if (newPlans.length) {
      // Existing content/history wins even if another writer creates a plan meanwhile.
      const { error } = await supabase.from("lesson_plans").upsert(newPlans, { onConflict: "event_id", ignoreDuplicates: true });
      if (error) throw error;
    }
    const { data: verified, error: verifyError } = await supabase.from("lesson_plans").select("*")
      .eq("teacher_id", request.teacherId).in("event_id", matched.map((e) => e.id));
    if (verifyError) throw verifyError;
    const verifiedMap = new Map((verified || []).map((p) => [p.event_id, p]));
    return matched.map((event) => {
      const plan = verifiedMap.get(event.id);
      if (!plan || plan.archived_document_id || plan[ownerColumn] !== request.entityId) {
        throw new Error("Unable to confirm the complete saved lesson plan");
      }
      return { ...plan, event_status: event.status, original_date: event.original_date,
        original_start_time: event.original_start_time } as LessonPlan;
    });
  } finally {
    pending.delete(key);
  }
}
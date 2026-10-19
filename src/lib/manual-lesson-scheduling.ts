import { supabase } from "@/lib/supabase";
import { saveLessonPlans, type LessonPlan } from "@/lib/lesson-plans";
import type { CEFRLevel, CourseFocus, StudentType } from "@/lib/calendar-sync";

export const LESSON_QUICK_TAGS = ["conversation", "makeup", "exam"] as const;
export interface ManualLessonInput {
  students: Array<{ id: string; full_name: string }>;
  date: string;
  startTime: string;
  endTime: string;
  type: StudentType;
  level: CEFRLevel;
  focus: CourseFocus;
  mode: "Online" | "In person";
  link: string;
  tags: string[];
}
export interface SavedManualEvent { id: string; student_id: string }
export class ManualLessonPlanError extends Error {
  constructor(public events: SavedManualEvent[]) { super("planSaveError"); }
}
export function lessonDuration(start: string, end: string): number {
  const minutes = (time: string) => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error("invalidInterval");
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };
  const duration = minutes(end) - minutes(start);
  if (duration <= 0) throw new Error("invalidInterval");
  return duration;
}
export function manualLessonRows(teacherId: string, input: ManualLessonInput) {
  if (!teacherId || input.students.length === 0) throw new Error("requiredStudents");
  const date = new Date(`${input.date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== input.date) throw new Error("invalidInterval");
  const duration = lessonDuration(input.startTime, input.endTime);
  return [...new Map(input.students.map(student => [student.id, student])).values()].map(student => ({
    teacher_id: teacherId, event_type: "individual", student_id: student.id,
    class_id: null, schedule_id: null, class_schedule_id: null,
    student_name: student.full_name, date: input.date, start_time: input.startTime,
    end_time: input.endTime, duration, type: input.type, level: input.level, focus: input.focus,
    delivery_mode: input.mode, location_link: input.link || null, status: "Scheduled", is_recurring: false,
    ...(input.tags.length ? { lesson_tags: [...new Set(input.tags.map(tag => tag.trim()).filter(Boolean))] } : {}),
  }));
}

// A single batch insert preserves independent student identities, without creating a roster or schedule.
// If plan saving fails, callers retain these event IDs and retry only the same plans.
export async function saveManualLessons(teacherId: string, input: ManualLessonInput, savedEvents?: SavedManualEvent[]) {
  const rows = manualLessonRows(teacherId, input);
  const { data: numbers, error: readError } = await supabase.from("lesson_plans")
    .select("student_id, lesson_number").eq("teacher_id", teacherId).in("student_id", rows.map(row => row.student_id));
  if (readError) throw readError;
  let events = savedEvents;
  if (!events) {
    const { data, error } = await supabase.from("calendar_events").insert(rows).select("id, student_id");
    if (error) throw error;
    if (!data?.length) throw new Error("saveError");
    events = data;
  }
  const plans: LessonPlan[] = events.map(event => ({
    teacher_id: teacherId, event_id: event.id, student_id: event.student_id, class_id: null,
    lesson_number: Math.max(0, ...(numbers || []).filter(row => row.student_id === event.student_id).map(row => Number(row.lesson_number) || 0)) + 1,
    scheduled_date: input.date, start_time: input.startTime, end_time: input.endTime,
    duration: lessonDuration(input.startTime, input.endTime), content: "", homework: "", notes: "", attachments: [], completed: false,
  }));
  const result = await saveLessonPlans(teacherId, plans);
  if (!result.success) throw new ManualLessonPlanError(events);
  return events;
}

export function manualLessonErrorKey(error: unknown): string {
  const value = error as { code?: string; message?: string };
  if (["42703", "PGRST204"].includes(value?.code || "") && value?.message?.includes("lesson_tags")) return "tagsSchemaRequired";
  return ["invalidInterval", "requiredStudents", "planSaveError"].includes(value?.message || "") ? String(value.message) : "saveError";
}
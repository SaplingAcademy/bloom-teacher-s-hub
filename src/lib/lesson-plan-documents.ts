import { supabase } from "@/lib/supabase";
import type { StudentLesson } from "./lesson-plan-sync";

/* =============================================================================
   Histórico de Planos — cada documento é um lesson plan inteiro concluído.
   Reutiliza a arquitetura existente (calendar_events -> lesson_plans):
   ao concluir, as aulas do plano são vinculadas ao documento
   (lesson_plans.archived_document_id) e saem do plano ativo, sem serem apagadas.
   ========================================================================== */

export interface LessonPlanDocument {
  id: string;
  teacher_id: string;
  student_id: string | null;
  class_id: string | null;
  plan_number: number;
  title: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  lesson_count: number;
  snapshot: StudentLesson[];
  plan_created_at: string;
  created_at: string;
  completed_at: string;
}

function mapDocumentRow(row: any): LessonPlanDocument {
  const snapshot = Array.isArray(row.snapshot) ? (row.snapshot as StudentLesson[]) : [];
  return {
    id: row.id,
    teacher_id: row.teacher_id,
    student_id: row.student_id ?? null,
    class_id: row.class_id ?? null,
    plan_number: row.plan_number ?? 1,
    title: row.title || `Plano de Aulas #${row.plan_number ?? 1}`,
    status: row.status || "completed",
    period_start: row.period_start ?? null,
    period_end: row.period_end ?? null,
    lesson_count: row.lesson_count ?? snapshot.length,
    snapshot,
    plan_created_at: row.plan_created_at || row.created_at,
    created_at: row.created_at,
    completed_at: row.completed_at || row.created_at,
  };
}

export async function fetchLessonPlanDocuments(params: {
  studentId?: string;
  classId?: string;
}): Promise<LessonPlanDocument[]> {
  const { studentId, classId } = params;
  if (!studentId && !classId) return [];

  let query = supabase
    .from("lesson_plan_documents")
    .select("*")
    .order("completed_at", { ascending: false });

  query = studentId ? query.eq("student_id", studentId) : query.eq("class_id", classId!);

  const { data, error } = await query;
  if (error) {
    console.warn("[lesson-plan-documents] fetch error:", error.message);
    return [];
  }
  return (data || []).map(mapDocumentRow);
}

/**
 * Fecha o plano ativo do aluno: grava uma versão completa (snapshot) e
 * desvincula as aulas do plano ativo, permitindo gerar um novo plano
 * sem sobrescrever o anterior.
 */
export async function completeStudentLessonPlan(params: {
  teacherId: string;
  studentId: string;
  studentName?: string;
  lessons: StudentLesson[];
  title?: string;
}): Promise<{ success: boolean; document?: LessonPlanDocument; error?: string }> {
  const { teacherId, studentId, studentName, lessons, title } = params;
  if (!teacherId || !studentId) return { success: false, error: "Dados do plano incompletos." };
  if (!lessons || lessons.length === 0) return { success: false, error: "Não há aulas neste plano." };

  try {
    // Aulas atualmente pertencentes ao plano ativo
    const { data: activeRows, error: activeErr } = await supabase
      .from("lesson_plans")
      .select("id, created_at")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .is("archived_document_id", null);

    if (activeErr) return { success: false, error: activeErr.message };

    const { count } = await supabase
      .from("lesson_plan_documents")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId);

    const planNumber = (count || 0) + 1;
    const sorted = [...lessons].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
    const createdAtList = (activeRows || [])
      .map((r: any) => r.created_at)
      .filter(Boolean)
      .sort();

    const payload = {
      teacher_id: teacherId,
      student_id: studentId,
      class_id: null,
      plan_number: planNumber,
      title: title || `Plano de Aulas #${planNumber}${studentName ? ` — ${studentName}` : ""}`,
      status: "completed",
      period_start: sorted[0]?.scheduled_date || null,
      period_end: sorted[sorted.length - 1]?.scheduled_date || null,
      lesson_count: lessons.length,
      snapshot: sorted as any,
      plan_created_at: createdAtList[0] || new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("lesson_plan_documents")
      .insert(payload)
      .select("*")
      .single();

    if (insertErr || !inserted) {
      return { success: false, error: insertErr?.message || "Falha ao salvar o documento do plano." };
    }

    const { error: archiveErr } = await supabase
      .from("lesson_plans")
      .update({ archived_document_id: inserted.id })
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .is("archived_document_id", null);

    if (archiveErr) {
      console.warn("[lesson-plan-documents] archive error:", archiveErr.message);
    }

    localStorage.removeItem(`bloom.student_lessons.${studentId}`);

    return { success: true, document: mapDocumentRow(inserted) };
  } catch (err: any) {
    console.error("[lesson-plan-documents] complete exception:", err);
    return { success: false, error: err?.message || "Erro ao concluir o plano." };
  }
}

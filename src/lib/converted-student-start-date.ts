import { supabase } from "@/lib/supabase";
import { studentStartDate } from "@/lib/student-start-date";

/**
 * After a lead conversion (the database function does not take a start date), store the teacher's
 * "Início das aulas" on the created student. Owner-scoped, only while the student has no start date
 * (never overwrites an existing one), then confirmed by reading it back. Returns true only when the
 * persisted value equals the requested date. Never retries the conversion itself.
 */
export async function saveConvertedStudentStartDate(teacherId: string, studentId: string, startDate: string): Promise<boolean> {
  const date = studentStartDate(startDate);
  if (!teacherId || !studentId || !date) return false;
  try {
    const { error: updateError } = await supabase
      .from("students")
      .update({ course_start_date: date })
      .eq("id", studentId)
      .eq("teacher_id", teacherId)
      .is("course_start_date", null);
    if (updateError) {
      console.warn("[ConvertedStudentStartDate] update failed:", updateError.message);
      return false;
    }
    const { data, error: readError } = await supabase
      .from("students")
      .select("course_start_date")
      .eq("id", studentId)
      .eq("teacher_id", teacherId)
      .maybeSingle();
    if (readError) {
      console.warn("[ConvertedStudentStartDate] read-back failed:", readError.message);
      return false;
    }
    return studentStartDate(data?.course_start_date) === date;
  } catch (error) {
    console.warn("[ConvertedStudentStartDate] unexpected failure:", error);
    return false;
  }
}

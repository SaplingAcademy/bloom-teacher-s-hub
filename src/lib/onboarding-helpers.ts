import { supabase } from "@/lib/supabase";
import { OnboardingData } from "@/types/onboarding";

export interface TeacherOnboardingProfile {
  teacherId: string;
  status: "not_started" | "in_progress" | "skipped" | "completed";
  completedAt?: string;
  currentStep?: number;
  answers: Partial<OnboardingData>;
}

/**
 * Fetch authoritative onboarding profile and answers for a given teacher ID
 */
export async function getTeacherOnboardingProfile(teacherId: string): Promise<TeacherOnboardingProfile | null> {
  if (!teacherId) return null;

  try {
    const { data: record, error } = await supabase
      .from("onboarding")
      .select("answers, updated_at")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    if (error || !record) {
      return null;
    }

    const answers = (record.answers || {}) as Record<string, any>;
    const status = answers.status || "not_started";
    const currentStep = typeof answers.current_step === "number" ? answers.current_step : 0;
    const completedAt = answers.completed_at || undefined;

    return {
      teacherId,
      status,
      completedAt,
      currentStep,
      answers: answers as Partial<OnboardingData>,
    };
  } catch (err) {
    console.error("[getTeacherOnboardingProfile] Error fetching onboarding profile:", err);
    return null;
  }
}

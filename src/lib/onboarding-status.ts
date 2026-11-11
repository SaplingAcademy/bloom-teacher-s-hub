/**
 * Single decision for "where does an authenticated teacher go": based only on the profile the
 * AuthProvider loaded from Supabase (profiles.onboarding_completed, already merged with the
 * onboarding answers' status in use-auth). Browser storage is never the source: it is purged on
 * logout, so relying on it sent teachers who had finished the setup back to the questionnaire.
 *
 * - "loading": the profile has not been loaded yet → wait (show a loader), never decide early.
 * - "error": the profile/status could not be read → surface the error, never assume pending/done.
 * - "completed" / "skipped" → the platform; "pending" → the onboarding (resuming saved answers).
 */
export type OnboardingGate = "loading" | "error" | "completed" | "skipped" | "pending";

export function onboardingGate(input: {
  loading: boolean;
  error: unknown;
  profile: { onboarding_completed?: unknown; onboarding_status?: unknown } | null | undefined;
}): OnboardingGate {
  if (input.loading) return "loading";
  if (input.error) return "error";
  if (!input.profile) return "loading";
  if (input.profile.onboarding_completed === true) return "completed";
  if (input.profile.onboarding_status === "skipped") return "skipped";
  return "pending";
}

/** Destination after sign-in once the gate is known ("/" also shows the load error with retry). */
export function postLoginDestination(gate: OnboardingGate): "/" | "/onboarding" | null {
  if (gate === "loading") return null;
  return gate === "pending" ? "/onboarding" : "/";
}

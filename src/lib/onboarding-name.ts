import { sanitizeTeacherName } from "@/lib/teacher-name";

/**
 * Preferred-name rules for onboarding. The name is persisted ONLY in
 * public.profiles.full_name; onboarding answers never carry it.
 */

/** Initial field value: keep what the teacher already typed, else a real profiles.full_name, else "". */
export function resolveInitialPreferredName(
  draftValue: string | null | undefined,
  profileFullName: unknown,
  email?: string | null
): string {
  if ((draftValue ?? "").trim()) return draftValue as string;
  return sanitizeTeacherName(profileFullName, email) ?? "";
}

/** Value written to profiles.full_name: trimmed text or NULL (never ""). */
export function toProfileFullName(input: string | null | undefined): string | null {
  return (input ?? "").trim() || null;
}

/** Removes any name key from onboarding answers (saved or loaded). */
export function stripNameFromAnswers<T extends Record<string, any>>(answers: T): Omit<T, "preferredName"> {
  const { preferredName: _omit, ...rest } = answers ?? ({} as T);
  return rest;
}

/** Partial auth profile state reflecting the saved name. */
export function profileNameState(fullName: string | null) {
  return { full_name: fullName, name: fullName ?? "" };
}

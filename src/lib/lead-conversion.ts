import { leadToProfileDraft } from "@/lib/lead-profile";
import type { Lead } from "@/lib/automation-engine";

/** Copy the lead literally; catalog resolution is display-only, never a rewrite. */
export function leadToConversionDraft(lead: Lead) {
  const profile = leadToProfileDraft(lead);
  return {
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    language_studied: profile.language_studied,
    level: profile.level,
    focus: profile.focus,
    modality: profile.modality,
    package_id: profile.package_id,
    notes: profile.notes,
    schedule_weekday: "Monday",
    schedule_start_time: "10:00",
  };
}

/** An explicit unset RPC argument must be NULL, not an omitted SQL default. */
export function conversionOptionalText(value: string | null | undefined): string | null {
  return value == null || value.trim() === "" ? null : value;
}

/** Include a stored historical language without making it a new default. */
export function conversionLanguageOptions(languages: readonly string[], storedValue: string): string[] {
  return [...new Set([...languages, ...(storedValue ? [storedValue] : [])])];
}
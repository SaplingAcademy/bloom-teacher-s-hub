import { supabase } from "@/lib/supabase";

/**
 * Light-hearted wellbeing reminders for lessons scheduled at unusual hours.
 * They are reminders only, never restrictions. Preferences are per teacher, stored in
 * the existing settings.notification_preferences JSON under `wellbeing_reminders`
 * ({ early_morning?: boolean, late_night?: boolean }; missing = reminder on).
 */
export type UnusualHourGroup = "early_morning" | "late_night";
export type UnusualHourPreferences = Record<UnusualHourGroup, boolean>;

export const DEFAULT_UNUSUAL_HOUR_PREFERENCES: UnusualHourPreferences = { early_morning: true, late_night: true };
const PREFERENCES_KEY = "wellbeing_reminders";

/** Local lesson start "HH:MM[:SS]": 00:00–06:00 (inclusive) → early morning; 22:00–23:59 → late night. */
export function unusualHourGroup(startTime: string | null | undefined): UnusualHourGroup | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(startTime || "");
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 23 * 60 + 59) return null;
  if (minutes <= 6 * 60) return "early_morning";
  if (minutes >= 22 * 60) return "late_night";
  return null;
}

export function parseUnusualHourPreferences(notificationPreferences: unknown): UnusualHourPreferences {
  const stored = (notificationPreferences as Record<string, unknown> | null)?.[PREFERENCES_KEY] as
    | Partial<Record<UnusualHourGroup, unknown>>
    | undefined;
  return {
    early_morning: stored?.early_morning !== false,
    late_night: stored?.late_night !== false,
  };
}

/** Pure merge: only the chosen group changes; every other notification preference is kept. */
export function mergeUnusualHourPreference(
  notificationPreferences: unknown,
  group: UnusualHourGroup,
  enabled: boolean,
): Record<string, unknown> {
  const base = notificationPreferences && typeof notificationPreferences === "object" ? (notificationPreferences as Record<string, unknown>) : {};
  const current = (base[PREFERENCES_KEY] && typeof base[PREFERENCES_KEY] === "object" ? base[PREFERENCES_KEY] : {}) as Record<string, unknown>;
  return { ...base, [PREFERENCES_KEY]: { ...current, [group]: enabled } };
}

export async function fetchUnusualHourPreferences(teacherId: string): Promise<UnusualHourPreferences> {
  const { data, error } = await supabase
    .from("settings")
    .select("notification_preferences")
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (error) throw error;
  return parseUnusualHourPreferences(data?.notification_preferences);
}

/**
 * Owner-scoped compare-and-set update of settings.notification_preferences (same pattern as
 * the catalog editor): reads the current JSON, changes only this group and retries once if
 * another write landed in between. Never creates a settings row.
 */
export async function saveUnusualHourPreference(teacherId: string, group: UnusualHourGroup, enabled: boolean): Promise<UnusualHourPreferences> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!teacherId || auth.user?.id !== teacherId) throw new Error("authentication");

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: row, error: readError } = await supabase
      .from("settings")
      .select("notification_preferences")
      .eq("teacher_id", teacherId)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) throw new Error("missing_settings");
    const next = mergeUnusualHourPreference(row.notification_preferences, group, enabled);
    let update = supabase.from("settings").update({ notification_preferences: next }).eq("teacher_id", teacherId);
    update = row.notification_preferences == null
      ? update.is("notification_preferences", null)
      : update.eq("notification_preferences", JSON.stringify(row.notification_preferences));
    const { data, error } = await update.select("notification_preferences").maybeSingle();
    if (error) throw error;
    if (data) return parseUnusualHourPreferences(data.notification_preferences);
  }
  throw new Error("changed");
}

/** Distinct reminder groups for a set of start times, in a stable order (at most one each). */
export function unusualHourGroupsFor(startTimes: readonly string[]): UnusualHourGroup[] {
  const found = new Set(startTimes.map(unusualHourGroup).filter((g): g is UnusualHourGroup => g !== null));
  return (["early_morning", "late_night"] as const).filter((g) => found.has(g));
}

/**
 * Start times of recurring slots that are new or whose day/time changed (matched by id), so
 * editing other fields of a student/class with an existing late slot does not remind again.
 */
export function changedRecurringStartTimes(
  original: readonly { id?: string | null; weekday: string; startTime: string }[],
  next: readonly { id?: string | null; weekday: string; startTime: string }[],
): string[] {
  const byId = new Map(original.filter((s) => s.id).map((s) => [s.id as string, s]));
  return next
    .filter((slot) => {
      const before = slot.id ? byId.get(slot.id) : undefined;
      return !before || before.weekday !== slot.weekday || before.startTime.slice(0, 5) !== slot.startTime.slice(0, 5);
    })
    .map((slot) => slot.startTime);
}

/**
 * Onboarding writes its own notification preferences (payment_methods, contracts) on top of
 * the stored ones, so keys saved elsewhere (e.g. wellbeing_reminders) are preserved.
 */
export function mergeOnboardingNotificationPreferences(existing: unknown, onboarding: Record<string, unknown>): Record<string, unknown> {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, ...onboarding };
}

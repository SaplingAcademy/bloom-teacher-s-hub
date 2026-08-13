/**
 * Canonical resolution of the teacher's display name.
 *
 * Priority:
 *   1. teacher_profiles.full_name (or legacy profiles.full_name)
 *   2. Supabase Auth user metadata (full_name / name / display_name)
 *   3. null  → callers render a neutral fallback
 *
 * The name is NEVER derived from the e-mail address.
 */

const PLACEHOLDER_NAMES = new Set([
  "educator",
  "teacher",
  "professor",
  "professora",
  "user",
  "usuario",
  "usuário",
  "undefined",
  "null",
]);

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** True when the candidate looks like it was generated from the e-mail address. */
export function isEmailDerivedName(candidate: unknown, email?: string | null): boolean {
  const name = normalize(candidate);
  if (!name) return false;
  if (name.includes("@")) return true;
  const local = normalize(email).split("@")[0];
  if (!local) return false;
  const simplify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return simplify(name) === simplify(local);
}

/** Returns a usable human name, or null when the candidate is empty/placeholder/email-derived. */
export function sanitizeTeacherName(candidate: unknown, email?: string | null): string | null {
  const name = normalize(candidate);
  if (!name) return null;
  if (PLACEHOLDER_NAMES.has(name.toLowerCase())) return null;
  if (isEmailDerivedName(name, email)) return null;
  return name;
}

/** Name coming from Supabase Auth user metadata. */
export function getMetadataName(user: any): string | null {
  const email = user?.email;
  const meta = user?.user_metadata ?? {};
  return (
    sanitizeTeacherName(meta.full_name, email) ||
    sanitizeTeacherName(meta.name, email) ||
    sanitizeTeacherName(meta.display_name, email)
  );
}

/** Main entry point: profile record first, then auth metadata, then null. */
export function resolveTeacherName(profile: any, user: any): string | null {
  const email = user?.email ?? profile?.email;
  return (
    sanitizeTeacherName(profile?.full_name, email) ||
    sanitizeTeacherName(profile?.name, email) ||
    sanitizeTeacherName(profile?.display_name, email) ||
    getMetadataName(user)
  );
}

export function resolveTeacherFirstName(profile: any, user: any): string | null {
  const full = resolveTeacherName(profile, user);
  return full ? full.split(/\s+/)[0] || null : null;
}

/** Neutral fallback label when no name has ever been provided. */
export function neutralTeacherName(lang?: string): string {
  return lang === "pt" ? "Professor(a)" : "Teacher";
}

export function teacherInitials(name: string | null, lang?: string): string {
  if (!name) return lang === "pt" ? "PB" : "BT";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

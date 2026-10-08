/**
 * Central policy for error messages shown to teachers.
 * Technical details (Supabase/PostgREST/Postgres/JS/API) are logged to the console
 * and never displayed; intentional user-facing messages pass through untouched.
 */
import { t, type Language } from "@/lib/i18n";

/** Throw this for validation/business messages written for the teacher. Always shown as-is. */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

const TECHNICAL_PATTERNS: RegExp[] = [
  /pgrst/i,
  /\b(?:\d{5}|\d{2}[A-Z]\d{2}|P0\d{3}|XX\d{3})\b/, // SQLSTATE codes (23505, 42P10…)
  /duplicate key/i,
  /violates/i,
  /constraint/i,
  /foreign key/i,
  /row[- ]level security/i,
  /permission denied/i,
  /schema cache/i,
  /\brelation\b/i,
  /\bcolumn\b/i,
  /\btable\b/i,
  /could not find the/i,
  /\bsyntax\b/i,
  /\bjwt\b/i,
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /\bfetch\b/i,
  /typeerror|referenceerror|rangeerror|syntaxerror/i,
  /cannot read propert/i,
  /is not a function/i,
  /undefined|\bnull\b|nan\b/i,
  /\[object /i,
  /unexpected token/i,
  /\bat .+\(.+:\d+:\d+\)/, // stack frame
  /[{}[\]]/, // serialized objects
  /\b[a-z]+_[a-z0-9_]+\b/, // snake_case identifiers (tables/columns)
  /https?:\/\/\S+\/(rest|auth|functions)\/v1/i,
  /status code \d{3}|\b(4|5)\d\d\b (error|bad|internal)/i,
  /timeout|timed out|econn|enotfound/i,
];

const NETWORK_PATTERNS = /failed to fetch|networkerror|load failed|network request failed|econn|enotfound/i;

export function currentLanguage(): Language {
  if (typeof window === "undefined") return "pt";
  try {
    const saved = window.localStorage.getItem("bloom.dashboard.lang");
    return saved === "en" ? "en" : "pt";
  } catch {
    return "pt";
  }
}

export function isTechnicalMessage(message: string): boolean {
  const text = message.trim();
  if (!text) return true;
  if (text.length > 220) return true;
  return TECHNICAL_PATTERNS.some((re) => re.test(text));
}

function rawMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const e = error as { message?: unknown; error?: unknown };
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "string") return e.error;
  }
  return "";
}

/**
 * Turns any error into a safe message for the teacher.
 * - UserFacingError → its message.
 * - Clean human text → kept (e.g. validation messages returned by services).
 * - Network failure → connection message.
 * - Anything technical → the contextual fallback (or the generic one).
 */
export function toUserMessage(error: unknown, fallback?: string, lang: Language = currentLanguage()): string {
  const generic = fallback || t("errors.generic", lang);
  if (error instanceof UserFacingError) return error.message;
  const raw = rawMessage(error);
  if (!raw) return generic;
  if (NETWORK_PATTERNS.test(raw)) return t("errors.network", lang);
  if (isTechnicalMessage(raw)) return generic;
  return raw;
}

/** Logs the technical error for developers and returns the safe message. */
export function reportUserError(error: unknown, fallback?: string, context?: string): string {
  if (error) console.error(`[Bloom error]${context ? ` ${context}` : ""}`, error);
  return toUserMessage(error, fallback);
}

let guardInstalled = false;

/**
 * Safety net: wraps sonner's toast.error so any string/error that slipped through
 * without explicit handling is sanitized. Success toasts are untouched.
 */
export function installToastErrorGuard(toastApi: { error: (message: any, data?: any) => any }) {
  if (guardInstalled) return;
  guardInstalled = true;
  const original = toastApi.error.bind(toastApi);
  toastApi.error = (message: any, data?: any) => {
    if (typeof message === "string" || message instanceof Error) {
      const safe = toUserMessage(message);
      if (safe !== message) console.error("[Bloom error] technical toast sanitized:", message);
      return original(safe, data);
    }
    return original(message, data);
  };
}

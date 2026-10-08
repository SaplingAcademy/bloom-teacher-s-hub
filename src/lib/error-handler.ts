import { reportUserError } from "@/lib/user-error";

/**
 * Sanitizes technical database / API error messages (PostgREST, Supabase schema, JWT, foreign key, etc.)
 * so that end users are NEVER presented with raw technical tracebacks or schema cache errors.
 * 
 * Technical errors are logged to console.error for internal debugging.
 */
export function getFriendlyErrorMessage(error: unknown, defaultMessage?: string): string {
  return reportUserError(error, defaultMessage);
}

/**
 * Returns user-friendly message for partial failures
 */
export function getPartialSuccessMessage(
  defaultMessage = "Sincronização concluída com algumas pendências."
): string {
  return defaultMessage;
}

/**
 * Sanitizes technical database / API error messages (PostgREST, Supabase schema, JWT, foreign key, etc.)
 * so that end users are NEVER presented with raw technical tracebacks or schema cache errors.
 * 
 * Technical errors are logged to console.error for internal debugging.
 */
export function getFriendlyErrorMessage(
  error: unknown,
  defaultMessage = "Não foi possível concluir a operação agora. Tente novamente em instantes."
): string {
  if (!error) return defaultMessage;

  // Log raw technical error for debugging
  console.error("[System Error Logged Internal]", error);

  const errorString =
    typeof error === "string"
      ? error
      : (error as any)?.message || (error as any)?.details || JSON.stringify(error);

  const lower = errorString.toLowerCase();

  // Detect technical PostgREST / Supabase / Postgres errors
  const isTechnical =
    lower.includes("schema cache") ||
    lower.includes("pgrst") ||
    lower.includes("column") ||
    lower.includes("relation") ||
    lower.includes("foreign key") ||
    lower.includes("violates") ||
    lower.includes("jwt") ||
    lower.includes("syntax") ||
    lower.includes("could not find the") ||
    lower.includes("failed to fetch") ||
    lower.includes("networkerror");

  if (isTechnical) {
    if (lower.includes("networkerror") || lower.includes("failed to fetch")) {
      return "Erro de conexão com a rede. Verifique sua internet e tente novamente.";
    }
    return defaultMessage;
  }

  // If error string is clean human text and under 120 chars, return formatted
  if (typeof errorString === "string" && errorString.length < 120 && !errorString.includes("{")) {
    return errorString;
  }

  return defaultMessage;
}

/**
 * Returns user-friendly message for partial failures
 */
export function getPartialSuccessMessage(
  defaultMessage = "Sincronização concluída com algumas pendências."
): string {
  return defaultMessage;
}

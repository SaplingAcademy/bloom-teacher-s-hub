/** Public product page for visitors (outside the authenticated app). */
export const LANDING_PATH = "/conheca";

// Parameters Supabase Auth may put on a redirect (PKCE code, e-mail OTP, errors, implicit tokens).
const AUTH_PARAMS = ["code", "token_hash", "type", "error", "error_code", "error_description", "access_token", "refresh_token"];

/**
 * Where an unauthenticated visitor of the protected app goes. Only the bare root "/" opens the
 * public landing page; any other protected path, or a root URL carrying auth parameters (so a
 * login / e-mail confirmation round-trip is never diverted), keeps going to the sign-in page.
 */
export function visitorRedirectTarget(pathname: string, search = "", hash = ""): typeof LANDING_PATH | "/auth" {
  if (pathname !== "/") return "/auth";
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
  const hasAuthParam = AUTH_PARAMS.some((key) => params.has(key) || hashParams.has(key));
  return hasAuthParam ? "/auth" : LANDING_PATH;
}

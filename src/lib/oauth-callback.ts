/**
 * Google OAuth return handling for /auth, kept pure so it can be tested without the route.
 *
 * Supabase returns OAuth sign-ins to the same /auth URL used by e-mail confirmation links, with the
 * same callback parameters (access_token hash, code or error). A per-tab marker set right before the
 * redirect tells the two apart, so a Google sign-in is never shown as "e-mail confirmed" and a
 * cancelled Google consent is never shown as an invalid confirmation link. The marker holds no
 * personal data and is removed as soon as the return is read.
 *
 * Accounts and identities are never resolved here: Supabase Auth decides whether the Google
 * identity belongs to an existing user (automatic linking of verified e-mails) or creates a new
 * one, and the database trigger creates public.profiles for new users only.
 */
export const OAUTH_PENDING_KEY = "bloom.auth.oauth";

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The URL Supabase sends the browser back to; it must be in the project's Redirect URLs list. */
export function oauthRedirectUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}/auth`;
}

export function markOAuthPending(store: SessionStore, provider = "google"): void {
  try {
    store.setItem(OAUTH_PENDING_KEY, provider);
  } catch {
    /* Storage unavailable: the return falls back to the generic callback handling. */
  }
}

export function clearOAuthPending(store: SessionStore): void {
  try {
    store.removeItem(OAUTH_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Reads and removes the marker; true when this callback is the return of an OAuth sign-in. */
export function consumeOAuthPending(store: SessionStore): boolean {
  let pending = false;
  try {
    pending = Boolean(store.getItem(OAUTH_PENDING_KEY));
  } catch {
    pending = false;
  }
  clearOAuthPending(store);
  return pending;
}

/** i18n key for an OAuth error returned in the callback URL. */
export function oauthErrorKey(error: string | null | undefined, description?: string | null): "auth.googleCancelled" | "auth.googleFailed" {
  const text = `${error ?? ""} ${description ?? ""}`.toLowerCase();
  return text.includes("access_denied") || text.includes("cancel") ? "auth.googleCancelled" : "auth.googleFailed";
}

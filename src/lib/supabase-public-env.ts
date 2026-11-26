/**
 * Single reader of the PUBLIC Supabase settings (project URL + publishable/anon key) on the server.
 * Every server entry point — the injected browser config, Academy access and the Library — must
 * accept the same variable names, in the same order, so a deployment that defines only one naming
 * style (e.g. VITE_* on Vercel) works everywhere instead of breaking a single feature.
 * The service role key is never read here.
 */
type Env = Record<string, string | undefined>;

const URL_NAMES = ["BLOOM_SUPABASE_URL", "VITE_SUPABASE_URL", "SUPABASE_URL"] as const;
const KEY_NAMES = [
  "BLOOM_SUPABASE_PUBLISHABLE_KEY",
  "BLOOM_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
] as const;

const first = (env: Env, names: readonly string[]): string | null => {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return null;
};

/**
 * Accepts a project URL that may have been pasted with an API path suffix
 * (e.g. https://xxx.supabase.co/rest/v1/) and returns the base project URL.
 */
export function normalizeSupabaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().replace(/\/+$/, "").replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/, "") || null;
}

export interface PublicSupabaseEnv {
  url: string | null;
  publishableKey: string | null;
}

export function readPublicSupabaseEnv(env: Env = process.env): PublicSupabaseEnv {
  return { url: normalizeSupabaseUrl(first(env, URL_NAMES)), publishableKey: first(env, KEY_NAMES) };
}

/** Names only (never values), for server logs when the configuration is missing. */
export const PUBLIC_SUPABASE_ENV_NAMES = { url: URL_NAMES, key: KEY_NAMES };

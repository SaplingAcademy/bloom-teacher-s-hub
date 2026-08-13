import { createClient } from "@supabase/supabase-js";

// Read-only env lookup. Only publishable/anon credentials are ever read here —
// SUPABASE_SERVICE_ROLE_KEY is server-only and must never reach this module.
const viteEnv = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
const nodeEnv = (typeof process !== "undefined" ? process.env : {}) as Record<
  string,
  string | undefined
>;

// Injected into the HTML <head> by the root route from server-side env vars.
// Nothing secret lives here: only the project URL and the publishable key.
const injected = ((globalThis as any).__BLOOM_SUPABASE_CONFIG__ ?? {}) as {
  url?: string | null;
  publishableKey?: string | null;
};

const pick = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = viteEnv[name] ?? nodeEnv[name];
    if (value) return value;
  }
  return undefined;
};

const supabaseUrl =
  injected.url || pick("VITE_SUPABASE_URL", "BLOOM_SUPABASE_URL", "SUPABASE_URL");
const supabaseKey =
  injected.publishableKey ||
  pick(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "BLOOM_SUPABASE_PUBLISHABLE_KEY",
    "BLOOM_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  );

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.error(
    "[supabase] Missing public Supabase credentials. Save BLOOM_SUPABASE_URL and " +
      "BLOOM_SUPABASE_PUBLISHABLE_KEY as project environment variables.",
  );
}

// Placeholder values keep module evaluation from crashing the whole app before the
// credentials exist; every request simply fails until real values are provided.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseKey ?? "placeholder-anon-key",
);

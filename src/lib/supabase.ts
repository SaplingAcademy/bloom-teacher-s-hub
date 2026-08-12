import { createClient } from "@supabase/supabase-js";

// Read-only env lookup. Only publishable/anon credentials are ever read here —
// SUPABASE_SERVICE_ROLE_KEY is server-only and must never reach this module.
const viteEnv = ((import.meta as any).env ?? {}) as Record<string, string | undefined>;
const nodeEnv = (typeof process !== "undefined" ? process.env : {}) as Record<
  string,
  string | undefined
>;

const pick = (...names: string[]): string | undefined => {
  for (const name of names) {
    const value = viteEnv[name] ?? nodeEnv[name];
    if (value) return value;
  }
  return undefined;
};

const supabaseUrl = pick("VITE_SUPABASE_URL", "SUPABASE_URL");
const supabaseKey = pick(
  "VITE_SUPABASE_ANON_KEY",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
);

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
  console.error(
    "[supabase] Missing Supabase credentials. Connect the existing Supabase project " +
      "in Project Settings → Integrations → Supabase so VITE_SUPABASE_URL and " +
      "VITE_SUPABASE_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY) are injected.",
  );
}

// Placeholder values keep module evaluation from crashing the whole app before the
// Supabase project is connected; every request simply fails until real keys exist.
export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseKey ?? "placeholder-anon-key",
);

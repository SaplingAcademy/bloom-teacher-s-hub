import { createServerFn } from "@tanstack/react-start";

export type PublicSupabaseConfig = {
  url: string | null;
  publishableKey: string | null;
};

/**
 * Accepts a project URL that may have been pasted with an API path suffix
 * (e.g. https://xxx.supabase.co/rest/v1/) and returns the base project URL.
 */
const normalizeUrl = (value: string | undefined | null): string | null => {
  if (!value) return null;
  return (
    value.trim().replace(/\/+$/, "").replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/, "") ||
    null
  );
};

/**
 * Reads the PUBLIC Supabase credentials (project URL + publishable/anon key)
 * from server environment variables so they never live in versioned source.
 * The service role key is never read here and never reaches the client.
 */
export const getPublicSupabaseConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSupabaseConfig> => ({
    url: normalizeUrl(
      process.env["BLOOM_SUPABASE_URL"] ??
        process.env["VITE_SUPABASE_URL"] ??
        process.env["SUPABASE_URL"],
    ),
    publishableKey:
      process.env["BLOOM_SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["BLOOM_SUPABASE_ANON_KEY"] ??
      process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["VITE_SUPABASE_ANON_KEY"] ??
      process.env["SUPABASE_PUBLISHABLE_KEY"] ??
      process.env["SUPABASE_ANON_KEY"] ??
      null,
  }),
);

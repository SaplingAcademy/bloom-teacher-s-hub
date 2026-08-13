import { createServerFn } from "@tanstack/react-start";

export type PublicSupabaseConfig = {
  url: string | null;
  publishableKey: string | null;
};

/**
 * Reads the PUBLIC Supabase credentials (project URL + publishable/anon key)
 * from server environment variables so they never live in versioned source.
 * The service role key is never read here and never reaches the client.
 */
export const getPublicSupabaseConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSupabaseConfig> => ({
    url:
      process.env["BLOOM_SUPABASE_URL"] ??
      process.env["VITE_SUPABASE_URL"] ??
      process.env["SUPABASE_URL"] ??
      null,
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

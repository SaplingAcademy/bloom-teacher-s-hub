import { createServerFn } from "@tanstack/react-start";

export type PublicSupabaseConfig = {
  url: string | null;
  publishableKey: string | null;
};

export const getPublicSupabaseConfig = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSupabaseConfig> => {
    // Same reader (names and order) as the Academy and Library server functions.
    const { readPublicSupabaseEnv } = await import("./supabase-public-env");
    return readPublicSupabaseEnv();
  },
);

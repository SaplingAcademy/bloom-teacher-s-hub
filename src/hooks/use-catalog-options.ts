import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { normalizeCatalogOptions, type CatalogOptions } from "@/lib/catalog-options";

/** Reuse this exact teacher-scoped key when a future catalog editor saves changes. */
export const CATALOG_OPTIONS_QUERY_KEY = (teacherId: string | undefined) =>
  ["catalog-options", teacherId] as const;

/** Read-only: never creates a settings row or writes defaults back to the database. */
export function useCatalogOptions() {
  const { user, session, loading: authLoading } = useAuth();
  const teacherId = user?.id;
  const authenticated = Boolean(teacherId && session?.user.id === teacherId) && !authLoading;

  const query = useQuery({
    queryKey: CATALOG_OPTIONS_QUERY_KEY(teacherId),
    enabled: authenticated,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<CatalogOptions | null> => {
      // Also guards explicit refetch calls while signed out or changing accounts.
      if (!teacherId || !authenticated) return null;
      const { data, error } = await supabase
        .from("settings")
        .select("catalog_options")
        .eq("teacher_id", teacherId)
        .abortSignal(signal)
        .maybeSingle();

      if (error) throw error;
      // A successful empty read permits defaults; read/validation failures do not.
      return normalizeCatalogOptions(data?.catalog_options);
    },
  });

  return {
    // No invented defaults during loading/errors and no cached data after sign-out.
    catalogOptions: authenticated ? query.data ?? null : null,
    isLoading: authLoading || (authenticated && query.isLoading),
    isFetching: authenticated && query.isFetching,
    error: authenticated ? query.error : null,
    refetch: query.refetch,
  };
}
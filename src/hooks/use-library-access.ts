import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useFeatureAccess } from "@/hooks/use-plan";
import { fetchLibraryClassifications, LIBRARY_ACCESS_QUERY_KEY, resourceAccessLevel } from "@/lib/library-access";

export function useLibraryAccess() {
  const { user, session, loading } = useAuth();
  const feature = useFeatureAccess("library_full");
  const query = useQuery({
    queryKey: LIBRARY_ACCESS_QUERY_KEY(user?.id),
    enabled: !loading && Boolean(user && session?.user.id === user.id),
    queryFn: fetchLibraryClassifications,
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: "always",
    refetchOnMount: "always",
  });
  return {
    ...query,
    fullAccess: feature.allowed,
    level: (id: string) => resourceAccessLevel(id, query.isError ? undefined : query.data),
  };
}
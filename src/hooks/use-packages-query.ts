import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface PackageQueryItem {
  id: string;
  name: string;
  price: number;
  frequency: "total" | "Monthly" | "Weekly" | "One-time" | string;
  duration: number;
  lessons: number;
  method: string;
}

export const PACKAGES_QUERY_KEY = (teacherId: string | undefined) => ["packages", teacherId];

export function usePackagesQuery(teacherId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: PACKAGES_QUERY_KEY(teacherId),
    queryFn: async (): Promise<PackageQueryItem[]> => {
      if (!teacherId) return [];

      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("teacher_id", teacherId)
        .order("name", { ascending: true });

      if (error) throw error;

      return (data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        price: Number(d.price) || 0,
        frequency: d.frequency || "Monthly",
        duration: Number(d.duration) || 60,
        lessons: Number(d.lessons) || 4,
        method: d.method || "Pix",
      }));
    },
    enabled: Boolean(teacherId),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    packages: query.data || [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

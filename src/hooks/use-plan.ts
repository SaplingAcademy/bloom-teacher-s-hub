import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";
import { canAccessFeature, type PlanFeature, type SubscriptionPlan, type UserRole } from "@/lib/plans";

/** Reuse this exact teacher-scoped key for any future plan/role reads. */
export const PLAN_QUERY_KEY = (teacherId: string | undefined) =>
  ["plan", teacherId] as const;

export interface PlanState {
  plan: SubscriptionPlan | null;
  role: UserRole | null;
  isSuperAdmin: boolean;
}

/**
 * Read-only: never creates subscription/role rows and never invents defaults.
 * On read error or while loading, plan/role stay null — callers must treat
 * null as "unknown" and let the database enforce the rules.
 */
export function usePlan() {
  const { user, session, loading: authLoading } = useAuth();
  const teacherId = user?.id;
  const authenticated = Boolean(teacherId && session?.user.id === teacherId) && !authLoading;

  const query = useQuery({
    queryKey: PLAN_QUERY_KEY(teacherId),
    enabled: authenticated,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<PlanState> => {
      if (!teacherId || !authenticated) return { plan: null, role: null, isSuperAdmin: false };

      const [subscriptionResult, roleResult] = await Promise.all([
        supabase
          .from("teacher_subscriptions")
          .select("plan")
          .eq("teacher_id", teacherId)
          .abortSignal(signal)
          .maybeSingle(),
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", teacherId)
          .eq("role", "super_admin")
          .abortSignal(signal)
          .maybeSingle(),
      ]);

      if (subscriptionResult.error) throw subscriptionResult.error;
      if (roleResult.error) throw roleResult.error;

      const rawPlan = subscriptionResult.data?.plan;
      const plan: SubscriptionPlan | null =
        rawPlan === "free" || rawPlan === "pro" ? rawPlan : null;
      const isSuperAdmin = roleResult.data?.role === "super_admin";

      return { plan, role: isSuperAdmin ? "super_admin" : "teacher", isSuperAdmin };
    },
  });

  const state: PlanState = authenticated
    ? query.data ?? { plan: null, role: null, isSuperAdmin: false }
    : { plan: null, role: null, isSuperAdmin: false };

  return {
    ...state,
    isLoading: authLoading || (authenticated && query.isLoading),
    error: authenticated ? query.error : null,
    refetch: query.refetch,
  };
}

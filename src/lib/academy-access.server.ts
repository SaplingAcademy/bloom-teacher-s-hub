import { createClient } from "@supabase/supabase-js";
import { ACADEMY_PUBLISHED, canEnterAcademy, type AcademyAccess } from "./academy-access";
import type { SubscriptionPlan } from "./plans";
import { PUBLIC_SUPABASE_ENV_NAMES, readPublicSupabaseEnv } from "./supabase-public-env";

/** The authenticated database role is the boundary, never a client-supplied role. */
export async function authorizeAcademy(authorization: string | undefined): Promise<AcademyAccess> {
  const bearer = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) throw new Error("ACADEMY_AUTH_REQUIRED");

  // Same public Supabase settings (and accepted variable names) as the browser configuration.
  const { url, publishableKey: key } = readPublicSupabaseEnv();
  if (!url || !key) {
    console.error("[academy] Public Supabase configuration missing on the server. Expected one of", PUBLIC_SUPABASE_ENV_NAMES);
    throw new Error("ACADEMY_ACCESS_UNAVAILABLE");
  }

  const client = createClient(
    url,
    key,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    },
  );
  const { data: identity, error: identityError } = await client.auth.getUser(bearer);
  if (identityError || !identity.user) throw new Error("ACADEMY_AUTH_REQUIRED");

  const { data: isSuperAdmin, error: roleError } = await client.rpc("has_role", {
    _user_id: identity.user.id,
    _role: "super_admin",
  });
  if (roleError || typeof isSuperAdmin !== "boolean") throw new Error("ACADEMY_ACCESS_UNAVAILABLE");

  // During development a Pro subscription never releases internal Academy data.
  // When published, reuse the existing plan entitlement without changing roles.
  let plan: SubscriptionPlan | null = null;
  if (ACADEMY_PUBLISHED && !isSuperAdmin) {
    const { data: subscription, error } = await client.from("teacher_subscriptions")
      .select("plan").eq("teacher_id", identity.user.id).maybeSingle();
    if (error) throw new Error("ACADEMY_ACCESS_UNAVAILABLE");
    plan = subscription?.plan === "free" || subscription?.plan === "pro" ? subscription.plan : null;
  }

  return {
    state: canEnterAcademy(plan, isSuperAdmin) ? "construction" : "coming_soon",
    published: ACADEMY_PUBLISHED,
  };
}
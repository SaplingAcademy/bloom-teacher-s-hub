import { createClient } from "@supabase/supabase-js";
import { ACADEMY_PUBLISHED, canEnterAcademy, type AcademyAccess } from "./academy-access";
import type { SubscriptionPlan } from "./plans";

/** The authenticated database role is the boundary, never a client-supplied role. */
export async function authorizeAcademy(authorization: string | undefined): Promise<AcademyAccess> {
  const bearer = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!bearer) throw new Error("ACADEMY_AUTH_REQUIRED");

  const url = process.env["BLOOM_SUPABASE_URL"] ?? process.env["SUPABASE_URL"];
  const key = process.env["BLOOM_SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["BLOOM_SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ??
    process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) throw new Error("ACADEMY_ACCESS_UNAVAILABLE");

  const client = createClient(
    url.replace(/\/+$/, "").replace(/\/(rest|auth|storage|realtime|functions)\/v\d+$/, ""),
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
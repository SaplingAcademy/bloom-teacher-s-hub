import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";

// This app uses its existing external session client, not integration-managed
// global middleware. Attach the bearer only to Academy calls, never in RPC data.
const academyBearer = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { supabase } = await import("./supabase");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) throw new Error("ACADEMY_AUTH_REQUIRED");
  return next({ headers: { Authorization: `Bearer ${data.session.access_token}` } });
});

/** Direct calls revalidate identity and has_role before returning the private state. */
export const getAcademyAccess = createServerFn({ method: "POST" })
  .middleware([academyBearer])
  .handler(async () => {
    setResponseHeader("Cache-Control", "no-store");
    const { authorizeAcademy } = await import("./academy-access.server");
    return authorizeAcademy(getRequestHeader("Authorization"));
  });
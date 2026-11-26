import { createClient } from "@supabase/supabase-js";
import type { LibraryContentRequest } from "./library-content.functions";
import { PUBLIC_SUPABASE_ENV_NAMES, readPublicSupabaseEnv } from "./supabase-public-env";

/** Server-only boundary, shared by the transport and focused authorization tests. */
export async function handleLibraryContent(data: LibraryContentRequest) {
    // Same public Supabase settings (and accepted variable names) as the browser configuration.
    const { url, publishableKey: key } = readPublicSupabaseEnv();
    if (!url || !key) {
      console.error("[library] Public Supabase configuration missing on the server. Expected one of", PUBLIC_SUPABASE_ENV_NAMES);
      throw new Error("LIBRARY_CONFIGURATION_UNAVAILABLE");
    }
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${data.accessToken}` } },
    });
    const { data: identity, error: identityError } = await client.auth.getUser(data.accessToken);
    if (identityError || !identity.user) throw new Error("LIBRARY_AUTH_REQUIRED");
    const { data: level, error } = await client.rpc("assert_library_resource_access", { _resource_id: data.resourceId });
    if (error) throw new Error(error.message);
    if (level !== "free" && level !== "pro") throw new Error("LIBRARY_ACCESS_UNAVAILABLE");
    // This import and its content never enter the browser module graph.
    const { LIBRARY_TEMPLATES } = await import("./library-templates.server");
    const template = LIBRARY_TEMPLATES.find((item) => item.id === data.resourceId);
    if (!template) throw new Error("LIBRARY_RESOURCE_NOT_FOUND");
    if (data.operation === "open") return { template, rendered: null, accessLevel: level as "free" | "pro" };
    let rendered = data.customContent ?? template.content;
    for (const [name, value] of Object.entries(data.fields ?? {})) {
      rendered = rendered.replaceAll(`[${name}]`, value.trim() ? value : `[${name}]`);
    }
    return { template: null, rendered, accessLevel: level as "free" | "pro" };
}

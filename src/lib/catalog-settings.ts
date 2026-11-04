import { supabase } from "./supabase";
import { normalizeCatalogOptions, type CatalogOptions } from "./catalog-options";
import { prepareCatalogForSave } from "./catalog-editor";

export class CatalogSettingsError extends Error {
  constructor(public readonly reason: "authentication" | "missing_settings") {
    super(reason);
    this.name = "CatalogSettingsError";
  }
}

/** Session client + owner-scoped, single-column update; no defaults or other settings are written. */
export async function saveCatalogSettings(expectedTeacherId: string, draft: CatalogOptions): Promise<CatalogOptions> {
  const catalog = prepareCatalogForSave(draft);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!expectedTeacherId || auth.user?.id !== expectedTeacherId) {
    throw new CatalogSettingsError("authentication");
  }

  const { data, error } = await supabase
    .from("settings")
    .update({ catalog_options: catalog })
    .eq("teacher_id", auth.user.id)
    .select("catalog_options")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new CatalogSettingsError("missing_settings");
  // Never report a write as successful without a readable, valid persisted value.
  if (data.catalog_options == null) throw new CatalogSettingsError("missing_settings");
  return normalizeCatalogOptions(data.catalog_options);
}
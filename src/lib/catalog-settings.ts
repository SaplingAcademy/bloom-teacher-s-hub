import { supabase } from "./supabase";
import { normalizeCatalogOptions, type CatalogCategory, type CatalogOptions } from "./catalog-options";
import { prepareCatalogForSave, removeCatalogOption, restoreCatalogOption } from "./catalog-editor";
import { hasCatalogOptionUsage } from "./catalog-usage";

export class CatalogSettingsError extends Error {
  constructor(public readonly reason: "authentication" | "missing_settings" | "changed") {
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

export type CatalogLifecycleResult = { catalog: CatalogOptions; action: "removed" | "archived" | "restored" };

/** Removal/restoration persist immediately and never flush unrelated unsaved draft edits. */
export async function changeCatalogOptionLifecycle(
  expectedTeacherId: string, expectedCatalog: CatalogOptions, category: CatalogCategory, id: string, action: "remove" | "restore",
): Promise<CatalogLifecycleResult> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!expectedTeacherId || auth.user?.id !== expectedTeacherId) throw new CatalogSettingsError("authentication");
  const { data: settings, error: readError } = await supabase.from("settings").select("catalog_options").eq("teacher_id", expectedTeacherId).maybeSingle();
  if (readError) throw readError;
  if (!settings) throw new CatalogSettingsError("missing_settings");
  const current = prepareCatalogForSave(normalizeCatalogOptions(settings.catalog_options));
  if (JSON.stringify(current) !== JSON.stringify(prepareCatalogForSave(expectedCatalog))) throw new CatalogSettingsError("changed");
  const option = current[category].find((entry) => entry.id === id);
  if (!option) throw new CatalogSettingsError("changed");
  const used = action === "remove" ? await hasCatalogOptionUsage(expectedTeacherId, current, category, id) : false;
  const next = action === "remove" ? removeCatalogOption(current, category, id, used) : restoreCatalogOption(current, category, id);
  // Recheck after the history reads to reject account switches during the operation.
  const { data: latestAuth, error: latestAuthError } = await supabase.auth.getUser();
  if (latestAuthError) throw latestAuthError;
  if (latestAuth.user?.id !== expectedTeacherId) throw new CatalogSettingsError("authentication");
  let update = supabase.from("settings").update({ catalog_options: prepareCatalogForSave(next) }).eq("teacher_id", expectedTeacherId);
  // Compare-and-set only this JSON column; unrelated settings remain untouched.
  update = settings.catalog_options == null ? update.is("catalog_options", null) : update.eq("catalog_options", JSON.stringify(settings.catalog_options));
  const { data, error } = await update.select("catalog_options").maybeSingle();
  if (error) throw error;
  if (!data || data.catalog_options == null) throw new CatalogSettingsError("changed");
  return { catalog: normalizeCatalogOptions(data.catalog_options), action: action === "restore" ? "restored" : used ? "archived" : "removed" };
}
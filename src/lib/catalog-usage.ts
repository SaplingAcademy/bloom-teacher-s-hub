import { supabase } from "./supabase";
import { resolveCatalogValue, type CatalogCategory, type CatalogOptions } from "./catalog-options";

export interface CatalogUsageSource { table: string; field: string }

/** No date/status filters: inactive students and completed/cancelled/archived history count. */
export const CATALOG_USAGE_SOURCES: Record<CatalogCategory, readonly CatalogUsageSource[]> = {
  levels: [
    { table: "students", field: "level" }, { table: "leads", field: "level" },
    { table: "calendar_events", field: "level" }, { table: "classes", field: "level" },
    { table: "lessons", field: "level" }, { table: "resources", field: "level" },
  ],
  focuses: [
    { table: "students", field: "focus" }, { table: "leads", field: "focus" },
    { table: "calendar_events", field: "focus" },
  ],
  modalities: [
    { table: "students", field: "modality" }, { table: "leads", field: "modality" },
    { table: "calendar_events", field: "delivery_mode" },
  ],
};

/** Display labels are conservatively counted as legacy usage, never rewritten as IDs. */
export function matchesCatalogUsage(catalog: CatalogOptions, category: CatalogCategory, id: string, value: unknown): boolean {
  if (value == null || value === "") return false;
  if (typeof value !== "string") throw new Error("Invalid catalog reference");
  const option = catalog[category].find((entry) => entry.id === id);
  if (!option) throw new Error("Catalog option not found");
  return resolveCatalogValue(catalog, category, value)?.id === id || value.trim().toLowerCase() === option.label.trim().toLowerCase();
}

/** Called only by the freshly authenticated removal flow. Every page must succeed. */
export async function hasCatalogOptionUsage(teacherId: string, catalog: CatalogOptions, category: CatalogCategory, id: string): Promise<boolean> {
  if (!teacherId || !catalog[category].some((option) => option.id === id)) throw new Error("Catalog usage scope required");
  const checks = CATALOG_USAGE_SOURCES[category].map(async ({ table, field }) => {
    let cursor: string | undefined;
    const pageSize = 200;
    for (;;) {
      let query = supabase.from(table).select(`id,${field}`).eq("teacher_id", teacherId).order("id", { ascending: true }).limit(pageSize);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Incomplete catalog usage read");
      for (const row of data) {
        if (!row || typeof row.id !== "string" || !(field in row)) throw new Error("Incomplete catalog usage row");
        if (matchesCatalogUsage(catalog, category, id, row[field])) return true;
      }
      if (data.length === 0) return false;
      // Continue even for short pages: API row caps must not hide later history.
      const next: unknown = data[data.length - 1]?.id;
      if (typeof next !== "string" || (cursor && next <= cursor)) throw new Error("Incomplete catalog usage pagination");
      cursor = next;
    }
  });
  // A failed source never proves non-use. All sources must be readable.
  const results = await Promise.all(checks);
  return results.some(Boolean);
}
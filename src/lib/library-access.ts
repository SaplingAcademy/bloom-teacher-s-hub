import { canAccessFeature, type SubscriptionPlan } from "@/lib/plans";
import { supabase } from "@/lib/supabase";

export type LibraryAvailability = "available" | "soon";
/** availability is independent of access_level; rows without it (older RPC replies) are "available". */
export interface LibraryClassification { resource_id: string; access_level: SubscriptionPlan; availability?: LibraryAvailability }
export const LIBRARY_ACCESS_QUERY_KEY = (userId: string | undefined) => ["library-access", userId] as const;
export const ADMIN_LIBRARY_QUERY_KEY = ["admin", "library-resources"] as const;

/** Only a successful complete classification read establishes a new ID as Free. */
export function resourceAccessLevel(id: string, rows: LibraryClassification[] | undefined): SubscriptionPlan | null {
  if (!rows) return null;
  return rows.find((row) => row.resource_id === id)?.access_level ?? "free";
}

/** Same rule as the access level: unknown until a successful read; then a missing row is available. */
export function resourceAvailability(id: string, rows: LibraryClassification[] | undefined): LibraryAvailability | null {
  if (!rows) return null;
  return rows.find((row) => row.resource_id === id)?.availability ?? "available";
}

export function canUseLibraryResource(level: SubscriptionPlan | null, plan: SubscriptionPlan | null, admin: boolean): boolean {
  if (level === "free") return true;
  return canAccessFeature(plan, admin, "library_full");
}

export function parseLibraryClassifications(data: unknown): LibraryClassification[] {
  if (!Array.isArray(data)) throw new Error("INVALID_LIBRARY_CLASSIFICATIONS");
  return data.map((row: unknown) => {
    if (!row || typeof row !== "object" || !("resource_id" in row) || !("access_level" in row) ||
      typeof row.resource_id !== "string" || (row.access_level !== "free" && row.access_level !== "pro")) {
      throw new Error("INVALID_LIBRARY_CLASSIFICATIONS");
    }
    const availability = "availability" in row ? row.availability : "available";
    if (availability !== "available" && availability !== "soon") throw new Error("INVALID_LIBRARY_CLASSIFICATIONS");
    return { resource_id: row.resource_id, access_level: row.access_level, availability };
  });
}

export async function fetchLibraryClassifications(): Promise<LibraryClassification[]> {
  const rows: LibraryClassification[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("library_resource_access")
      .select("resource_id, access_level, availability").order("resource_id").range(from, from + pageSize - 1);
    if (error) throw error;
    const page = parseLibraryClassifications(data);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

export async function setLibraryClassification(resourceId: string, level: SubscriptionPlan): Promise<LibraryClassification> {
  const { data, error } = await supabase.rpc("set_library_resource_access", { _resource_id: resourceId, _access_level: level });
  if (error) throw error;
  const rows = parseLibraryClassifications(data);
  const saved = rows.find((row) => row.resource_id === resourceId);
  if (!saved || saved.access_level !== level) throw new Error("LIBRARY_SAVE_READBACK_FAILED");
  return saved;
}

/** Admin only (the RPC re-checks super_admin); keeps the Free/Premium classification untouched. */
export async function setLibraryAvailability(resourceId: string, availability: LibraryAvailability): Promise<LibraryClassification> {
  const { data, error } = await supabase.rpc("set_library_resource_availability", { _resource_id: resourceId, _availability: availability });
  if (error) throw error;
  const saved = parseLibraryClassifications(data).find((row) => row.resource_id === resourceId);
  if (!saved || saved.availability !== availability) throw new Error("LIBRARY_SAVE_READBACK_FAILED");
  return saved;
}

export function isLibrarySoonError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("LIBRARY_RESOURCE_SOON");
}

export function isLibraryPremiumError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("LIBRARY_PREMIUM_REQUIRED");
}
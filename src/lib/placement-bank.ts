import { supabase } from "@/lib/supabase";
import {
  CEFR_LEVELS, itemTypesForSkill,
  type CefrLevel, type ItemPayload, type PlacementItemType, type PlacementSkill, type TemplateStatus,
} from "@/lib/placement";

/**
 * Bloom Placement — Question Bank (reusable questions).
 * Schema: docs/migrations/20261128120000_placement_question_bank_manual.sql (manual SQL).
 * teacher_id NULL = Bloom official bank (written only by super_admin; teachers see published ones);
 * otherwise the teacher's own questions. Everything goes through the session client under RLS, and
 * batch inclusion uses the atomic placement_import_bank_items RPC (SECURITY INVOKER), so the
 * database keeps enforcing Pro access, ownership and frozen published templates.
 */

export type BankScope = "official" | "mine";

export interface BankItem {
  id: string;
  teacher_id: string | null;
  source_bank_item_id: string | null;
  skill: PlacementSkill;
  topic: string;
  subskill: string | null;
  item_type: PlacementItemType;
  level: CefrLevel;
  is_screening: boolean;
  points: number;
  estimated_seconds: number | null;
  tags: string[];
  prompt: { text?: string; passage?: string } & Record<string, unknown>;
  options: string[] | null;
  answer_key: Record<string, unknown> | null;
  rubric: Record<string, unknown> | null;
  media: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  status: TemplateStatus;
  created_at: string;
  updated_at: string;
}

const BANK_COLUMNS = "id,teacher_id,source_bank_item_id,skill,topic,subskill,item_type,level,is_screening,points,estimated_seconds,tags,prompt,options,answer_key,rubric,media,metadata,status,created_at,updated_at";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

type DbError = { code?: string; message?: string } | null | undefined;

export const PLACEMENT_BANK_NOT_DEPLOYED = "PLACEMENT_BANK_NOT_DEPLOYED";

/** The bank migration is not applied yet (table, column or RPC missing): the library stays unavailable. */
export function isBankNotDeployed(error: DbError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" || error.code === "42883"
    || (error.code === "42703" && message.includes("source_bank_item_id"))
    || (/placement_bank_items|placement_import_bank_items|source_bank_item_id/.test(message) && /does not exist|could not find/i.test(message));
}

export type BankImportErrorKind = "notDeployed" | "locked" | "unavailable" | "denied" | "failed";

/** Maps a failed batch inclusion to a teacher-facing reason (markers raised by the RPC). */
export function bankImportErrorKind(error: unknown): BankImportErrorKind {
  const message = error instanceof Error ? error.message : (error as DbError)?.message ?? "";
  if (message === PLACEMENT_BANK_NOT_DEPLOYED) return "notDeployed";
  if (message.includes("PLACEMENT_TEMPLATE_LOCKED")) return "locked";
  if (message.includes("PLACEMENT_BANK_ITEM_UNAVAILABLE") || message.includes("PLACEMENT_BANK_SKILL_MISMATCH")) return "unavailable";
  if (message.includes("PLACEMENT_ACCESS_DENIED") || message.includes("PLACEMENT_SECTION_NOT_FOUND")) return "denied";
  return "failed";
}

function check(error: DbError): void {
  if (!error) return;
  if (isBankNotDeployed(error)) throw new Error(PLACEMENT_BANK_NOT_DEPLOYED);
  throw Object.assign(new Error(error.message || "placement_bank_request_failed"), { code: error.code });
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

export interface BankFilters {
  levels: CefrLevel[];
  topic: string | null;
  type: PlacementItemType | null;
  search: string;
}

export const EMPTY_BANK_FILTERS: BankFilters = { levels: [], topic: null, type: null, search: "" };

const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Items shown in the library: always only the section's skill (incompatible questions never
 * appear), then level / topic / type filters and a text search over prompt, passage, options,
 * topic, subskill and tags. Sorted by level, topic and prompt.
 */
export function filterBankItems(items: readonly BankItem[], skill: PlacementSkill, filters: BankFilters): BankItem[] {
  const query = normalize(filters.search);
  return items
    .filter((item) => item.skill === skill)
    .filter((item) => filters.levels.length === 0 || filters.levels.includes(item.level))
    .filter((item) => !filters.topic || item.topic === filters.topic)
    .filter((item) => !filters.type || item.item_type === filters.type)
    .filter((item) => {
      if (!query) return true;
      const haystack = [item.prompt?.text, item.prompt?.passage, item.topic, item.subskill, ...(item.options ?? []), ...(item.tags ?? [])]
        .filter((v): v is string => typeof v === "string").map(normalize).join(" \u0000 ");
      return haystack.includes(query);
    })
    .sort((a, b) => CEFR_LEVELS.indexOf(a.level) - CEFR_LEVELS.indexOf(b.level)
      || a.topic.localeCompare(b.topic) || String(a.prompt?.text ?? "").localeCompare(String(b.prompt?.text ?? "")));
}

/** Distinct topics of the section's skill, for the topic filter. */
export function bankTopics(items: readonly BankItem[], skill: PlacementSkill): string[] {
  return [...new Set(items.filter((i) => i.skill === skill).map((i) => i.topic))].sort((a, b) => a.localeCompare(b));
}

/** Only published questions can be included in a placement (same rule as the RPC). */
export function isBankItemSelectable(item: BankItem, alreadyAdded: ReadonlySet<string>): boolean {
  return item.status === "published" && !alreadyAdded.has(item.id);
}

/** Toggles one id, keeping the selection order (the import keeps that order in the section). */
export function toggleSelection(selected: readonly string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
}

export type BankMetaError = "topic" | "subskill";

export function validateBankMeta(topic: string, subskill: string): BankMetaError[] {
  const errors: BankMetaError[] = [];
  const t = topic.trim();
  if (t.length < 1 || t.length > 80) errors.push("topic");
  if (subskill.trim().length > 80) errors.push("subskill");
  return errors;
}

export interface BankMeta {
  topic: string;
  subskill: string;
  /** Only super_admin chooses this (official bank); teachers' own questions are always usable. */
  published: boolean;
}

/** Row for placement_bank_items from a validated editor payload. Time limits belong to a placement, not to the bank. */
export function bankRowFrom(skill: PlacementSkill, payload: ItemPayload, meta: BankMeta) {
  const metadata = { ...(payload.metadata ?? {}) };
  delete metadata.time_limit_seconds;
  return {
    skill,
    topic: meta.topic.trim(),
    subskill: meta.subskill.trim() || null,
    item_type: payload.item_type,
    level: payload.level,
    is_screening: payload.is_screening,
    points: payload.points,
    estimated_seconds: payload.estimated_seconds,
    prompt: payload.prompt,
    options: payload.options,
    answer_key: payload.answer_key,
    rubric: payload.rubric,
    metadata,
    status: meta.published ? "published" : "draft",
  };
}

/** A personal, independent copy of an official question; the original is only read. */
export function personalCopyOf(item: BankItem) {
  return {
    source_bank_item_id: item.id,
    skill: item.skill, topic: item.topic, subskill: item.subskill, item_type: item.item_type, level: item.level,
    is_screening: item.is_screening, points: item.points, estimated_seconds: item.estimated_seconds, tags: item.tags ?? [],
    prompt: item.prompt, options: item.options, answer_key: item.answer_key, rubric: item.rubric, media: item.media,
    metadata: item.metadata ?? {}, status: "published" as const,
  };
}

/** Types the library can filter by for a skill (mirrors the database rule). */
export function bankTypesForSkill(skill: PlacementSkill): PlacementItemType[] {
  return itemTypesForSkill(skill);
}

// ---------------------------------------------------------------------------
// Data access (session client, RLS)
// ---------------------------------------------------------------------------

/**
 * Questions of one skill. Official: teachers receive only published rows (RLS); super_admin also
 * receives drafts, shown as not selectable. Mine: the teacher's own, without archived ones.
 */
export async function fetchBankItems(scope: BankScope, skill: PlacementSkill, ownerId: string): Promise<BankItem[]> {
  let query = supabase.from("placement_bank_items").select(BANK_COLUMNS).eq("skill", skill);
  query = scope === "official" ? query.is("teacher_id", null) : query.eq("teacher_id", ownerId).neq("status", "archived");
  const { data, error } = await query.order("level_rank").order("topic").limit(1000);
  check(error);
  return (data ?? []) as BankItem[];
}

/** Bank questions already copied into this section (to mark them and avoid duplicates). */
export async function fetchSectionBankSources(sectionId: string): Promise<string[]> {
  const { data, error } = await supabase.from("placement_items").select("source_bank_item_id").eq("section_id", sectionId).not("source_bank_item_id", "is", null);
  check(error);
  return ((data ?? []) as { source_bank_item_id: string }[]).map((r) => r.source_bank_item_id);
}

export interface BankImportResult { inserted: number; item_ids: string[]; skipped_ids: string[] }

/** Atomic batch inclusion: all selected questions are copied, or none (server-side validation). */
export async function importBankItems(sectionId: string, ids: readonly string[]): Promise<BankImportResult> {
  const { data, error } = await supabase.rpc("placement_import_bank_items", { p_section_id: sectionId, p_bank_item_ids: [...ids] });
  check(error);
  const result = (data ?? {}) as Partial<BankImportResult>;
  return { inserted: Number(result.inserted) || 0, item_ids: result.item_ids ?? [], skipped_ids: result.skipped_ids ?? [] };
}

export async function createBankItem(row: ReturnType<typeof bankRowFrom>, official: boolean): Promise<void> {
  // Official questions have no owner (teacher_id NULL); RLS accepts them only from super_admin.
  const payload: Record<string, unknown> = { ...row };
  if (official) payload.teacher_id = null;
  const { error } = await supabase.from("placement_bank_items").insert(payload);
  check(error);
}

export async function updateBankItem(id: string, row: ReturnType<typeof bankRowFrom>): Promise<void> {
  const { skill: _skill, ...changes } = row;
  const { error } = await supabase.from("placement_bank_items").update(changes).eq("id", id);
  check(error);
}

export async function deleteBankItem(id: string): Promise<void> {
  const { error } = await supabase.from("placement_bank_items").delete().eq("id", id);
  check(error);
}

export async function duplicateBankItem(item: BankItem): Promise<void> {
  const { error } = await supabase.from("placement_bank_items").insert(personalCopyOf(item));
  check(error);
}

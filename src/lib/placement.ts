import { supabase } from "@/lib/supabase";

/**
 * Bloom Placement — teacher-side content (templates, sections, items).
 * Schema: docs/migrations/20261121120000_placement_templates_manual.sql (manual SQL).
 * Every read/write goes through the session client under RLS: the database enforces Pro access
 * (placement_access_allowed), owner isolation, read-only system defaults and frozen published/
 * archived versions (PLACEMENT_TEMPLATE_LOCKED). This module never bypasses those rules.
 */

export const PLACEMENT_SKILLS = ["grammar", "vocabulary", "reading", "listening", "speaking", "writing"] as const;
export type PlacementSkill = (typeof PLACEMENT_SKILLS)[number];
export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];
export type TemplateStatus = "draft" | "published" | "archived";

export const PLACEMENT_ITEM_TYPES = [
  "single_choice", "multiple_choice", "true_false", "gap_fill", "matching", "ordering", "open_text", "oral_response",
] as const;
export type PlacementItemType = (typeof PLACEMENT_ITEM_TYPES)[number];

/**
 * Formats the editor can persist and validate in this stage. matching/ordering need dedicated
 * editors and Listening needs audio upload (later stages): they are shown as unavailable.
 */
export const EDITABLE_ITEM_TYPES: readonly PlacementItemType[] = [
  "single_choice", "multiple_choice", "true_false", "gap_fill", "open_text", "oral_response",
];

/** Item types allowed per skill (mirrors placement_items_skill_type_check). */
export function itemTypesForSkill(skill: PlacementSkill): PlacementItemType[] {
  if (skill === "speaking") return ["oral_response"];
  if (skill === "writing") return ["open_text"];
  return ["single_choice", "multiple_choice", "true_false", "gap_fill", "matching", "ordering"];
}

/** Listening items need an audio file; uploads arrive in a later stage. */
export function skillAcceptsNewItems(skill: PlacementSkill): boolean {
  return skill !== "listening";
}

export type TimingMode = "none" | "test" | "skill" | "item";

export interface PlacementTemplate {
  id: string;
  teacher_id: string | null;
  source_template_id: string | null;
  title: string;
  description: string | null;
  status: TemplateStatus;
  settings: Record<string, unknown>;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PlacementSection {
  id: string;
  template_id: string;
  skill: PlacementSkill;
  position: number;
  title: string | null;
  instructions: string | null;
  enabled: boolean;
  settings: Record<string, unknown>;
}

export interface PlacementItem {
  id: string;
  template_id: string;
  section_id: string;
  skill: PlacementSkill;
  position: number;
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
  active: boolean;
}

const TEMPLATE_COLUMNS = "id,teacher_id,source_template_id,title,description,status,settings,version,created_at,updated_at";
const SECTION_COLUMNS = "id,template_id,skill,position,title,instructions,enabled,settings";
const ITEM_COLUMNS = "id,template_id,section_id,skill,position,item_type,level,is_screening,points,estimated_seconds,tags,prompt,options,answer_key,rubric,media,metadata,active";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

type DbError = { code?: string; message?: string } | null | undefined;

export const PLACEMENT_NOT_DEPLOYED = "PLACEMENT_NOT_DEPLOYED";

/** The manual migration is not applied yet (tables missing): the module stays unavailable. */
export function isPlacementNotDeployed(error: DbError): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "42P01" || error.code === "PGRST205" || message === PLACEMENT_NOT_DEPLOYED
    || (/placement_(templates|sections|items)/.test(message) && /does not exist|could not find/i.test(message));
}

/** Raised by the database trigger that freezes published/archived templates. */
export function isPlacementLocked(error: unknown): boolean {
  const message = error instanceof Error ? error.message : (error as DbError)?.message ?? "";
  return message.includes("PLACEMENT_TEMPLATE_LOCKED");
}

function check(error: DbError): void {
  if (!error) return;
  if (isPlacementNotDeployed(error)) throw new Error(PLACEMENT_NOT_DEPLOYED);
  throw Object.assign(new Error(error.message || "placement_request_failed"), { code: error.code });
}

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

export interface TemplateDraftInput {
  title: string;
  description: string;
  skills: PlacementSkill[];
  timing: TimingMode;
  testMinutes: number | null;
}

export type TemplateDraftError = "title" | "skills" | "testMinutes";

export function validateTemplateDraft(input: TemplateDraftInput): TemplateDraftError[] {
  const errors: TemplateDraftError[] = [];
  const title = input.title.trim();
  if (title.length < 1 || title.length > 160) errors.push("title");
  const unique = new Set(input.skills);
  if (unique.size < 1 || unique.size !== input.skills.length || input.skills.some((s) => !PLACEMENT_SKILLS.includes(s))) errors.push("skills");
  if (input.timing === "test" && !(input.testMinutes && Number.isInteger(input.testMinutes) && input.testMinutes >= 1 && input.testMinutes <= 600)) errors.push("testMinutes");
  return errors;
}

/** settings JSON of the template for the chosen timing mode (only what this stage defines). */
export function templateSettingsFor(timing: TimingMode, testMinutes: number | null, previous: Record<string, unknown> = {}): Record<string, unknown> {
  const next: Record<string, unknown> = { ...previous, timing: { mode: timing } };
  if (timing === "test" && testMinutes) next.time_limit_minutes = testMinutes;
  else delete next.time_limit_minutes;
  return next;
}

export function timingOf(template: Pick<PlacementTemplate, "settings">): { mode: TimingMode; testMinutes: number | null } {
  const raw = (template.settings?.timing as { mode?: string } | undefined)?.mode;
  const mode: TimingMode = raw === "test" || raw === "skill" || raw === "item" ? raw : "none";
  const minutes = Number(template.settings?.time_limit_minutes);
  return { mode, testMinutes: Number.isFinite(minutes) && minutes > 0 ? minutes : null };
}

export interface ItemDraft {
  item_type: PlacementItemType;
  level: CefrLevel;
  text: string;
  passage: string;
  options: string[];
  correct: number[];
  trueFalse: boolean | null;
  accepted: string[];
  rubric: string;
  points: number;
  is_screening: boolean;
  estimated_seconds: number | null;
  timeLimitSeconds: number | null;
}

export type ItemDraftError =
  | "type" | "level" | "text" | "options" | "correct" | "trueFalse" | "accepted" | "points" | "estimated" | "timeLimit" | "screening";

export function emptyItemDraft(skill: PlacementSkill): ItemDraft {
  const type = skill === "speaking" ? "oral_response" : skill === "writing" ? "open_text" : "single_choice";
  return {
    item_type: type, level: "A1", text: "", passage: "", options: ["", ""], correct: [], trueFalse: null,
    accepted: [""], rubric: "", points: 1, is_screening: false, estimated_seconds: null, timeLimitSeconds: null,
  };
}

export type ItemDraftSource = Pick<PlacementItem, "item_type" | "level" | "prompt" | "options" | "answer_key" | "rubric" | "points" | "is_screening" | "estimated_seconds" | "metadata">;

/** Rebuilds the editor draft from a saved question (placement item or bank question). */
export function itemDraftFrom(item: ItemDraftSource): ItemDraft {
  const key = item.answer_key ?? {};
  return {
    item_type: item.item_type,
    level: item.level,
    text: String(item.prompt?.text ?? ""),
    passage: String(item.prompt?.passage ?? ""),
    options: Array.isArray(item.options) && item.options.length >= 2 ? item.options.map(String) : ["", ""],
    correct: Array.isArray(key.correct) ? (key.correct as unknown[]).map(Number).filter(Number.isInteger) : [],
    trueFalse: typeof key.correct === "boolean" ? key.correct : null,
    accepted: Array.isArray(key.accepted) && key.accepted.length ? (key.accepted as unknown[]).map(String) : [""],
    rubric: String((item.rubric as { guidance?: string } | null)?.guidance ?? ""),
    points: Number(item.points) || 1,
    is_screening: item.is_screening,
    estimated_seconds: item.estimated_seconds,
    timeLimitSeconds: Number.isFinite(Number(item.metadata?.time_limit_seconds)) && Number(item.metadata?.time_limit_seconds) > 0
      ? Number(item.metadata.time_limit_seconds) : null,
  };
}

export type ItemPayload = Pick<PlacementItem, "item_type" | "level" | "is_screening" | "points" | "estimated_seconds" | "prompt" | "options" | "answer_key" | "rubric" | "metadata">;

/**
 * Validates an editor draft against the same rules as the database constraints and returns the
 * exact payload to persist. Answer keys exist only for objective items; Speaking/Writing are manual.
 */
export function buildItemPayload(skill: PlacementSkill, draft: ItemDraft, metadata: Record<string, unknown> = {}):
  { ok: true; payload: ItemPayload } | { ok: false; errors: ItemDraftError[] } {
  const errors: ItemDraftError[] = [];
  const type = draft.item_type;
  if (!itemTypesForSkill(skill).includes(type) || !EDITABLE_ITEM_TYPES.includes(type)) errors.push("type");
  if (!CEFR_LEVELS.includes(draft.level)) errors.push("level");
  const text = draft.text.trim();
  if (!text || text.length > 4000) errors.push("text");
  if (!(draft.points > 0 && draft.points <= 100)) errors.push("points");
  if (draft.estimated_seconds !== null && !(Number.isInteger(draft.estimated_seconds) && draft.estimated_seconds >= 5 && draft.estimated_seconds <= 3600)) errors.push("estimated");
  if (draft.timeLimitSeconds !== null && !(Number.isInteger(draft.timeLimitSeconds) && draft.timeLimitSeconds >= 5 && draft.timeLimitSeconds <= 3600)) errors.push("timeLimit");
  const manual = type === "open_text" || type === "oral_response";
  if (draft.is_screening && manual) errors.push("screening");

  let options: string[] | null = null;
  let answer_key: Record<string, unknown> | null = null;
  if (type === "single_choice" || type === "multiple_choice") {
    options = draft.options.map((o) => o.trim());
    if (options.length < 2 || options.length > 8 || options.some((o) => !o) || new Set(options).size !== options.length) errors.push("options");
    const correct = [...new Set(draft.correct)].filter((i) => i >= 0 && i < options!.length).sort((a, b) => a - b);
    if (type === "single_choice" ? correct.length !== 1 : correct.length < 1) errors.push("correct");
    answer_key = { correct };
  } else if (type === "true_false") {
    if (draft.trueFalse === null) errors.push("trueFalse");
    answer_key = { correct: draft.trueFalse };
  } else if (type === "gap_fill") {
    const accepted = [...new Set(draft.accepted.map((a) => a.trim()).filter(Boolean))];
    if (accepted.length < 1 || accepted.length > 10) errors.push("accepted");
    answer_key = { accepted };
  }
  if (errors.length) return { ok: false, errors };

  const prompt: ItemPayload["prompt"] = { text };
  if (skill === "reading" && draft.passage.trim()) prompt.passage = draft.passage.trim();
  const rubric = manual && draft.rubric.trim() ? { guidance: draft.rubric.trim() } : null;
  const nextMetadata = { ...metadata };
  if (draft.timeLimitSeconds) nextMetadata.time_limit_seconds = draft.timeLimitSeconds;
  else delete nextMetadata.time_limit_seconds;
  return {
    ok: true,
    payload: {
      item_type: type, level: draft.level, is_screening: draft.is_screening, points: draft.points,
      estimated_seconds: draft.estimated_seconds, prompt, options, answer_key: manual ? null : answer_key,
      rubric, metadata: nextMetadata,
    },
  };
}

/** Templates visible to the teacher, split into Bloom defaults and own templates. */
export function splitTemplates(templates: readonly PlacementTemplate[]) {
  return {
    system: templates.filter((t) => t.teacher_id === null),
    mine: templates.filter((t) => t.teacher_id !== null),
  };
}

/** Actions allowed by status and ownership (the database enforces the same rules). */
export function templateActions(template: PlacementTemplate, opts: { ownerId: string | null; isSuperAdmin: boolean }) {
  const own = template.teacher_id !== null && template.teacher_id === opts.ownerId;
  const manage = own || (template.teacher_id === null && opts.isSuperAdmin);
  return {
    edit: manage && template.status === "draft",
    publish: manage && template.status === "draft",
    archive: manage && template.status === "published",
    republish: manage && template.status === "archived",
    remove: manage && template.status !== "published",
    duplicate: template.status !== "draft" || own,
  };
}

// ---------------------------------------------------------------------------
// Data access (session client, RLS)
// ---------------------------------------------------------------------------

export async function fetchPlacementTemplates(): Promise<PlacementTemplate[]> {
  const { data, error } = await supabase.from("placement_templates").select(TEMPLATE_COLUMNS).order("updated_at", { ascending: false });
  check(error);
  return (data ?? []) as PlacementTemplate[];
}

export interface PlacementTemplateDetail {
  template: PlacementTemplate;
  sections: PlacementSection[];
  items: PlacementItem[];
}

export async function fetchPlacementTemplate(id: string): Promise<PlacementTemplateDetail | null> {
  const [t, s, i] = await Promise.all([
    supabase.from("placement_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("placement_sections").select(SECTION_COLUMNS).eq("template_id", id).order("position"),
    supabase.from("placement_items").select(ITEM_COLUMNS).eq("template_id", id).order("position"),
  ]);
  check(t.error); check(s.error); check(i.error);
  if (!t.data) return null;
  return { template: t.data as PlacementTemplate, sections: (s.data ?? []) as PlacementSection[], items: (i.data ?? []) as PlacementItem[] };
}

/** Creates a draft template and one section per selected skill, in the chosen order. */
export async function createPlacementTemplate(input: TemplateDraftInput): Promise<string> {
  const { data, error } = await supabase.from("placement_templates")
    .insert({ title: input.title.trim(), description: input.description.trim() || null, settings: templateSettingsFor(input.timing, input.testMinutes) })
    .select("id").single();
  check(error);
  const id = (data as { id: string }).id;
  const sections = input.skills.map((skill, index) => ({ template_id: id, skill, position: index + 1 }));
  const res = await supabase.from("placement_sections").insert(sections);
  if (res.error) {
    // Do not leave a half-created draft behind (drafts can be deleted; the cascade is in the DB).
    await supabase.from("placement_templates").delete().eq("id", id);
    check(res.error);
  }
  return id;
}

export async function updatePlacementTemplate(id: string, patch: { title?: string; description?: string | null; settings?: Record<string, unknown> }): Promise<void> {
  const { error } = await supabase.from("placement_templates").update(patch).eq("id", id);
  check(error);
}

/**
 * Applies the selected skills and their order to a draft: removes unselected sections (and their
 * items, by cascade), adds new ones and renumbers positions in ONE upsert statement, so the
 * deferred unique (template_id, position) constraint is checked once.
 */
export async function savePlacementSkills(templateId: string, current: PlacementSection[], ordered: PlacementSkill[]): Promise<void> {
  const removed = current.filter((s) => !ordered.includes(s.skill)).map((s) => s.id);
  if (removed.length) {
    const del = await supabase.from("placement_sections").delete().in("id", removed);
    check(del.error);
  }
  const rows = ordered.map((skill, index) => {
    const existing = current.find((s) => s.skill === skill);
    return existing
      ? { id: existing.id, template_id: templateId, skill, position: index + 1 }
      : { template_id: templateId, skill, position: index + 1 };
  });
  const keep = rows.filter((r) => "id" in r);
  const add = rows.filter((r) => !("id" in r));
  if (keep.length) {
    const up = await supabase.from("placement_sections").upsert(keep, { onConflict: "id" });
    check(up.error);
  }
  if (add.length) {
    const ins = await supabase.from("placement_sections").insert(add);
    check(ins.error);
  }
}

export async function updateSectionSettings(sectionId: string, settings: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from("placement_sections").update({ settings }).eq("id", sectionId);
  check(error);
}

export async function createPlacementItem(section: PlacementSection, position: number, payload: ItemPayload): Promise<void> {
  const { error } = await supabase.from("placement_items").insert({
    template_id: section.template_id, section_id: section.id, skill: section.skill, position, ...payload,
  });
  check(error);
}

export async function updatePlacementItem(itemId: string, payload: ItemPayload): Promise<void> {
  const { error } = await supabase.from("placement_items").update(payload).eq("id", itemId);
  check(error);
}

export async function deletePlacementItem(itemId: string): Promise<void> {
  const { error } = await supabase.from("placement_items").delete().eq("id", itemId);
  check(error);
}

export async function setPlacementTemplateStatus(id: string, status: "published" | "archived"): Promise<void> {
  const { error } = await supabase.from("placement_templates").update({ status }).eq("id", id);
  check(error);
}

export async function deletePlacementTemplate(id: string): Promise<void> {
  const { error } = await supabase.from("placement_templates").delete().eq("id", id);
  check(error);
}

/**
 * Duplicates a visible template into a NEW draft owned by the teacher (Bloom default copy or a new
 * version of one's own template). The original is only read; nothing bypasses the frozen-version
 * rules. On a failure halfway, the new draft is removed.
 */
export async function duplicatePlacementTemplate(sourceId: string, ownerId: string, titleSuffix: string): Promise<string> {
  const detail = await fetchPlacementTemplate(sourceId);
  if (!detail) throw new Error("placement_template_not_found");
  const { template, sections, items } = detail;
  const ownVersion = template.teacher_id === ownerId;
  // Question Bank origin (column added by the bank migration). Read separately so duplication keeps
  // working when that migration is not applied yet; copied only when present.
  const bankSources = new Map<string, string>();
  if (items.length) {
    const sourceRead = await supabase.from("placement_items").select("id,source_bank_item_id").eq("template_id", sourceId);
    if (!sourceRead.error) {
      for (const row of (sourceRead.data ?? []) as { id: string; source_bank_item_id: string | null }[]) {
        if (row.source_bank_item_id) bankSources.set(row.id, row.source_bank_item_id);
      }
    }
  }
  const { data, error } = await supabase.from("placement_templates").insert({
    title: `${template.title}${titleSuffix}`.slice(0, 160),
    description: template.description,
    settings: template.settings ?? {},
    source_template_id: template.id,
    version: ownVersion ? template.version + 1 : 1,
  }).select("id").single();
  check(error);
  const newId = (data as { id: string }).id;
  try {
    const sectionMap = new Map<string, string>();
    if (sections.length) {
      const { data: inserted, error: sErr } = await supabase.from("placement_sections").insert(sections.map((s) => ({
        template_id: newId, skill: s.skill, position: s.position, title: s.title, instructions: s.instructions, enabled: s.enabled, settings: s.settings ?? {},
      }))).select("id,skill");
      check(sErr);
      for (const row of (inserted ?? []) as { id: string; skill: string }[]) {
        const original = sections.find((s) => s.skill === row.skill);
        if (original) sectionMap.set(original.id, row.id);
      }
    }
    if (items.length) {
      const { error: iErr } = await supabase.from("placement_items").insert(items.map((item) => ({
        template_id: newId, section_id: sectionMap.get(item.section_id), skill: item.skill, position: item.position,
        item_type: item.item_type, level: item.level, is_screening: item.is_screening, points: item.points,
        estimated_seconds: item.estimated_seconds, tags: item.tags ?? [], prompt: item.prompt, options: item.options,
        answer_key: item.answer_key, rubric: item.rubric, media: item.media, metadata: item.metadata ?? {}, active: item.active,
        ...(bankSources.has(item.id) ? { source_bank_item_id: bankSources.get(item.id) } : {}),
      })));
      check(iErr);
    }
  } catch (copyError) {
    await supabase.from("placement_templates").delete().eq("id", newId);
    throw copyError;
  }
  return newId;
}

/** Number of skills (sections) per visible template, for the list cards. */
export async function fetchPlacementSkillCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("placement_sections").select("template_id");
  check(error);
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { template_id: string }[]) counts[row.template_id] = (counts[row.template_id] ?? 0) + 1;
  return counts;
}

/** Can a draft be published? Every skill needs at least one active question (UI rule of this stage). */
export function canPublishTemplate(sections: readonly PlacementSection[], items: readonly PlacementItem[]): boolean {
  return sections.length > 0 && sections.every((s) => items.some((i) => i.section_id === s.id && i.active));
}

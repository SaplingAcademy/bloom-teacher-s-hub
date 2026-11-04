import type { Lead } from "@/lib/automation-engine";

/** Editable lead profile fields. Empty strings mean "not provided" and persist as NULL. */
export interface LeadProfileDraft {
  full_name: string;
  phone: string;
  email: string;
  language_studied: string;
  level: string;
  focus: string;
  modality: string;
  source: string;
  campaign: string;
  tags: string;
  preferred_schedule: string;
  package_id: string;
  potential_value: string;
  notes: string;
  lost_reason: string;
}

const TEXT_FIELDS = [
  "full_name",
  "phone",
  "email",
  "language_studied",
  "level",
  "focus",
  "modality",
  "source",
  "campaign",
  "preferred_schedule",
  "package_id",
  "notes",
  "lost_reason",
] as const;

export function parseLeadTags(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim();
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  }
  return out;
}

/** Builds a draft from the stored lead without inventing defaults for empty fields. */
export function leadToProfileDraft(lead: Lead): LeadProfileDraft {
  const draft = {} as LeadProfileDraft;
  for (const key of TEXT_FIELDS) {
    const value = (lead as any)[key];
    draft[key] = typeof value === "string" ? value : "";
  }
  draft.tags = Array.isArray(lead.tags) ? lead.tags.join(", ") : "";
  draft.potential_value =
    lead.potential_value === null || lead.potential_value === undefined ? "" : String(lead.potential_value);
  return draft;
}

export type LeadProfileError = "nameRequired" | "invalidValue";

export function validateLeadProfileDraft(draft: LeadProfileDraft): LeadProfileError | null {
  if (!draft.full_name.trim()) return "nameRequired";
  const raw = draft.potential_value.trim().replace(",", ".");
  if (raw && (!Number.isFinite(Number(raw)) || Number(raw) < 0)) return "invalidValue";
  return null;
}

/** Returns only changed columns; blanks become NULL and untouched fields are never sent. */
export function buildLeadProfilePatch(lead: Lead, draft: LeadProfileDraft): Record<string, unknown> {
  const original = leadToProfileDraft(lead);
  const patch: Record<string, unknown> = {};
  for (const key of TEXT_FIELDS) {
    const next = draft[key].trim();
    if (next !== original[key].trim()) patch[key] = next === "" ? null : next;
  }
  const nextTags = parseLeadTags(draft.tags);
  if (nextTags.join("\u0000") !== parseLeadTags(original.tags).join("\u0000")) {
    patch.tags = nextTags.length ? nextTags : null;
  }
  const rawValue = draft.potential_value.trim().replace(",", ".");
  const nextValue = rawValue === "" ? null : Number(rawValue);
  const prevValue = lead.potential_value ?? null;
  if (nextValue !== (prevValue === null ? null : Number(prevValue))) patch.potential_value = nextValue;
  return patch;
}

/** Empty draft for new leads: no pedagogical value is preselected. */
export function emptyLeadProfileDraft(): LeadProfileDraft {
  return {
    full_name: "", phone: "", email: "", language_studied: "", level: "", focus: "", modality: "",
    source: "whatsapp", campaign: "", tags: "", preferred_schedule: "", package_id: "",
    potential_value: "", notes: "", lost_reason: "",
  };
}

/** Insert payload for a new lead; blank fields become NULL. */
export function buildNewLeadInsert(teacherId: string, draft: LeadProfileDraft): Record<string, unknown> {
  const text = (v: string) => (v.trim() === "" ? null : v.trim());
  const rawValue = draft.potential_value.trim().replace(",", ".");
  const tags = parseLeadTags(draft.tags);
  return {
    teacher_id: teacherId,
    full_name: draft.full_name.trim(),
    email: text(draft.email),
    phone: text(draft.phone),
    source: text(draft.source),
    campaign: text(draft.campaign),
    tags: tags.length ? tags : null,
    language_studied: text(draft.language_studied),
    level: text(draft.level),
    focus: text(draft.focus),
    modality: text(draft.modality),
    preferred_schedule: text(draft.preferred_schedule),
    package_id: text(draft.package_id),
    potential_value: rawValue === "" ? null : Number(rawValue),
    notes: text(draft.notes),
    stage: "Novo contato",
  };
}

/** Display parts for lead cards: resolved labels only, missing fields omitted, unknown values kept. */
export function leadPedagogyParts(
  lead: Pick<Lead, "language_studied" | "level" | "focus" | "modality">,
  resolve: {
    language: (v: string) => string;
    catalog: (category: "levels" | "focuses" | "modalities", v: string) => string | null;
  },
): string[] {
  const parts: string[] = [];
  const add = (v: string | undefined | null, fn: (v: string) => string | null) => {
    if (v && v.trim()) parts.push(fn(v) || v);
  };
  add(lead.language_studied, resolve.language);
  add(lead.level, (v) => resolve.catalog("levels", v));
  add(lead.focus, (v) => resolve.catalog("focuses", v));
  add(lead.modality, (v) => resolve.catalog("modalities", v));
  return parts;
}

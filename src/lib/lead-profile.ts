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

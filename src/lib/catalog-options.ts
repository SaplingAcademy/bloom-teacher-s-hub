/** Pedagogical metadata only: languages and Private/Group are separate domains. */
export type CatalogCategory = "levels" | "focuses" | "modalities";
export type ModalityNature = "online" | "in_person" | "hybrid";

export interface CatalogOption {
  /** Immutable identity. Never derive this from a renamed label. */
  id: string;
  label: string;
  active: boolean;
  order: number;
  /** Optional historical spellings, not new values to persist. */
  aliases?: string[];
}

export interface CatalogLevelOption extends CatalogOption {}
export interface CatalogFocusOption extends CatalogOption {}
export interface CatalogModalityOption extends CatalogOption {
  nature: ModalityNature;
}

export interface CatalogOptions {
  levels: CatalogLevelOption[];
  focuses: CatalogFocusOption[];
  modalities: CatalogModalityOption[];
}

export interface CatalogValidationIssue {
  path: string;
  code: "invalid_catalog" | "invalid_category" | "invalid_option" | "duplicate_id" | "ambiguous_alias";
}

export class CatalogValidationError extends Error {
  constructor(public readonly issues: CatalogValidationIssue[]) {
    super("Invalid pedagogical catalog configuration");
    this.name = "CatalogValidationError";
  }
}

const CATEGORIES: CatalogCategory[] = ["levels", "focuses", "modalities"];

/** Fresh objects on every call: neither teachers nor callers share mutable defaults. */
export function getDefaultCatalogOptions(): CatalogOptions {
  return {
    levels: ["A1", "A2", "B1", "B2", "C1", "C2"].map((label, index) => ({
      id: label.toLowerCase(), label, active: true, order: index + 1,
    })),
    focuses: [
      ["general", "General English"],
      ["business", "Business English"],
      ["conversation", "Conversation"],
      ["exam_prep", "Exam Prep"],
      ["travel", "Travel"],
      ["kids_teens", "Kids / Teens"],
      ["ielts", "IELTS"],
      ["toefl", "TOEFL"],
      ["cambridge", "Cambridge"],
      ["other", "Other"],
    ].map(([id, label], index) => ({ id, label, active: true, order: index + 1 })),
    modalities: [
      { id: "online", label: "Online", nature: "online", active: true, order: 1 },
      { id: "in_person", label: "In person", nature: "in_person", active: true, order: 2 },
      { id: "hybrid", label: "Hybrid", nature: "hybrid", active: true, order: 3 },
    ],
  };
}

/** Explicit historical aliases survive renaming. Current labels are not identities. */
const HISTORICAL_ALIASES: Record<CatalogCategory, Record<string, string>> = {
  levels: { a1: "a1", a2: "a2", b1: "b1", b2: "b2", c1: "c1", c2: "c2" },
  focuses: {
    general: "general", "general english": "general",
    business: "business", "business english": "business",
    conversation: "conversation", "exam prep": "exam_prep", travel: "travel",
    "kids / teens": "kids_teens", ielts: "ielts", toefl: "toefl", cambridge: "cambridge", other: "other",
  },
  modalities: { online: "online", "in person": "in_person", in_person: "in_person", hybrid: "hybrid" },
};

const aliasKey = (value: string) => value.trim().toLowerCase();
const historicalAliasId = (category: CatalogCategory, key: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(HISTORICAL_ALIASES[category], key)
    ? HISTORICAL_ALIASES[category][key]
    : undefined;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const isNature = (value: unknown): value is ModalityNature =>
  value === "online" || value === "in_person" || value === "hybrid";

/** Missing active/order fields are normalized; explicitly malformed fields are rejected. */
export function validateCatalogOptions(value: unknown): CatalogValidationIssue[] {
  if (value == null) return [];
  if (!isObject(value)) return [{ path: "catalog_options", code: "invalid_catalog" }];
  const issues: CatalogValidationIssue[] = [];
  for (const category of CATEGORIES) {
    const entries = value[category];
    if (entries === undefined) continue;
    if (!Array.isArray(entries)) {
      issues.push({ path: category, code: "invalid_category" });
      continue;
    }
    const ids = new Set<string>();
    const aliases = new Map<string, string>();
    for (const [index, entry] of entries.entries()) {
      const path = `${category}.${index}`;
      if (!isObject(entry) || !isText(entry.id) || entry.id !== entry.id.trim() ||
          !isText(entry.label) ||
          (entry.active !== undefined && typeof entry.active !== "boolean") ||
          (entry.order !== undefined && (typeof entry.order !== "number" || !Number.isFinite(entry.order))) ||
          (entry.aliases !== undefined && (!Array.isArray(entry.aliases) || !entry.aliases.every(isText))) ||
          (category === "modalities" && !isNature(entry.nature))) {
        issues.push({ path, code: "invalid_option" });
        continue;
      }
      if (ids.has(entry.id)) issues.push({ path: `${path}.id`, code: "duplicate_id" });
      ids.add(entry.id);
      // Prevent custom aliases from redirecting a built-in historical identity.
      const customAliases = Array.isArray(entry.aliases) ? entry.aliases : [];
      for (const candidate of [entry.id, ...customAliases]) {
        if (typeof candidate !== "string") continue;
        const key = aliasKey(candidate);
        const reservedId = historicalAliasId(category, key);
        const existingId = aliases.get(key);
        if ((reservedId && reservedId !== entry.id) || (existingId && existingId !== entry.id)) {
          issues.push({ path, code: "ambiguous_alias" });
        }
        aliases.set(key, entry.id);
      }
    }
  }
  return issues;
}

/** Stable sorting, including equal orders, without mutating the source array. */
export function sortCatalogOptions<T extends CatalogOption>(options: readonly T[]): T[] {
  return [...options].sort((a, b) => a.order - b.order);
}

/**
 * Empty/missing configuration supplies choices, never a selected field value.
 * An explicitly empty category stays empty; a missing category uses Bloom defaults.
 * Malformed configuration throws rather than silently replacing teacher choices.
 */
export function normalizeCatalogOptions(value: unknown): CatalogOptions {
  const issues = validateCatalogOptions(value);
  if (issues.length > 0) throw new CatalogValidationError(issues);
  const defaults = getDefaultCatalogOptions();
  if (!isObject(value)) return defaults;

  function normalizeCategory(category: CatalogCategory): CatalogOption[] {
    const entries = value[category];
    if (!Array.isArray(entries)) return defaults[category];
    return sortCatalogOptions(entries.map((entry: Record<string, unknown>, index) => ({
      // Validation above guarantees these types; IDs are copied literally, never slugified.
      id: entry.id as string,
      label: (entry.label as string).trim(),
      active: entry.active === undefined ? true : entry.active as boolean,
      order: entry.order === undefined ? index + 1 : entry.order as number,
      ...(Array.isArray(entry.aliases) ? { aliases: [...entry.aliases] as string[] } : {}),
      ...(category === "modalities" ? { nature: entry.nature as ModalityNature } : {}),
    })));
  }

  return {
    levels: normalizeCategory("levels"),
    focuses: normalizeCategory("focuses"),
    modalities: normalizeCategory("modalities") as CatalogModalityOption[],
  };
}

export interface ResolvedCatalogValue {
  /** Literal stored input; resolving never rewrites it. */
  value: string;
  id: string | null;
  label: string;
  option: CatalogOption | CatalogModalityOption | null;
  isLegacy: boolean;
  /** True only for a recognized built-in no longer present in configured choices. */
  isHistoricalDefault: boolean;
}

export function resolveCatalogValue(
  catalog: CatalogOptions,
  category: CatalogCategory,
  value: string | null | undefined,
): ResolvedCatalogValue | null {
  if (value == null || value.trim() === "") return null;
  const options = catalog[category];
  const exact = options.find((option) => option.id === value);
  if (exact) {
    return { value, id: exact.id, label: exact.label, option: exact, isLegacy: false, isHistoricalDefault: false };
  }
  const key = aliasKey(value);
  const custom = options.find((option) => option.aliases?.some((alias) => aliasKey(alias) === key));
  const historicalId = historicalAliasId(category, key);
  const configured = custom ?? options.find((option) => option.id === historicalId);
  // Display-only fallback: never adds removed/inactive choices to new-record selectors.
  const historical = historicalId
    ? getDefaultCatalogOptions()[category].find((option) => option.id === historicalId)
    : undefined;
  const option = configured ?? historical;
  if (option) {
    return { value, id: option.id, label: option.label, option, isLegacy: true, isHistoricalDefault: !configured };
  }
  return { value, id: null, label: value, option: null, isLegacy: true, isHistoricalDefault: false };
}

export function resolveCatalogLabel(
  catalog: CatalogOptions,
  category: CatalogCategory,
  value: string | null | undefined,
): string | null {
  return resolveCatalogValue(catalog, category, value)?.label ?? null;
}

export function resolveModalityNature(catalog: CatalogOptions, value: string | null | undefined): ModalityNature | null {
  const option = resolveCatalogValue(catalog, "modalities", value)?.option;
  return option && "nature" in option ? option.nature : null;
}

export function getActiveCatalogOptions<K extends CatalogCategory>(catalog: CatalogOptions, category: K): CatalogOptions[K] {
  return catalog[category].filter((option) => option.active) as CatalogOptions[K];
}

/** For NEW selections only: accept an active exact ID, not labels or historical aliases. */
export function toCatalogSelectionId(
  catalog: CatalogOptions,
  category: CatalogCategory,
  value: string | null | undefined,
): string | null {
  if (value == null || value.trim() === "") return null;
  const option = catalog[category].find((candidate) => candidate.id === value && candidate.active);
  if (!option) throw new Error("Select an active pedagogical catalog ID");
  return option.id;
}
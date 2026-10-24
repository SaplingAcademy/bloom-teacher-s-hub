/**
 * Calendar color resolution. `null`/missing color_key at any level means
 * "no customization here" and falls through to the next level:
 * occurrence (calendar_events) → recurring slot (student/class_schedules)
 * → parent (students/classes) → native fallback (custom lilac / Bloom default).
 * Picking "Default" stores null — never the string "default".
 */
import { BRAND_COLOR_PALETTE, type BrandColorMeta } from "@/lib/brand-colors";

export const CALENDAR_COLOR_OPTIONS = ["moss", "terracotta", "olive", "lilac", "amber", "rose", "sage", "gray"] as const;
export type CalendarColorKey = (typeof CALENDAR_COLOR_OPTIONS)[number];

const extra = (key: string, swatchHex: string, c: string): BrandColorMeta => ({
  key: key as BrandColorMeta["key"],
  label: key,
  swatchHex,
  borderClass: `border-${c}-500/60`,
  badgeClass: `bg-${c}-500/15 text-${c}-900 border-${c}-500/30`,
  cardTintClass: `bg-${c}-500/[0.06]`,
  avatarRingClass: `ring-2 ring-${c}-500/40`,
  calendarEventClass: `bg-${c}-500/20 text-${c}-900 dark:text-${c}-200 border-${c}-500/40 font-semibold`,
});

// Literal class strings so Tailwind detects them.
const EXTRA: Record<string, BrandColorMeta> = {
  lilac: { ...extra("lilac", "#9f7aea", "violet"), borderClass: "border-violet-500/60", badgeClass: "bg-violet-500/15 text-violet-900 border-violet-500/30", cardTintClass: "bg-violet-500/[0.06]", calendarEventClass: "bg-violet-500/20 text-violet-900 dark:text-violet-200 border-violet-500/40 font-semibold" },
  amber: { ...extra("amber", "#d69e2e", "yellow"), borderClass: "border-yellow-500/60", badgeClass: "bg-yellow-500/15 text-yellow-900 border-yellow-500/30", cardTintClass: "bg-yellow-500/[0.06]", calendarEventClass: "bg-yellow-400/25 text-yellow-900 dark:text-yellow-200 border-yellow-500/50 font-semibold" },
  rose: { ...extra("rose", "#d53f8c", "pink"), borderClass: "border-pink-500/60", badgeClass: "bg-pink-500/15 text-pink-900 border-pink-500/30", cardTintClass: "bg-pink-500/[0.06]", calendarEventClass: "bg-pink-500/20 text-pink-900 dark:text-pink-200 border-pink-500/40 font-semibold" },
  gray: { ...extra("gray", "#718096", "slate"), borderClass: "border-slate-500/60", badgeClass: "bg-slate-500/15 text-slate-900 border-slate-500/30", cardTintClass: "bg-slate-500/[0.06]", calendarEventClass: "bg-slate-500/20 text-slate-900 dark:text-slate-200 border-slate-500/40 font-semibold" },
};

export function calendarColorMeta(key?: string | null): BrandColorMeta | null {
  if (!key || key === "default") return null;
  if (key in EXTRA) return EXTRA[key];
  if (key in BRAND_COLOR_PALETTE) return BRAND_COLOR_PALETTE[key as keyof typeof BRAND_COLOR_PALETTE];
  return null;
}

export const CUSTOM_EVENT_FALLBACK_CLASS = "bg-lilac-soft text-foreground border-lilac/40";

export interface CalendarColorSources {
  eventColorKey?: string | null;
  scheduleColorKey?: string | null;
  parentColorKey?: string | null;
  isCustom?: boolean;
}

/** Returns the resolved palette entry, or null when the native fallback applies. */
export function resolveCalendarColor(src: CalendarColorSources): BrandColorMeta | null {
  return calendarColorMeta(src.eventColorKey)
    ?? (src.isCustom ? null : calendarColorMeta(src.scheduleColorKey) ?? calendarColorMeta(src.parentColorKey));
}

/** Picker value → stored value. "default"/empty always becomes null. */
export function toStoredColorKey(key: string | null | undefined): string | null {
  return key && key !== "default" ? key : null;
}

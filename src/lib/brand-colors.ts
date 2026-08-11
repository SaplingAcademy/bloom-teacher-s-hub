export type BrandColorKey = "default" | "moss" | "sage" | "terracotta" | "sand" | "olive";

export interface BrandColorMeta {
  key: BrandColorKey;
  label: string;
  swatchHex: string;
  borderClass: string;
  badgeClass: string;
  cardTintClass: string;
  avatarRingClass: string;
  calendarEventClass: string;
}

export const BRAND_COLOR_PALETTE: Record<BrandColorKey, BrandColorMeta> = {
  default: {
    key: "default",
    label: "Padrão Bloom",
    swatchHex: "#163020", // Deep Forest Green
    borderClass: "border-border",
    badgeClass: "bg-primary/10 text-primary border-primary/20",
    cardTintClass: "bg-card",
    avatarRingClass: "ring-2 ring-primary/20",
    calendarEventClass: "bg-primary/15 text-primary border-primary/30 dark:bg-primary/25 dark:text-emerald-300",
  },
  moss: {
    key: "moss",
    label: "Verde Musgo",
    swatchHex: "#22543d",
    borderClass: "border-emerald-600/60 dark:border-emerald-500/60",
    badgeClass: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-300 border-emerald-600/30",
    cardTintClass: "bg-emerald-500/[0.04] dark:bg-emerald-500/[0.08]",
    avatarRingClass: "ring-2 ring-emerald-600/40",
    calendarEventClass: "bg-emerald-600/20 text-emerald-900 dark:text-emerald-200 border-emerald-600/40 font-semibold",
  },
  sage: {
    key: "sage",
    label: "Verde Sálvia",
    swatchHex: "#4a7c59",
    borderClass: "border-teal-600/50 dark:border-teal-400/50",
    badgeClass: "bg-teal-500/15 text-teal-800 dark:text-teal-300 border-teal-500/30",
    cardTintClass: "bg-teal-500/[0.04] dark:bg-teal-500/[0.08]",
    avatarRingClass: "ring-2 ring-teal-500/40",
    calendarEventClass: "bg-teal-500/20 text-teal-900 dark:text-teal-200 border-teal-500/40 font-semibold",
  },
  terracotta: {
    key: "terracotta",
    label: "Terracota",
    swatchHex: "#c85a32",
    borderClass: "border-amber-600/60 dark:border-amber-500/60",
    badgeClass: "bg-amber-600/15 text-amber-900 dark:text-amber-300 border-amber-600/30",
    cardTintClass: "bg-amber-500/[0.04] dark:bg-amber-500/[0.08]",
    avatarRingClass: "ring-2 ring-amber-600/40",
    calendarEventClass: "bg-amber-600/20 text-amber-900 dark:text-amber-200 border-amber-600/40 font-semibold",
  },
  sand: {
    key: "sand",
    label: "Areia & Creme",
    swatchHex: "#d4a373",
    borderClass: "border-orange-500/50 dark:border-orange-400/50",
    badgeClass: "bg-orange-500/15 text-orange-900 dark:text-orange-300 border-orange-500/30",
    cardTintClass: "bg-orange-500/[0.04] dark:bg-orange-500/[0.08]",
    avatarRingClass: "ring-2 ring-orange-500/40",
    calendarEventClass: "bg-orange-500/20 text-orange-900 dark:text-orange-200 border-orange-500/40 font-semibold",
  },
  olive: {
    key: "olive",
    label: "Oliva & Azul Calmo",
    swatchHex: "#2b6cb0",
    borderClass: "border-sky-600/60 dark:border-sky-500/60",
    badgeClass: "bg-sky-600/15 text-sky-900 dark:text-sky-300 border-sky-600/30",
    cardTintClass: "bg-sky-500/[0.04] dark:bg-sky-500/[0.08]",
    avatarRingClass: "ring-2 ring-sky-600/40",
    calendarEventClass: "bg-sky-600/20 text-sky-900 dark:text-sky-200 border-sky-600/40 font-semibold",
  },
};

/**
 * Safely resolves color metadata for student or class
 */
export function getBrandColorMeta(colorKey?: string): BrandColorMeta {
  if (colorKey && colorKey in BRAND_COLOR_PALETTE) {
    return BRAND_COLOR_PALETTE[colorKey as BrandColorKey];
  }
  return BRAND_COLOR_PALETTE.default;
}

/**
 * Resolves color for a Calendar event dynamically from linked student or class
 */
export function resolveEventColorMeta(
  studentColorKey?: string,
  classColorKey?: string
): BrandColorMeta {
  // Class color takes priority for group events if customized
  if (classColorKey && classColorKey !== "default" && classColorKey in BRAND_COLOR_PALETTE) {
    return BRAND_COLOR_PALETTE[classColorKey as BrandColorKey];
  }
  // Otherwise student color takes priority for individual lessons if customized
  if (studentColorKey && studentColorKey !== "default" && studentColorKey in BRAND_COLOR_PALETTE) {
    return BRAND_COLOR_PALETTE[studentColorKey as BrandColorKey];
  }
  return BRAND_COLOR_PALETTE.default;
}

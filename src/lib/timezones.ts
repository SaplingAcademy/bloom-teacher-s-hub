export interface TimezoneOption {
  iana: string;
  labelPt: string;
  labelEn: string;
  /** Display-only offset string (e.g. "UTC-3"). Not used for calculations. */
  offsetDisplay: string;
  region: "brazil" | "americas" | "europe" | "asia";
}

export const TIMEZONE_OPTIONS: TimezoneOption[] = [
  // Brazil
  { iana: "America/Sao_Paulo", labelPt: "Brasília", labelEn: "Brasilia", offsetDisplay: "UTC-3", region: "brazil" },
  { iana: "America/Manaus", labelPt: "Manaus", labelEn: "Manaus", offsetDisplay: "UTC-4", region: "brazil" },
  { iana: "America/Cuiaba", labelPt: "Cuiabá", labelEn: "Cuiaba", offsetDisplay: "UTC-4", region: "brazil" },
  { iana: "America/Rio_Branco", labelPt: "Rio Branco", labelEn: "Rio Branco", offsetDisplay: "UTC-5", region: "brazil" },
  // Americas
  { iana: "America/New_York", labelPt: "Horário do Leste (EUA)", labelEn: "Eastern Time", offsetDisplay: "UTC-5/-4", region: "americas" },
  { iana: "America/Chicago", labelPt: "Horário Central (EUA)", labelEn: "Central Time", offsetDisplay: "UTC-6/-5", region: "americas" },
  { iana: "America/Denver", labelPt: "Horário das Montanhas (EUA)", labelEn: "Mountain Time", offsetDisplay: "UTC-7/-6", region: "americas" },
  { iana: "America/Los_Angeles", labelPt: "Horário do Pacífico (EUA)", labelEn: "Pacific Time", offsetDisplay: "UTC-8/-7", region: "americas" },
  { iana: "America/Toronto", labelPt: "Toronto", labelEn: "Toronto", offsetDisplay: "UTC-5/-4", region: "americas" },
  { iana: "America/Vancouver", labelPt: "Vancouver", labelEn: "Vancouver", offsetDisplay: "UTC-8/-7", region: "americas" },
  // Europe
  { iana: "Europe/London", labelPt: "Londres", labelEn: "London", offsetDisplay: "UTC+0/+1", region: "europe" },
  { iana: "Europe/Paris", labelPt: "Europa Central", labelEn: "Central Europe", offsetDisplay: "UTC+1/+2", region: "europe" },
  { iana: "Europe/Lisbon", labelPt: "Lisboa", labelEn: "Lisbon", offsetDisplay: "UTC+0/+1", region: "europe" },
  // Asia / Oceania
  { iana: "Asia/Tokyo", labelPt: "Tóquio", labelEn: "Tokyo", offsetDisplay: "UTC+9", region: "asia" },
  { iana: "Asia/Seoul", labelPt: "Seul", labelEn: "Seoul", offsetDisplay: "UTC+9", region: "asia" },
  { iana: "Asia/Singapore", labelPt: "Cingapura", labelEn: "Singapore", offsetDisplay: "UTC+8", region: "asia" },
  { iana: "Australia/Sydney", labelPt: "Sydney", labelEn: "Sydney", offsetDisplay: "UTC+10/+11", region: "asia" },
];

const REGION_LABELS: Record<TimezoneOption["region"], { pt: string; en: string }> = {
  brazil: { pt: "Brasil", en: "Brazil" },
  americas: { pt: "Américas", en: "Americas" },
  europe: { pt: "Europa", en: "Europe" },
  asia: { pt: "Ásia / Oceania", en: "Asia / Oceania" },
};

/**
 * Returns the friendly label for a given IANA timezone string.
 * If the value is not in the curated list, returns the raw IANA string so
 * existing values are never silently discarded.
 */
export function getTimezoneLabel(iana: string, lang: "pt" | "en"): string {
  const opt = TIMEZONE_OPTIONS.find((t) => t.iana === iana);
  if (!opt) return iana;
  const label = lang === "pt" ? opt.labelPt : opt.labelEn;
  return `${label} (${opt.offsetDisplay})`;
}

/** True when the IANA value exists in the curated list. */
export function isKnownTimezone(iana: string): boolean {
  return TIMEZONE_OPTIONS.some((t) => t.iana === iana);
}

export type { TimezoneOption as TZOption };
export { REGION_LABELS };

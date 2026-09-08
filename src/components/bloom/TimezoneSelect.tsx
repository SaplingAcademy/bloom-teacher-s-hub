import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TIMEZONE_OPTIONS,
  REGION_LABELS,
  isKnownTimezone,
  type TimezoneOption,
} from "@/lib/timezones";

interface TimezoneSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  lang: "pt" | "en";
  id?: string;
  className?: string;
}

const REGION_ORDER: TimezoneOption["region"][] = ["brazil", "americas", "europe", "asia"];

/**
 * Dropdown select for IANA timezones.
 * Displays friendly labels in PT or EN; saves IANA identifiers.
 * If the current value is not in the curated list it is shown as an
 * additional option so it is never silently discarded.
 */
export function TimezoneSelect({
  value,
  onValueChange,
  lang,
  id,
  className,
}: TimezoneSelectProps) {
  const grouped = REGION_ORDER.map((region) => ({
    region,
    label: lang === "pt" ? REGION_LABELS[region].pt : REGION_LABELS[region].en,
    options: TIMEZONE_OPTIONS.filter((t) => t.region === region),
  }));

  const hasUnknown = value && !isKnownTimezone(value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        id={id}
        className={
          className ??
          "flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        }
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {/* Preserve unknown value that was already saved */}
        {hasUnknown && (
          <SelectItem value={value}>{value}</SelectItem>
        )}

        {grouped.map(({ region, label, options }) => (
          <div key={region}>
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              {label}
            </div>
            {options.map((opt) => {
              const friendlyLabel =
                lang === "pt"
                  ? `${opt.labelPt} (${opt.offsetDisplay})`
                  : `${opt.labelEn} (${opt.offsetDisplay})`;
              return (
                <SelectItem key={opt.iana} value={opt.iana}>
                  {friendlyLabel}
                </SelectItem>
              );
            })}
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}

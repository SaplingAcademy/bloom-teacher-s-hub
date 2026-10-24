import { Check } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Label } from "@/components/ui/label";
import { CALENDAR_COLOR_OPTIONS, calendarColorMeta } from "@/lib/calendar-colors";

/** Swatch picker; `null` = Default (inherit). Never emits "default". */
export function CalendarColorPicker({ value, onChange, disabled, id }: {
  value: string | null | undefined; onChange: (key: string | null) => void; disabled?: boolean; id?: string;
}) {
  const { t } = useLanguage();
  const current = calendarColorMeta(value) ? value : null;
  const swatch = (key: string | null, hex: string | null, label: string) => {
    const selected = current === key;
    return <button key={key ?? "default"} type="button" disabled={disabled} title={label} aria-label={label} aria-pressed={selected}
      onClick={() => onChange(key)}
      className={`relative flex h-7 w-7 items-center justify-center rounded-full border transition-all disabled:opacity-50 ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border-border hover:scale-110"} ${hex ? "" : "bg-background"}`}
      style={hex ? { backgroundColor: hex } : undefined}>
      {selected && <Check className={`h-3.5 w-3.5 ${hex ? "text-primary-foreground" : "text-primary"}`} />}
      {!hex && !selected && <span className="h-2.5 w-2.5 rounded-full bg-primary/40" />}
    </button>;
  };
  return <div className="space-y-2" id={id}>
    <Label className="text-xs font-semibold">{t("calendarUi.calendarColor")}</Label>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("calendarUi.calendarColor")}>
      {swatch(null, null, t("calendarUi.colorDefault"))}
      {CALENDAR_COLOR_OPTIONS.map((key) => swatch(key, calendarColorMeta(key)!.swatchHex, t(`calendarUi.color_${key}`)))}
    </div>
  </div>;
}

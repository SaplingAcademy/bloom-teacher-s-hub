import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { todayLocalDate } from "@/lib/student-start-date";

/**
 * Required "Início das aulas" field shared by every student-creation flow: no automatic value
 * (the teacher states the real start, which may be before the Bloom registration), plus a "Hoje"
 * shortcut that fills today's local date.
 */
export function StudentStartDateField({
  id,
  value,
  onChange,
  compact = false,
  labelClassName = "text-xs font-semibold",
  inputClassName,
  nativeRequired = true,
  todayClassName = "text-primary",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  labelClassName?: string;
  inputClassName?: string;
  /** Native `required`; off when the field sits inside another form it must not block (checked on its own save). */
  nativeRequired?: boolean;
  /** Color of the "Hoje" shortcut (follow the label on dark surfaces). */
  todayClassName?: string;
}) {
  const { t } = useLanguage();
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className={`flex items-center gap-1 select-none ${labelClassName}`}>
          {t("studentStart.label")} <span className="font-bold text-[#ED7034]">*</span>
        </Label>
        <button
          type="button"
          onClick={() => onChange(todayLocalDate())}
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold underline underline-offset-2 transition-opacity hover:opacity-80 cursor-pointer ${todayClassName}`}
        >
          {t("studentStart.today")}
        </button>
      </div>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={nativeRequired}
        aria-required="true"
        aria-describedby={hintId}
        className={inputClassName ?? (compact ? "h-9 bg-white text-xs" : undefined)}
      />
      <p id={hintId} className="text-[11px] text-muted-foreground">{t("studentStart.hint")}</p>
    </div>
  );
}

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import type { ChecklistDeadline, ChecklistDeadlineType } from "@/lib/teacher-checklist";

interface ChecklistDeadlineFieldsProps {
  id: string;
  value: ChecklistDeadline;
  today: string;
  disabled?: boolean;
  preventPast?: boolean;
  onChange: (value: ChecklistDeadline) => void;
}

export function ChecklistDeadlineFields({ id, value, today, disabled, preventPast, onChange }: ChecklistDeadlineFieldsProps) {
  const { t } = useLanguage();
  function changeType(type: ChecklistDeadlineType) {
    if (type === "none") onChange({ deadline_type: "none", due_date: null });
    else if (type === "today") onChange({ deadline_type: "today", due_date: today });
    else onChange({ deadline_type: "specific", due_date: value.deadline_type === "specific" ? value.due_date : null });
  }
  return <div className="flex min-w-0 flex-wrap items-center gap-2">
    <Select value={value.deadline_type} disabled={disabled} onValueChange={(type) => changeType(type as ChecklistDeadlineType)}>
      <SelectTrigger aria-label={t("checklist.deadlineLabel")} className="h-9 min-w-0 flex-1 text-xs sm:w-auto sm:flex-none">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("checklist.noDeadline")}</SelectItem>
        <SelectItem value="today">{t("checklist.deadlineToday")}</SelectItem>
        <SelectItem value="specific">{t("checklist.deadlineSpecific")}</SelectItem>
      </SelectContent>
    </Select>
    {value.deadline_type === "specific" && <Input id={id} type="date" aria-label={t("checklist.specificDate")}
      value={value.due_date ?? ""} min={preventPast ? today : undefined} required disabled={disabled}
      onChange={(event) => onChange({ deadline_type: "specific", due_date: event.target.value || null })}
      className="h-9 min-w-0 flex-1 text-xs sm:w-[9.5rem] sm:flex-none" />}
  </div>;
}

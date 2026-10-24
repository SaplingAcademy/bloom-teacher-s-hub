import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarColorPicker } from "@/components/bloom/CalendarColorPicker";
import { resizeClassSchedules, WEEKLY_LESSON_COUNTS, type ClassScheduleInput } from "@/lib/class-schedules";

export function ClassWeeklySchedules({ slots, onChange, disabled }: {
  slots: ClassScheduleInput[];
  onChange: (slots: ClassScheduleInput[]) => void;
  disabled?: boolean;
}) {
  const { t, formatWeekday } = useLanguage();
  const patch = (index: number, value: Partial<ClassScheduleInput>) => {
    onChange(slots.map((slot, i) => i === index ? { ...slot, ...value } : slot));
  };
  return <div className="space-y-3">
    <Label className="text-xs font-semibold">{t("classMgmt.lessonsPerWeek")}</Label>
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("classMgmt.lessonsPerWeek")}>
      {WEEKLY_LESSON_COUNTS.map((count) => <Button key={count} type="button" size="icon"
        variant={slots.length === count ? "default" : "outline"} className="rounded-full"
        aria-pressed={slots.length === count} disabled={disabled}
        onClick={() => onChange(resizeClassSchedules(slots, count))}>{count}</Button>)}
    </div>
    {slots.map((slot, index) => <div key={slot.id || index} className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
      <p className="text-xs font-semibold">{t("classMgmt.weeklyLesson").replace("{number}", String(index + 1))}</p>
      <div className="grid min-w-0 grid-cols-3 gap-2">
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`class-day-${index}`} className="text-xs">{t("auditUi.weekday")}</Label>
          <Select value={slot.weekday} disabled={disabled} onValueChange={(weekday) => patch(index, { weekday })}>
            <SelectTrigger id={`class-day-${index}`} className="h-9 w-full min-w-0 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) =>
              <SelectItem key={day} value={day}>{formatWeekday(day)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`class-time-${index}`} className="text-xs">{t("auditUi.startTime")}</Label>
          <Input id={`class-time-${index}`} type="time" required disabled={disabled} value={slot.startTime}
            onChange={(event) => patch(index, { startTime: event.target.value })} className="h-9 min-w-0 px-2 text-xs" />
        </div>
        <div className="min-w-0 space-y-1">
          <Label htmlFor={`class-duration-${index}`} className="text-xs">{t("classMgmt.durationMinutes")}</Label>
          <Input id={`class-duration-${index}`} type="number" required min={1} disabled={disabled} value={slot.duration || ""}
            onChange={(event) => patch(index, { duration: Number(event.target.value) })} className="h-9 min-w-0 px-2 text-xs" />
        </div>
      </div>
      <CalendarColorPicker value={slot.colorKey} disabled={disabled} onChange={(colorKey) => patch(index, { colorKey })} />
    </div>)}
  </div>;
}
import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/lesson-plans";
import { fetchCalendarClassAttendance, saveCalendarClassAttendance, type CalendarClassAttendance } from "@/lib/calendar-class-attendance";

export function CalendarClassAttendanceSection({ teacherId, classId, eventId, cancelled }: {
  teacherId: string | undefined; classId: string; eventId: string; cancelled: boolean;
}) {
  const { t } = useLanguage();
  const [data, setData] = useState<CalendarClassAttendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const scope = `${teacherId || ""}:${classId}:${eventId}:${retry}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const busy = useRef(false);
  const requestRef = useRef(0);

  useEffect(() => {
    let active = true;
    setData(null);
    const load = async () => {
      if (busy.current) return;
      const request = ++requestRef.current;
      setLoading(true);
      setError("");
      try {
        if (!teacherId) throw new Error("Missing teacher");
        const result = await fetchCalendarClassAttendance(teacherId, classId, eventId);
        if (active && request === requestRef.current) setData(result);
      } catch {
        if (active && request === requestRef.current) setError(t("calendarUi.classAttendanceLoadError"));
      } finally {
        if (active && request === requestRef.current) setLoading(false);
      }
    };
    void load();
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("focus", load); };
  }, [teacherId, classId, eventId, retry, t]);

  const locked = cancelled || data?.status === "Cancelled";
  const save = async (studentId: string, status: AttendanceStatus) => {
    if (!teacherId || locked || loading || busy.current || !data) return;
    busy.current = true;
    ++requestRef.current;
    setSaving(true);
    setError("");
    try {
      const result = await saveCalendarClassAttendance(teacherId, classId, eventId, studentId, status);
      if (scopeRef.current === scope) setData(result);
    } catch {
      if (scopeRef.current === scope) setError(t("calendarUi.classAttendanceSaveError"));
    } finally {
      busy.current = false;
      if (scopeRef.current === scope) setSaving(false);
    }
  };

  return <section className="space-y-2 border-b border-border/60 pb-4" aria-labelledby={`class-attendance-${eventId}`} aria-busy={loading || saving}>
    <h5 id={`class-attendance-${eventId}`} className="flex items-center gap-1.5 font-bold text-xs uppercase text-foreground"><Users className="h-4 w-4 text-primary" />{t("calendarUi.classAttendance")}</h5>
    {loading && <p className="text-xs text-muted-foreground" role="status">{t("calendarUi.classAttendanceLoading")}</p>}
    {locked && <p className="text-xs text-muted-foreground">{t("calendarUi.classAttendanceCancelled")}</p>}
    {error && <div className="space-y-2"><p role="alert" className="text-xs text-destructive">{error}</p><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => setRetry((value) => value + 1)}>{t("calendarUi.classAttendanceRetry")}</Button></div>}
    {!loading && data && data.members.length === 0 && <p className="text-xs text-muted-foreground">{t("calendarUi.classAttendanceEmpty")}</p>}
    {!loading && data?.members.map((member) => {
      const record = data.records.find((row) => row.student_id === member.student_id);
      return <div key={member.student_id} className="flex flex-col gap-2 border-b border-border/40 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
        <span id={`attendance-member-${eventId}-${member.student_id}`} className="min-w-0 break-words text-xs font-semibold text-foreground">{member.student_name || t("calendarUi.classAttendanceUnnamed")}</span>
        <Select value={record?.status || "unrecorded"} disabled={locked || saving || loading} onValueChange={(value) => void save(member.student_id, value as AttendanceStatus)}>
          <SelectTrigger className="h-9 w-full text-xs sm:w-40 sm:shrink-0" aria-labelledby={`attendance-member-${eventId}-${member.student_id}`}><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="unrecorded" disabled>{t("calendarUi.homeworkUnrecorded")}</SelectItem>{ATTENDANCE_STATUSES.map((status) => <SelectItem key={status} value={status}>{t(`calendarUi.attendance_${status}`)}</SelectItem>)}</SelectContent>
        </Select>
      </div>;
    })}
  </section>;
}
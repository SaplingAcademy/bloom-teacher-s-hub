import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { StudentClassLesson, fetchStudentClassLessons } from "@/lib/lesson-plans";
import { useLanguage } from "@/hooks/use-language";

const STATUS_CLASS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800",
  absent: "bg-rose-100 text-rose-800",
  late: "bg-amber-100 text-amber-800",
  excused: "bg-sky-100 text-sky-800",
};

export function StudentClassLessonsHistory({ studentId }: { studentId: string; isPt?: boolean }) {
  const { t, formatStatus } = useLanguage();
  const [lessons, setLessons] = useState<StudentClassLesson[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchStudentClassLessons(studentId)
      .then((list) => active && setLessons(list))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [studentId]);

  if (loading || lessons.length === 0) return null;

  return (
    <div className="p-6 rounded-2xl bg-card border border-border shadow-sm space-y-4">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">
          {t("globalUi.classPairLessons")}
        </h3>
        <span className="text-xs text-muted-foreground">({lessons.length})</span>
      </div>

      <div className="space-y-2">
        {lessons.map((l) => {
          const cancelled = l.event_status === "Cancelled";
          const statusClass = l.attendance_status ? STATUS_CLASS[l.attendance_status] : null;
          return (
            <div
              key={l.event_id}
              className={`p-3 rounded-xl border border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                cancelled ? "opacity-60" : ""
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-foreground">{l.scheduled_date.split("-").reverse().join("/")}</span>
                  <span className="text-muted-foreground">{(l.start_time || "").slice(0, 5)}</span>
                  <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                    {l.class_name}
                  </span>
                </div>
                {l.content && <p className="text-muted-foreground">{l.content}</p>}
              </div>

              <span
                className={`px-2 py-0.5 rounded-full font-bold ${
                  cancelled
                    ? "bg-stone-200 text-stone-700"
                    : statusClass
                    ? statusClass
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {cancelled
                  ? t("globalUi.cancelledFeminine")
                  : l.attendance_status
                  ? formatStatus(l.attendance_status)
                  : t("globalUi.unrecorded")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

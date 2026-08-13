import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { StudentClassLesson, fetchStudentClassLessons } from "@/lib/lesson-plans";

const STATUS_LABEL: Record<string, { pt: string; en: string; cls: string }> = {
  present: { pt: "Presente", en: "Present", cls: "bg-emerald-100 text-emerald-800" },
  absent: { pt: "Falta", en: "Absent", cls: "bg-rose-100 text-rose-800" },
  late: { pt: "Atrasado", en: "Late", cls: "bg-amber-100 text-amber-800" },
  excused: { pt: "Justificada", en: "Excused", cls: "bg-sky-100 text-sky-800" },
};

export function StudentClassLessonsHistory({ studentId, isPt }: { studentId: string; isPt: boolean }) {
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
          {isPt ? "Aulas em turmas e duplas" : "Group & pair lessons"}
        </h3>
        <span className="text-xs text-muted-foreground">({lessons.length})</span>
      </div>

      <div className="space-y-2">
        {lessons.map((l) => {
          const cancelled = l.event_status === "Cancelled";
          const status = l.attendance_status ? STATUS_LABEL[l.attendance_status] : null;
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
                    : status
                    ? status.cls
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {cancelled
                  ? isPt ? "Cancelada" : "Cancelled"
                  : status
                  ? isPt ? status.pt : status.en
                  : isPt ? "Sem registro" : "Unrecorded"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

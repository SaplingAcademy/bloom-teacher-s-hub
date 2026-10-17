import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import { StudentClassLesson, fetchStudentClassLessons } from "@/lib/lesson-plans";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { fetchStudentClassParticipation, fetchParticipationHistory, type StudentClassParticipation, type ParticipationEvent, type ParticipationInvoice } from "@/lib/class-lifecycle";
import { Link } from "@tanstack/react-router";

const STATUS_CLASS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-800",
  absent: "bg-rose-100 text-rose-800",
  late: "bg-amber-100 text-amber-800",
  excused: "bg-sky-100 text-sky-800",
};

export function StudentClassLessonsHistory({ studentId }: { studentId: string; isPt?: boolean }) {
  const { t, lang, formatStatus } = useLanguage();
  const { user } = useAuth();
  const [lessons, setLessons] = useState<StudentClassLesson[]>([]);
  const [participations, setParticipations] = useState<StudentClassParticipation[]>([]);
  const [events, setEvents] = useState<ParticipationEvent[]>([]);
  const [invoices, setInvoices] = useState<ParticipationInvoice[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;
    setLoading(true);
    setError(false);
    Promise.all([fetchStudentClassLessons(studentId), fetchStudentClassParticipation(user.id, studentId)])
      .then(async ([list, membership]) => {
        const history = await fetchParticipationHistory(user.id, studentId, membership);
        if (active) { setLessons(list); setParticipations(membership); setEvents(history.events); setInvoices(history.invoices); }
      })
      .catch(() => { if (active) setError(true); })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [studentId, user?.id]);

  if (loading) return null;
  if (error) return <p role="alert" className="text-sm text-destructive">{t("errors.load")}</p>;
  if (lessons.length === 0 && participations.length === 0) return null;
  const money = (cents: number) => new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "BRL" }).format(cents / 100);

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
        {participations.map((membership) => (
          <div key={membership.id} className="border-b border-border pb-3 space-y-1 text-xs">
            <Link to="/students" search={{ classId: membership.class_id }} className="font-semibold text-primary underline">
              {membership.class_name}
            </Link>
            <span className="ml-2 text-muted-foreground">{membership.class_status === "archived" ? t("classRemoval.archived") : formatStatus(membership.class_status)}</span>
            <p className="text-muted-foreground">
              {membership.class_start_date && `${t("classRemoval.started")}: ${membership.class_start_date} · `}
              {t("classRemoval.joined")}: {membership.joined_at}
              {membership.left_at && ` · ${t("classRemoval.left")}: ${membership.left_at}`}
            </p>
            {invoices.filter((invoice) => invoice.class_id === membership.class_id).map((invoice) => (
              <div key={invoice.id} className="text-muted-foreground pt-1">
                <p>{t("classRemoval.classCharges")}: {invoice.due_date} · {money(invoice.amount_cents)} · {formatStatus(invoice.status)}</p>
                {(invoice.payments || []).map((payment) => <p key={payment.id}>{t("classRemoval.received")}: {payment.received_at?.slice(0, 10)} · {money(payment.amount_cents)}</p>)}
              </div>
            ))}
          </div>
        ))}
        {events.filter((event) => !lessons.some((lesson) => lesson.event_id === event.id)).map((event) => (
          <div key={event.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-2 text-xs">
            <span>{event.date} · {event.start_time?.slice(0, 5)} · {participations.find((m) => m.class_id === event.class_id)?.class_name}</span>
            <span className="text-muted-foreground">{event.attendance_status ? formatStatus(event.attendance_status) : formatStatus(event.status)}</span>
          </div>
        ))}
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

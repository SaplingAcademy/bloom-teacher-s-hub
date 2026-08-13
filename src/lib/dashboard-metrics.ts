import { supabase } from "@/lib/supabase";
import { formatDateString } from "@/lib/calendar-sync";
import type { CalendarEvent, CEFRLevel, CourseFocus, StudentType, TimelineStatus } from "@/lib/calendar-sync";

export interface MetricTrend {
  value: string;
  positive: boolean;
}

export interface DashboardMetrics {
  todayEvents: CalendarEvent[];
  activeStudents: number;
  activeStudentsTrend: MetricTrend | null;
  newLeads: number;
  newLeadsTrend: MetricTrend | null;
  monthRevenueCents: number;
  monthRevenueTrend: MetricTrend | null;
  hasRevenueSource: boolean;
}

export const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  todayEvents: [],
  activeStudents: 0,
  activeStudentsTrend: null,
  newLeads: 0,
  newLeadsTrend: null,
  monthRevenueCents: 0,
  monthRevenueTrend: null,
  hasRevenueSource: false,
};

function monthBounds(ref: Date) {
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
  const nextStart = new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 0, 0, 0, 0);
  const prevStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1, 0, 0, 0, 0);
  return { start, nextStart, prevStart };
}

function pctTrend(current: number, previous: number): MetricTrend | null {
  // Only a real comparison against a real previous period produces an indicator
  if (!previous || previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  return { value: `${pct > 0 ? "+" : ""}${pct}%`, positive: pct > 0 };
}

function countTrend(current: number, previous: number): MetricTrend | null {
  if (previous <= 0 && current <= 0) return null;
  const diff = current - previous;
  if (diff === 0) return null;
  return { value: `${diff > 0 ? "+" : ""}${diff}`, positive: diff > 0 };
}

function mapEvent(d: any): CalendarEvent {
  return {
    id: d.id,
    teacherId: d.teacher_id,
    studentId: d.student_id || undefined,
    scheduleId: d.schedule_id || undefined,
    groupId: d.group_id || undefined,
    studentName: d.student_name || "Aula",
    level: (d.level as CEFRLevel) || "A1",
    focus: (d.focus as CourseFocus) || "General English",
    date: d.date,
    startTime: (d.start_time || "").substring(0, 5),
    endTime: (d.end_time || "").substring(0, 5),
    duration: Number(d.duration) || 60,
    type: (d.type as StudentType) || "Private",
    deliveryMode: (d.delivery_mode as "Online" | "In person") || "Online",
    locationLink: d.location_link || undefined,
    status: (d.status as TimelineStatus) || "Scheduled",
    attendanceRecorded: d.attendance_recorded || false,
    attendanceStatus: d.attendance_status || undefined,
    notes: d.notes || undefined,
    homeworkTitle: d.homework_title || undefined,
    lessonPlanUrl: d.lesson_plan_url || undefined,
    isRecurring: d.is_recurring || false,
  };
}

/**
 * Fetch all dashboard metrics from real, teacher-scoped data.
 * Every number comes from Supabase; nothing is mocked or defaulted to a fake value.
 */
export async function fetchDashboardMetrics(teacherId: string): Promise<DashboardMetrics> {
  if (!teacherId) return EMPTY_DASHBOARD_METRICS;

  const now = new Date();
  const todayStr = formatDateString(now);
  const { start, nextStart, prevStart } = monthBounds(now);

  const [eventsRes, studentsRes, leadsRes, paymentsRes] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("date", todayStr)
      .order("start_time", { ascending: true }),
    supabase
      .from("students")
      .select("id, status, created_at")
      .eq("teacher_id", teacherId),
    supabase
      .from("leads")
      .select("id, created_at")
      .eq("teacher_id", teacherId)
      .gte("created_at", prevStart.toISOString()),
    supabase
      .from("payments")
      .select("amount_cents, received_at")
      .eq("teacher_id", teacherId)
      .gte("received_at", prevStart.toISOString()),
  ]);

  if (eventsRes.error) console.error("[dashboard-metrics] events:", eventsRes.error.message);
  if (studentsRes.error) console.error("[dashboard-metrics] students:", studentsRes.error.message);
  if (leadsRes.error) console.error("[dashboard-metrics] leads:", leadsRes.error.message);
  if (paymentsRes.error) console.error("[dashboard-metrics] payments:", paymentsRes.error.message);

  const todayEvents = (eventsRes.data || [])
    .filter((d: any) => d.status !== "Cancelled" && d.status !== "Closed")
    .map(mapEvent);

  const students = studentsRes.data || [];
  const isActive = (s: any) => s.status === "Active" || s.status === "Trial";
  const activeStudents = students.filter(isActive).length;

  const activeCreatedThisMonth = students.filter(
    (s: any) => isActive(s) && s.created_at && new Date(s.created_at) >= start && new Date(s.created_at) < nextStart,
  ).length;
  const hadStudentsBefore = students.some(
    (s: any) => s.created_at && new Date(s.created_at) < start,
  );
  const activeStudentsTrend =
    hadStudentsBefore && activeCreatedThisMonth > 0
      ? { value: `+${activeCreatedThisMonth}`, positive: true }
      : null;

  const leads = leadsRes.data || [];
  const inRange = (iso: string | null, from: Date, to: Date) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d >= from && d < to;
  };
  const newLeads = leads.filter((l: any) => inRange(l.created_at, start, nextStart)).length;
  const prevLeads = leads.filter((l: any) => inRange(l.created_at, prevStart, start)).length;
  const newLeadsTrend = countTrend(newLeads, prevLeads);

  const payments = paymentsRes.data || [];
  const hasRevenueSource = !paymentsRes.error;
  const sumIn = (from: Date, to: Date) =>
    payments
      .filter((p: any) => inRange(p.received_at, from, to))
      .reduce((sum: number, p: any) => sum + (Number(p.amount_cents) || 0), 0);
  const monthRevenueCents = sumIn(start, nextStart);
  const prevRevenueCents = sumIn(prevStart, start);
  const monthRevenueTrend = pctTrend(monthRevenueCents, prevRevenueCents);

  return {
    todayEvents,
    activeStudents,
    activeStudentsTrend,
    newLeads,
    newLeadsTrend,
    monthRevenueCents,
    monthRevenueTrend,
    hasRevenueSource,
  };
}

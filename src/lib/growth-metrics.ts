import { supabase } from "@/lib/supabase";
import { calculateReceivedCentsForMonth, invoiceReceiptFields, receivedMonthOf } from "@/lib/finance-cashflow";
import { localMonthKey, studentStartMonth } from "@/lib/student-start-date";

/**
 * Real growth metrics for the authenticated teacher.
 * Every value is derived from existing Supabase tables (students, student_packages,
 * packages, invoices, payments). `null` means "no data" — never a mocked number.
 */
export interface GrowthMetricValue {
  value: number | null;
  /** Percent change vs. previous comparable period (null when no comparison exists). */
  change: number | null;
}

/**
 * Monthly history (oldest → current month) for the metrics whose values can be rebuilt
 * from dated records with the SAME definition as the current value. `null` = no data for
 * that month (before the first record, or the formula has no value) — never zero-filled.
 * Retention, renewal and contracted revenue per student are current snapshots only: their
 * past values cannot be rebuilt from the stored data, so they have no history here.
 */
export interface GrowthMetricsHistory {
  /** "YYYY-MM" keys. */
  months: string[];
  newStudents: (number | null)[];
  avgRevenuePerStudent: (number | null)[];
  monthlyGrowthRate: (number | null)[];
}

export const GROWTH_HISTORY_MONTHS = 6;

export interface RealGrowthMetrics {
  history: GrowthMetricsHistory;
  /**
   * New students are dated by the real start of lessons (students.course_start_date), never by the
   * Bloom registration date. Students without that date are not counted in any month; this is how many.
   */
  newStudentsWithoutStartDate: number;
  newStudentsThisMonth: GrowthMetricValue;
  retentionRate: GrowthMetricValue;
  renewalRate: GrowthMetricValue;
  avgPackageValue: GrowthMetricValue;
  avgRevenuePerStudent: GrowthMetricValue;
  monthlyGrowthRate: GrowthMetricValue;
}

const EMPTY_METRIC: GrowthMetricValue = { value: null, change: null };

export const EMPTY_GROWTH_METRICS: RealGrowthMetrics = {
  history: { months: [], newStudents: [], avgRevenuePerStudent: [], monthlyGrowthRate: [] },
  newStudentsWithoutStartDate: 0,
  newStudentsThisMonth: EMPTY_METRIC,
  retentionRate: EMPTY_METRIC,
  renewalRate: EMPTY_METRIC,
  avgPackageValue: EMPTY_METRIC,
  avgRevenuePerStudent: EMPTY_METRIC,
  monthlyGrowthRate: EMPTY_METRIC,
};

function monthBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { start, nextStart, prevStart };
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function fetchGrowthMetrics(teacherId: string): Promise<RealGrowthMetrics> {
  if (!teacherId) return EMPTY_GROWTH_METRICS;

  const now = new Date();
  const { start, nextStart, prevStart } = monthBounds(now);

  const [studentsRes, packagesRes, invoicesRes] = await Promise.all([
    supabase
      .from("students")
      .select("id, status, created_at, course_start_date")
      .eq("teacher_id", teacherId),
    supabase
      .from("student_packages")
      .select("*")
      .eq("teacher_id", teacherId),
    // Canonical received revenue: paid invoices (same selection as Finance/Today).
    supabase
      .from("invoices")
      .select("id, status, student_id, amount_cents, paid_at, payments(id, amount_cents, received_at, method)")
      .eq("teacher_id", teacherId)
      .eq("status", "paid"),
  ]);

  if (studentsRes.error) console.warn("[growth-metrics] students:", studentsRes.error.message);
  if (packagesRes.error) console.warn("[growth-metrics] student_packages:", packagesRes.error.message);
  if (invoicesRes.error) console.warn("[growth-metrics] invoices:", invoicesRes.error.message);

  const students = studentsRes.data || [];
  const studentPackages = packagesRes.data || [];
  const paidInvoices = (invoicesRes.data || []).map((inv: any) => ({
    id: inv.id as string,
    status: inv.status,
    studentId: (inv.student_id as string | null) ?? null,
    ...invoiceReceiptFields(inv),
  }));

  // --- 1. New students this month (vs. previous month), by the real start of lessons ---
  // Shared interpretation of course_start_date (local calendar month, no UTC shift). Students without
  // it are left out (no fallback to the registration date). Counts every student, whatever the status.
  const startMonthOf = (s: any): string | null => studentStartMonth(s.course_start_date);
  const datedStudents = students.filter((s: any) => startMonthOf(s) !== null);
  const newStudentsWithoutStartDate = students.length - datedStudents.length;
  const newInMonth = (key: string) => datedStudents.filter((s: any) => startMonthOf(s) === key).length;
  const newThisMonth = newInMonth(localMonthKey(start));
  const newPrevMonth = newInMonth(localMonthKey(prevStart));
  const newStudentsThisMonth: GrowthMetricValue = {
    value: datedStudents.length > 0 ? newThisMonth : null,
    change: pctChange(newThisMonth, newPrevMonth),
  };

  // --- 2. Retention: active students over all students ever registered ---
  const isActive = (s: any) => s.status === "Active" || s.status === "Trial";
  const activeCount = students.filter(isActive).length;
  const retentionRate: GrowthMetricValue = {
    value: students.length > 0 ? Math.round((activeCount / students.length) * 100) : null,
    change: null,
  };

  // --- 3. Renewal rate: students who signed a new package after one ended ---
  const byStudent = new Map<string, any[]>();
  studentPackages.forEach((sp: any) => {
    if (!sp.student_id) return;
    const list = byStudent.get(sp.student_id) || [];
    list.push(sp);
    byStudent.set(sp.student_id, list);
  });

  let eligible = 0;
  let renewed = 0;
  byStudent.forEach((list) => {
    // Scheduled renewals are neither in force nor ended; they still count as a renewal below.
    const ended = list.filter((sp) => (sp.status !== "active" && sp.status !== "scheduled") || sp.ended_at);
    if (ended.length === 0) return;
    eligible++;
    if (list.length > ended.length) renewed++;
  });
  const renewalRate: GrowthMetricValue = {
    value: eligible > 0 ? Math.round((renewed / eligible) * 100) : null,
    change: null,
  };

  // --- 4. Average package value (real agreements linked to students) ---
  const amounts = studentPackages
    .map((sp: any) => Number(sp.expected_total_cents ?? sp.total_amount_cents) || 0)
    .filter((cents) => cents > 0);
  const avgPackageValue: GrowthMetricValue = {
    value: amounts.length > 0
      ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length) / 100
      : null,
    change: null,
  };

  // --- 5 & 6. Revenue based metrics ---
  const prevKey = `${prevStart.getFullYear()}-${String(prevStart.getMonth() + 1).padStart(2, "0")}`;
  const curKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const revenueOf = (key: string) => calculateReceivedCentsForMonth(paidInvoices, key) / 100;
  const payingStudentsOf = (key: string) => {
    const ids = new Set<string>();
    paidInvoices.forEach((inv) => {
      if (inv.studentId && receivedMonthOf(inv) === key) ids.add(inv.studentId);
    });
    return ids.size;
  };

  const revenueCurrent = revenueOf(curKey);
  const revenuePrev = revenueOf(prevKey);
  const payingCurrent = payingStudentsOf(curKey);
  const payingPrev = payingStudentsOf(prevKey);

  const avgCurrent = payingCurrent > 0 ? revenueCurrent / payingCurrent : null;
  const avgPrev = payingPrev > 0 ? revenuePrev / payingPrev : null;

  const avgRevenuePerStudent: GrowthMetricValue = {
    value: avgCurrent === null ? null : Math.round(avgCurrent * 100) / 100,
    change: avgCurrent !== null && avgPrev !== null ? pctChange(avgCurrent, avgPrev) : null,
  };

  const growth = pctChange(revenueCurrent, revenuePrev);
  const monthlyGrowthRate: GrowthMetricValue = {
    value: growth,
    change: null,
  };

  // --- Monthly history: the same formulas evaluated for each of the last months ---
  const monthKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const firstStudentKey = datedStudents.reduce<string | null>((min, s: any) => {
    const key = startMonthOf(s);
    return key !== null && (min === null || key < min) ? key : min;
  }, null);
  const firstRevenueKey = paidInvoices.reduce<string | null>((min, inv) => {
    const key = receivedMonthOf(inv);
    return key && (min === null || key < min) ? key : min;
  }, null);
  const history: GrowthMetricsHistory = { months: [], newStudents: [], avgRevenuePerStudent: [], monthlyGrowthRate: [] };
  for (let offset = GROWTH_HISTORY_MONTHS - 1; offset >= 0; offset--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - offset - 1, 1);
    const key = monthKeyOf(monthStart);
    const prevKeyOfMonth = monthKeyOf(prevMonthStart);
    history.months.push(key);
    // Before the first student's start there is no data (not "0 new students").
    history.newStudents.push(firstStudentKey !== null && key >= firstStudentKey ? newInMonth(key) : null);
    const paying = payingStudentsOf(key);
    history.avgRevenuePerStudent.push(paying > 0 ? Math.round((revenueOf(key) / paying) * 100) / 100 : null);
    history.monthlyGrowthRate.push(firstRevenueKey !== null && key >= firstRevenueKey
      ? pctChange(revenueOf(key), revenueOf(prevKeyOfMonth))
      : null);
  }

  return {
    history,
    newStudentsWithoutStartDate,
    newStudentsThisMonth,
    retentionRate,
    renewalRate,
    avgPackageValue,
    avgRevenuePerStudent,
    monthlyGrowthRate,
  };
}

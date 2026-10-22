import { supabase } from "@/lib/supabase";
import { calculateReceivedCentsForMonth, invoiceReceiptFields, receivedMonthOf } from "@/lib/finance-cashflow";

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

export interface RealGrowthMetrics {
  newStudentsThisMonth: GrowthMetricValue;
  retentionRate: GrowthMetricValue;
  renewalRate: GrowthMetricValue;
  avgPackageValue: GrowthMetricValue;
  avgRevenuePerStudent: GrowthMetricValue;
  monthlyGrowthRate: GrowthMetricValue;
}

const EMPTY_METRIC: GrowthMetricValue = { value: null, change: null };

export const EMPTY_GROWTH_METRICS: RealGrowthMetrics = {
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

function within(iso: string | null | undefined, from: Date, to: Date): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return d >= from && d < to;
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
      .select("id, status, created_at")
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

  // --- 1. New students this month (vs. previous month) ---
  const newThisMonth = students.filter((s: any) => within(s.created_at, start, nextStart)).length;
  const newPrevMonth = students.filter((s: any) => within(s.created_at, prevStart, start)).length;
  const newStudentsThisMonth: GrowthMetricValue = {
    value: students.length > 0 || newThisMonth > 0 ? newThisMonth : null,
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
    const ended = list.filter((sp) => sp.status !== "active" || sp.ended_at);
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

  return {
    newStudentsThisMonth,
    retentionRate,
    renewalRate,
    avgPackageValue,
    avgRevenuePerStudent,
    monthlyGrowthRate,
  };
}

import { supabase } from "@/lib/supabase";
import { billingModelFromAgreement, billingModelFromPackage } from "@/lib/billing-domain";

export interface MonthlyGoal {
  id: string;
  targetValue: number;
}

export interface MRRResult {
  totalMRR: number;
  contributingStudentRevenues: number[];
  activeStudentCount: number;
  /** Active students represented in totalMRR (individual payers + active members of billed classes). */
  payingStudentCount: number;
  hasBillingData: boolean;
}

export interface GrowthMetrics {
  progressPct: number;
  remaining: number;
  overage: number;
  goalReached: boolean;
  avgTicket: number;
  studentGap: number;
  hasEnoughDataForGap: boolean;
}

/**
 * Format a BRL value to "R$ X.XXX,XX" string
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

/**
 * Strict BRL parser. Accepts "10000", "10.000", "10.000,00", "10000,00",
 * "R$ 10.000,00", "10000.50". Returns null when the input is empty/invalid.
 */
export function parseMoneyBRL(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!s) return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (s.includes(",")) {
    // pt-BR: dots are thousands separators, comma is decimal
    if ((s.match(/,/g) || []).length > 1) return null;
    const [int, dec] = s.split(",");
    if (int.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(int)) return null;
    if (!/^\d{0,2}$/.test(dec)) return null;
    s = int.replace(/\./g, "") + (dec ? "." + dec : "");
  } else if (s.includes(".")) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    else if (!/^\d+\.\d{1,2}$/.test(s)) return null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Lenient wrapper kept for existing callers: invalid input → 0. */
export function parseBRL(raw: string): number {
  return parseMoneyBRL(raw) ?? 0;
}

/**
 * Fetch the teacher's canonical monthly revenue goal from public.business_goals.
 * Returns null if no goal has been set yet.
 */
export async function fetchMonthlyGoal(teacherId: string): Promise<MonthlyGoal | null> {
  if (!teacherId) return null;

  try {
    const { data, error } = await supabase
      .from("business_goals")
      .select("id, target_value")
      .eq("teacher_id", teacherId)
      .eq("metric_name", "monthly_revenue")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn("[growth-engine] fetchMonthlyGoal error:", error.message);
      return null;
    }

    if (!data || !data.target_value) return null;

    return {
      id: data.id,
      targetValue: Number(data.target_value),
    };
  } catch (err) {
    console.warn("[growth-engine] fetchMonthlyGoal unexpected error:", err);
    return null;
  }
}

/**
 * Save (upsert) the teacher's monthly revenue goal to public.business_goals.
 * Real database UPSERT keyed on the unique constraint (teacher_id, metric_name):
 * one row per teacher/metric, no lookup-then-decide, no duplicates.
 * current_value is intentionally omitted: it defaults to 0 on insert and is
 * left untouched on conflict.
 */
export async function saveMonthlyGoal(
  teacherId: string,
  value: number
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) return { success: false, error: "ID de professor inválido." };

  const safeValue = Math.max(1, Math.round(value * 100) / 100);

  try {
    const { error } = await supabase
      .from("business_goals")
      .upsert(
        {
          teacher_id: teacherId,
          title: "Meta de Faturamento Mensal",
          target_value: safeValue,
          metric_name: "monthly_revenue",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "teacher_id,metric_name" }
      );

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao salvar meta." };
  }
}

/**
 * Fetch and compute the teacher's current monthly recurring revenue (MRR)
 * from real active billing agreements.
 */
export async function fetchCurrentMRR(teacherId: string): Promise<MRRResult> {
  const empty: MRRResult = {
    totalMRR: 0,
    contributingStudentRevenues: [],
    activeStudentCount: 0,
    payingStudentCount: 0,
    hasBillingData: false,
  };

  if (!teacherId) return empty;

  try {
    // 1. Fetch teacher's package catalog
    const { data: packagesData } = await supabase
      .from("packages")
      .select("id, name, price, frequency, default_installment_count")
      .eq("teacher_id", teacherId);

    const packagesMap = new Map<string, any>();
    (packagesData || []).forEach((p) => packagesMap.set(p.id, p));

    // 2. Fetch active individual students
    const { data: studentsData } = await supabase
      .from("students")
      .select("id, full_name, status, type, package_id")
      .eq("teacher_id", teacherId)
      .eq("status", "Active");

    const activeStudents = studentsData || [];

    // 3. Fetch active student package agreements
    const { data: spData } = await supabase
      .from("student_packages")
      .select(
        "*"
      )
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const spMap = new Map<string, any>();
    (spData || []).forEach((sp) => spMap.set(sp.student_id, sp));

    // 4. Fetch active classes with their active members
    const { data: classesData } = await supabase
      .from("classes")
      .select(
        "id, name, status, billing_mode, billing_amount, package_id, installment_amount_cents, installment_count, class_members(id, student_id, status)"
      )
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const activeClasses = classesData || [];

    let totalMRR = 0;
    const contributingStudentRevenues: number[] = [];
    let hasBillingData = false;
    let payingStudentCount = 0;

    // --- A. Individual students ---
    const individualStudents = activeStudents.filter((s) => s.type !== "Group");

    individualStudents.forEach((student) => {
      const sp = spMap.get(student.id);
      const pkg = student.package_id ? packagesMap.get(student.package_id) : null;

      let contribution = 0;

      if (sp) {
        const model = sp.billing_model
          ? billingModelFromAgreement(sp)
          : billingModelFromPackage({ frequency: pkg?.frequency || sp.snapshot_frequency });
        const installCount = sp.installment_count || 1;

        if (model === "monthly") {
          contribution = (sp.monthly_amount_cents || sp.total_amount_cents || 0) / 100;
        } else if (model === "one_time") {
          contribution = 0;
        } else if (installCount > 1 && sp.installment_amount_cents) {
          contribution = sp.installment_amount_cents / 100;
        } else if (installCount > 1 && sp.total_amount_cents) {
          contribution = Math.round(sp.total_amount_cents / installCount) / 100;
        } else if (sp.total_amount_cents) {
          contribution = sp.total_amount_cents / 100;
        } else if (pkg) {
          const pkgPrice = pkg.price;
          contribution = pkgPrice < 1000 ? pkgPrice : pkgPrice / 100;
        }
      } else if (pkg) {
        const pkgPrice = pkg.price;
        contribution = pkgPrice < 1000 ? pkgPrice : pkgPrice / 100;
      }

      if (contribution > 0) {
        totalMRR += contribution;
        contributingStudentRevenues.push(contribution);
        payingStudentCount += 1;
        hasBillingData = true;
      }
    });

    // --- B. Group classes ---
    activeClasses.forEach((cls) => {
      const mode = cls.billing_mode || "per_member";
      const pkg = cls.package_id ? packagesMap.get(cls.package_id) : null;
      const activeMembers = (cls.class_members || []).filter(
        (m: any) => m.status === "active"
      );

      if (mode === "shared_class") {
        let classContribution = 0;
        if (cls.billing_amount) {
          classContribution = cls.billing_amount / 100;
        } else if (cls.installment_amount_cents) {
          classContribution = cls.installment_amount_cents / 100;
        } else if (pkg) {
          const pkgPrice = pkg.price;
          classContribution = pkgPrice < 1000 ? pkgPrice : pkgPrice / 100;
        }

        if (classContribution > 0) {
          totalMRR += classContribution;
          payingStudentCount += activeMembers.length;
          hasBillingData = true;
        }
      } else {
        if (activeMembers.length === 0) return;

        let perMemberContrib = 0;
        if (cls.installment_amount_cents) {
          perMemberContrib = cls.installment_amount_cents / 100;
        } else if (cls.billing_amount) {
          perMemberContrib = cls.billing_amount / 100 / (activeMembers.length || 1);
        } else if (pkg) {
          const pkgPrice = pkg.price;
          perMemberContrib = pkgPrice < 1000 ? pkgPrice : pkgPrice / 100;
        }

        if (perMemberContrib > 0) {
          const classTotal = perMemberContrib * activeMembers.length;
          totalMRR += classTotal;
          hasBillingData = true;
          activeMembers.forEach(() => contributingStudentRevenues.push(perMemberContrib));
          payingStudentCount += activeMembers.length;
        }
      }
    });

    return {
      totalMRR: Math.round(totalMRR * 100) / 100,
      contributingStudentRevenues,
      activeStudentCount: activeStudents.length,
      payingStudentCount,
      hasBillingData,
    };
  } catch (err) {
    console.warn("[growth-engine] fetchCurrentMRR error:", err);
    return empty;
  }
}

/**
 * Pure function: compute progress metrics from goal + MRR data.
 * All derived values — never stored.
 */
export function computeGrowthMetrics(
  goalValue: number,
  mrrResult: MRRResult
): GrowthMetrics {
  const { totalMRR, contributingStudentRevenues, hasBillingData } = mrrResult;

  const safeGoal = Math.max(0, goalValue);
  const safeMRR = Math.max(0, totalMRR);

  const progressPct = safeGoal > 0 ? Math.round((safeMRR / safeGoal) * 100) : 0;
  const goalReached = safeMRR >= safeGoal && safeGoal > 0;
  const remaining = goalReached ? 0 : Math.max(0, safeGoal - safeMRR);
  const overage = goalReached ? Math.round((safeMRR - safeGoal) * 100) / 100 : 0;

  const avgTicket =
    hasBillingData && contributingStudentRevenues.length > 0
      ? Math.round(
          (contributingStudentRevenues.reduce((a, b) => a + b, 0) /
            contributingStudentRevenues.length) *
            100
        ) / 100
      : 0;

  const hasEnoughDataForGap = hasBillingData && avgTicket > 0 && remaining > 0;
  const studentGap = hasEnoughDataForGap ? Math.ceil(remaining / avgTicket) : 0;

  return {
    progressPct,
    remaining,
    overage,
    goalReached,
    avgTicket,
    studentGap,
    hasEnoughDataForGap,
  };
}

/** Average weeks per month (52 / 12). */
export const WEEKS_PER_MONTH = 52 / 12;

export interface EffectiveHourlyResult {
  effectiveHourlyRate: number;
  totalMRR: number;
  activeStudentCount: number;
  billableHoursPerMonth: number;
  /** Real recurring teaching minutes per week from active student/class schedules. */
  weeklyTeachingMinutes: number;
  hasEnoughData: boolean;
}

/**
 * Fetch total active monthly operating expenses for the teacher from public.expenses
 */
export async function fetchTeacherExpenses(teacherId: string): Promise<number> {
  if (!teacherId) return 0;

  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("amount_cents")
      .eq("teacher_id", teacherId);

    if (error || !data) return 0;

    const totalCents = data.reduce((acc, row) => acc + (row.amount_cents || 0), 0);
    return Math.round((totalCents / 100) * 100) / 100;
  } catch (err) {
    console.warn("[growth-engine] fetchTeacherExpenses error:", err);
    return 0;
  }
}

/**
 * Compute the teacher's real weighted effective revenue per teaching hour.
 * Group classes count revenue per class teaching hour (not divided per student).
 */
export async function fetchEffectiveHourlyRate(teacherId: string): Promise<EffectiveHourlyResult> {
  const empty: EffectiveHourlyResult = {
    effectiveHourlyRate: 0,
    totalMRR: 0,
    activeStudentCount: 0,
    billableHoursPerMonth: 0,
    weeklyTeachingMinutes: 0,
    hasEnoughData: false,
  };

  if (!teacherId) return empty;

  try {
    const mrrRes = await fetchCurrentMRR(teacherId);

    // Only active students and active classes represent current teaching workload.
    const [studentsRes, classesRes, spRes, pkgRes, settingsRes] = await Promise.all([
      supabase.from("students").select("id, type, package_id").eq("teacher_id", teacherId).eq("status", "Active"),
      supabase.from("classes").select("id, package_id, class_members(student_id, status)").eq("teacher_id", teacherId).eq("status", "active"),
      supabase.from("student_packages").select("student_id, package_id").eq("teacher_id", teacherId).eq("status", "active"),
      supabase.from("packages").select("*").eq("teacher_id", teacherId),
      supabase.from("settings").select("default_class_duration").eq("teacher_id", teacherId).maybeSingle(),
    ]);

    const activeStudents = (studentsRes.data || []) as any[];
    const activeClasses = (classesRes.data || []) as any[];
    const pkgMinutes = new Map<string, number>();
    ((pkgRes.data || []) as any[]).forEach((p) => {
      const m = Number(p.lesson_duration_minutes ?? p.duration);
      if (Number.isFinite(m) && m > 0) pkgMinutes.set(String(p.id), m);
    });
    const spPackage = new Map<string, string>();
    ((spRes.data || []) as any[]).forEach((sp) => { if (sp.package_id) spPackage.set(String(sp.student_id), String(sp.package_id)); });
    const defaultMin = Number((settingsRes as any)?.data?.default_class_duration);
    const teacherDefault = Number.isFinite(defaultMin) && defaultMin > 0 ? defaultMin : 0;

    // Students whose teaching time is represented by a class schedule are not counted individually.
    const classIds = activeClasses.map((c) => c.id);
    const groupStudentIds = new Set<string>();
    activeClasses.forEach((c) => (c.class_members || []).forEach((m: any) => {
      if (!m.status || String(m.status).toLowerCase() === "active") groupStudentIds.add(String(m.student_id));
    }));
    const studentPkgOf = new Map<string, string | null>();
    activeStudents.forEach((s) => {
      studentPkgOf.set(String(s.id), spPackage.get(String(s.id)) ?? (s.package_id ? String(s.package_id) : null));
    });
    const studentIds = activeStudents
      .filter((s) => !groupStudentIds.has(String(s.id)) && s.type !== "Group")
      .map((s) => s.id);

    let studentSchedules: any[] = [];
    if (studentIds.length > 0) {
      const { data: schData } = await supabase.from("student_schedules").select("*").in("student_id", studentIds);
      studentSchedules = schData || [];
    }
    let classSchedules: any[] = [];
    if (classIds.length > 0) {
      const { data: cData } = await supabase.from("class_schedules").select("*").in("class_id", classIds);
      classSchedules = cData || [];
    }
    const classPkg = new Map<string, string | null>(activeClasses.map((c) => [String(c.id), c.package_id ? String(c.package_id) : null]));

    // Duration priority: explicit schedule minutes > start/end > assigned package > teacher default. Unknown = skipped.
    const minutesOf = (sch: any, packageId: string | null | undefined): number => {
      const explicit = Number(sch.duration_minutes ?? sch.duration);
      if (Number.isFinite(explicit) && explicit > 0) return explicit;
      const st = sch.start_time as string | undefined;
      const et = sch.end_time as string | undefined;
      if (st && et) {
        const [sh, sm] = st.split(":").map(Number);
        const [eh, em] = et.split(":").map(Number);
        const mins = (eh * 60 + em) - (sh * 60 + sm);
        if (Number.isFinite(mins) && mins > 0) return mins;
      }
      const pm = packageId ? pkgMinutes.get(packageId) : undefined;
      if (pm) return pm;
      return teacherDefault;
    };

    let weeklyMinutes = 0;
    studentSchedules.forEach((sch) => { weeklyMinutes += minutesOf(sch, studentPkgOf.get(String(sch.student_id))); });
    classSchedules.forEach((sch) => { weeklyMinutes += minutesOf(sch, classPkg.get(String(sch.class_id))); });

    const billableHoursPerMonth = weeklyMinutes > 0
      ? Math.round(((weeklyMinutes / 60) * WEEKS_PER_MONTH) * 10) / 10
      : 0;
    if (weeklyMinutes <= 0 || !mrrRes.hasBillingData || mrrRes.totalMRR <= 0) {
      return {
        ...empty,
        totalMRR: mrrRes.totalMRR,
        activeStudentCount: mrrRes.activeStudentCount,
        billableHoursPerMonth,
        weeklyTeachingMinutes: weeklyMinutes,
      };
    }

    const effectiveHourlyRate = Math.round((mrrRes.totalMRR / billableHoursPerMonth) * 100) / 100;

    return {
      effectiveHourlyRate,
      totalMRR: mrrRes.totalMRR,
      activeStudentCount: mrrRes.activeStudentCount,
      billableHoursPerMonth,
      weeklyTeachingMinutes: weeklyMinutes,
      hasEnoughData: true,
    };
  } catch (err) {
    console.warn("[growth-engine] fetchEffectiveHourlyRate error:", err);
    return empty;
  }
}

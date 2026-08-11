import { supabase } from "@/lib/supabase";

export interface MonthlyGoal {
  id: string;
  targetValue: number;
}

export interface MRRResult {
  totalMRR: number;
  contributingStudentRevenues: number[];
  activeStudentCount: number;
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
 * Parse a BRL string or plain number string into a numeric value.
 * Handles "R$ 10.000,00", "10000,00", "10000.00", "10000".
 */
export function parseBRL(raw: string): number {
  let cleaned = raw.replace(/R\$\s?/g, "").trim();
  if (cleaned.includes(".") && cleaned.includes(",")) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    cleaned = cleaned.replace(",", ".");
  }
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
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
 * If a record with metric_name='monthly_revenue' already exists, updates it.
 * Otherwise inserts a new one.
 */
export async function saveMonthlyGoal(
  teacherId: string,
  value: number
): Promise<{ success: boolean; error?: string }> {
  if (!teacherId) return { success: false, error: "ID de professor inválido." };

  const safeValue = Math.max(1, Math.round(value * 100) / 100);

  try {
    const { data: existing } = await supabase
      .from("business_goals")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("metric_name", "monthly_revenue")
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase
        .from("business_goals")
        .update({ target_value: safeValue, updated_at: new Date().toISOString() })
        .eq("id", existing.id);

      if (error) return { success: false, error: error.message };
    } else {
      const { error } = await supabase.from("business_goals").insert({
        teacher_id: teacherId,
        title: "Meta de Faturamento Mensal",
        target_value: safeValue,
        current_value: 0,
        metric_name: "monthly_revenue",
      });

      if (error) return { success: false, error: error.message };
    }

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
        "id, student_id, package_id, status, total_amount_cents, installment_count, installment_amount_cents, due_day"
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

    // --- A. Individual students ---
    const individualStudents = activeStudents.filter((s) => s.type !== "Group");

    individualStudents.forEach((student) => {
      const sp = spMap.get(student.id);
      const pkg = student.package_id ? packagesMap.get(student.package_id) : null;

      let contribution = 0;

      if (sp) {
        const installCount = sp.installment_count || 1;

        if (installCount > 1 && sp.installment_amount_cents) {
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
        }
      }
    });

    return {
      totalMRR: Math.round(totalMRR * 100) / 100,
      contributingStudentRevenues,
      activeStudentCount: activeStudents.length,
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

export interface EffectiveHourlyResult {
  effectiveHourlyRate: number;
  totalMRR: number;
  activeStudentCount: number;
  billableHoursPerMonth: number;
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
    hasEnoughData: false,
  };

  if (!teacherId) return empty;

  try {
    const mrrRes = await fetchCurrentMRR(teacherId);
    if (!mrrRes.hasBillingData || mrrRes.totalMRR === 0) return empty;

    const { data: studentsData } = await supabase
      .from("students")
      .select("id")
      .eq("teacher_id", teacherId);

    const studentIds = (studentsData || []).map((s: any) => s.id);

    let studentSchedules: any[] = [];
    if (studentIds.length > 0) {
      const { data: schData } = await supabase
        .from("student_schedules")
        .select("student_id, weekday, start_time, end_time")
        .in("student_id", studentIds);
      studentSchedules = schData || [];
    }

    const { data: classSchedules } = await supabase
      .from("class_schedules")
      .select("class_id, weekday, start_time, end_time")
      .eq("teacher_id", teacherId);

    let weeklyHours = 0;

    const getHours = (st?: string, et?: string) => {
      if (!st || !et) return 1.0;
      const [sh, sm] = st.split(":").map(Number);
      const [eh, em] = et.split(":").map(Number);
      const mins = (eh * 60 + em) - (sh * 60 + sm);
      return mins > 0 ? mins / 60 : 1.0;
    };

    (studentSchedules || []).forEach((sch) => {
      weeklyHours += getHours(sch.start_time, sch.end_time);
    });

    (classSchedules || []).forEach((sch) => {
      weeklyHours += getHours(sch.start_time, sch.end_time);
    });

    const billableHoursPerMonth = Math.max(1, Math.round(weeklyHours * 4.33));
    const effectiveHourlyRate = Math.round((mrrRes.totalMRR / billableHoursPerMonth) * 100) / 100;

    return {
      effectiveHourlyRate,
      totalMRR: mrrRes.totalMRR,
      activeStudentCount: mrrRes.activeStudentCount,
      billableHoursPerMonth,
      hasEnoughData: true,
    };
  } catch (err) {
    console.warn("[growth-engine] fetchEffectiveHourlyRate error:", err);
    return empty;
  }
}

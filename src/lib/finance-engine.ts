import { supabase } from "@/lib/supabase";
import {
  BillingDurationType,
  BillingModel,
  billingModelFromAgreement,
  billingModelFromPackage,
  billingDateForMonth,
  buildBillingAgreement,
  isValidBillingDate,
  nextAgreementDueDate,
  normalizeDueDay,
  recurringBillingDate,
  agreementChargeKey,
  buildAgreementChargeDrafts,
  normalizeInvoiceChargeKind,
} from "@/lib/billing-domain";

/** Financial read/write failure that must reach the UI (never swallowed into []). */
export class FinanceSyncError extends Error {
  cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "FinanceSyncError";
    this.cause = cause;
    console.error(`[FinanceEngine] ${message}`, cause);
  }
}

/** Builds invoice rows for a canonical contract that do not exist yet (idempotent). */
function buildMissingAgreementInvoices(
  teacherId: string,
  sp: any,
  ctx: { studentName: string; label: string; modeTag: string; existingKeys: Set<string>; todayStr: string },
): any[] {
  return buildAgreementChargeDrafts(sp)
    .filter((draft) => {
      const key = agreementChargeKey(sp.id, draft.chargeKind, draft.sequenceNumber);
      if (ctx.existingKeys.has(key)) return false;
      ctx.existingKeys.add(key);
      return true;
    })
    .map((draft) => {
      const period = draft.dueDate.slice(0, 7);
      const amount = formatCentsToBRL(draft.amountCents);
      const title = draft.chargeKind === "installment"
        ? `Parcela ${draft.sequenceNumber}/${draft.sequenceCount} - ${ctx.label} (${amount})`
        : draft.chargeKind === "one_time"
          ? `Pagamento único ${ctx.label}`
          : `Mensalidade ${ctx.label}`;
      return {
        teacher_id: teacherId,
        student_id: sp.student_id,
        student_package_id: sp.id,
        charge_kind: draft.chargeKind,
        sequence_number: draft.sequenceNumber,
        sequence_count: draft.sequenceCount,
        invoice_number: `INV-${period.replace("-", "")}-${String(draft.sequenceNumber).padStart(2, "0")}-${String(sp.id).slice(0, 6)}`,
        description: `${title} - ${ctx.studentName} ${ctx.modeTag} | Period: ${period}`,
        amount_cents: draft.amountCents,
        currency: "BRL",
        status: draft.dueDate < ctx.todayStr ? "overdue" : "pending",
        due_date: draft.dueDate,
      };
    });
}

export interface RealInvoice {
  id: string;
  teacherId: string;
  studentId?: string | null;
  classId?: string | null;
  invoiceNumber: string;
  description: string;
  amountCents: number; // Amount in cents (e.g. R$ 300.00 -> 30000)
  amountFormatted: string; // "R$ 300,00"
  currency: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  dueDate: string; // YYYY-MM-DD
  paidAt?: string | null;
  billingPeriod: string; // YYYY-MM
  billingMode: "individual" | "per_member" | "shared_class";
  snapshotPackageName?: string | null;
  targetName: string; // Student name or Class name
  targetType: "Student" | "Class";
  paymentMethod?: string | null;
  createdAt: string;
  // Enhanced Installment & Progress Metadata
  isInstallment?: boolean;
  installmentNumber?: number;
  installmentCount?: number;
  paidInstallmentsCount?: number;
  progressLabel?: string; // "2/6" or "Mensalidade"
  currentInstallmentLabel?: string; // "Parcela 3 de 6" or "Mensalidade"
  remainingBalanceCents?: number;
  studentPackageId?: string | null;
}

export interface RealExpense {
  id: string;
  teacherId: string;
  description: string;
  category: string;
  amountCents: number;
  amountFormatted: string;
  date: string;
  method?: string;
  notes?: string;
}

export interface FinanceKPIs {
  revenueReceived: number; // In BRL units (e.g. 1420.00)
  expectedRevenue: number;
  outstandingBalance: number;
  overdueBalance: number;
  totalExpenses: number;
  netProfit: number;
}

export interface StudentEnrollmentAgreement {
  id?: string;
  studentId: string;
  packageId: string;
  packageName: string;
  totalAmountCents: number;
  installmentCount: number;
  installmentAmountCents: number;
  dueDay: number;
  firstDueDate: string;
  lastDueDate: string;
  paymentMethod: string;
  frequency: string; // "Monthly" | "custom" | "total"
  billingModel?: BillingModel;
  billingDurationType?: BillingDurationType | null;
  contractMonths?: number | null;
  monthlyAmountCents?: number | null;
  expectedTotalCents?: number | null;
}

/**
 * Format currency cents to BRL string
 */
export function formatCentsToBRL(cents: number): string {
  const value = (cents || 0) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Format numeric or string Reais value to BRL currency string (e.g. 359.9 -> "R$ 359,90")
 */
export function formatReaisToBRL(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "R$ 0,00";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  if (isNaN(num)) return "R$ 0,00";
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse user input string or number to a valid decimal number in Reais.
 * Replaces comma with dot, normalizes string, and converts to float with decimal precision.
 * Examples: "359,90" -> 359.9, "359.90" -> 359.9, "" -> 0
 */
export function parseCurrencyToNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  const normalized = String(value).replace(",", ".").trim();
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format a numeric price to an input string for form editing (e.g., 359.9 -> "359,90" in PT)
 */
export function formatNumberToCurrencyInput(
  value: number | string | undefined | null,
  lang: string = "pt"
): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
  if (isNaN(num) || num === 0) return "";
  const isPt = lang === "pt";
  if (Number.isInteger(num)) {
    return String(num);
  }
  return isPt ? num.toFixed(2).replace(".", ",") : num.toFixed(2);
}


/**
 * Calculate exact installment schedule in cents for up to 12 installments.
 * Handles uneven divisions so sum(schedule) === totalCents.
 * Example: R$ 1.000 (100000 cents) / 3 -> [33333, 33333, 33334]
 */
export function calculateInstallmentSchedule(totalCents: number, installmentCount: number): {
  schedule: number[];
  baseAmountCents: number;
  lastAmountCents: number;
  isUneven: boolean;
  totalCents: number;
  installmentCount: number;
} {
  const count = Math.max(1, Math.min(12, Math.round(installmentCount || 1)));
  const total = Math.max(0, Math.round(totalCents || 0));
  const baseAmountCents = Math.floor(total / count);
  const remainderCents = total - (baseAmountCents * count);

  const schedule: number[] = [];
  for (let i = 0; i < count; i++) {
    if (i === count - 1) {
      schedule.push(baseAmountCents + remainderCents);
    } else {
      schedule.push(baseAmountCents);
    }
  }

  return {
    schedule,
    baseAmountCents,
    lastAmountCents: baseAmountCents + remainderCents,
    isUneven: remainderCents !== 0,
    totalCents: total,
    installmentCount: count,
  };
}

/**
 * Calculate first ISO due date (YYYY-MM-DD) from a chosen recurring day of month (1-31).
 * If month has fewer days, caps to the last valid day of that month.
 */
export function getFirstDueDateFromDay(dueDay: number): string {
  const safeDay = normalizeDueDay(dueDay);
  if (!safeDay) throw new Error("Dia de vencimento obrigatório e inválido.");
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed
  const currentDay = now.getDate();

  if (currentDay > safeDay) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const actualDay = Math.min(safeDay, daysInMonth);

  const mm = String(month + 1).padStart(2, "0");
  const dd = String(actualDay).padStart(2, "0");

  return `${year}-${mm}-${dd}`;
}

/**
 * Calculate due date for installment `N` (0-indexed) given firstDueDate
 */
export function calculateInstallmentDueDate(firstDueDateStr: string, installmentIndexZero: number, dueDay?: number | null): string {
  return recurringBillingDate(firstDueDateStr, installmentIndexZero, dueDay);
}

/**
 * Calculate last payment date for an enrollment
 */
export function calculateLastDueDate(firstDueDateStr: string, installmentCount: number, dueDay?: number | null): string {
  const safeCount = Math.max(1, Math.min(12, Math.round(installmentCount || 1)));
  if (safeCount <= 1) return firstDueDateStr;
  return calculateInstallmentDueDate(firstDueDateStr, safeCount - 1, dueDay);
}

/**
 * Extract billing period (YYYY-MM) from invoice description or due_date
 */
export function extractBillingPeriod(inv: any): string {
  if (inv.description && inv.description.includes("Period: ")) {
    const match = inv.description.match(/Period:\s*(\d{4}-\d{2})/);
    if (match) return match[1];
  }
  if (inv.due_date) {
    return inv.due_date.substring(0, 7);
  }
  const dateStr = inv.created_at || new Date().toISOString();
  return dateStr.substring(0, 7);
}

/**
 * Extract billing mode from invoice description or fallback to individual
 */
export function extractBillingMode(description?: string): "individual" | "per_member" | "shared_class" {
  if (!description) return "individual";
  if (description.includes("[Cobrança da Turma]")) return "shared_class";
  if (description.includes("[Por Aluno]")) return "per_member";
  return "individual";
}

/**
 * Deterministically sync receivables for an authenticated teacher using real Supabase data and per-enrollment agreements
 */
export async function syncTeacherReceivables(teacherId: string): Promise<RealInvoice[]> {
  if (!teacherId) return [];
  {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}`;
    const todayStr = currentDate.toISOString().split("T")[0];

    // Fetch all required tables concurrently with explicit column selection
    const results = await Promise.all([
      supabase
        .from("packages")
        .select("*")
        .eq("teacher_id", teacherId),
      supabase
        .from("students")
        .select("id, full_name, status, package_id, type, due_day")
        .eq("teacher_id", teacherId)
        .eq("status", "Active"),
      supabase
        .from("student_packages")
        .select("*")
        .eq("teacher_id", teacherId)
        .eq("status", "active"),
      supabase
        .from("classes")
        .select("id, name, status, billing_mode, package_id, due_day, billing_amount, class_members(student_id, status)")
        .eq("teacher_id", teacherId)
        .eq("status", "active"),
      supabase
        .from("invoices")
        .select("*, payments(id, amount_cents, received_at)")
        .eq("teacher_id", teacherId),
    ]);
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new FinanceSyncError("Não foi possível carregar os dados financeiros.", failed.error);
    const [
      { data: packagesData },
      { data: studentsData },
      { data: studentPackagesData },
      { data: classesData },
      { data: existingInvoicesData },
    ] = results as Array<{ data: any[] | null }>;

    const packagesMap = new Map<string, any>();
    (packagesData || []).forEach((pkg) => {
      packagesMap.set(pkg.id, pkg);
    });

    const activeStudents = studentsData || [];

    const studentPackagesMap = new Map<string, any>();
    (studentPackagesData || []).forEach((sp) => {
      studentPackagesMap.set(sp.student_id, sp);
    });

    const activeClasses = classesData || [];
    const existingInvoices = existingInvoicesData || [];

    // Idempotency keys: contract charges by (student_package_id, charge_kind, sequence_number)
    const existingAgreementKeys = new Set<string>();
    const existingKeys = new Set<string>();
    existingInvoices.forEach((inv: any) => {
      const kind = normalizeInvoiceChargeKind(inv.charge_kind);
      if (inv.student_package_id && kind && inv.sequence_number) {
        existingAgreementKeys.add(agreementChargeKey(inv.student_package_id, kind, inv.sequence_number));
      }
      const period = extractBillingPeriod(inv);
      if (inv.student_id) {
        existingKeys.add(`student_${inv.student_id}_${period}`);
        if (inv.student_package_id && inv.charge_kind === "monthly_charge") {
          existingKeys.add(`agreement_${inv.student_package_id}_month_${period}`);
        }
        if (inv.student_package_id && inv.charge_kind === "installment" && inv.sequence_number) {
          existingKeys.add(`agreement_${inv.student_package_id}_installment_${inv.sequence_number}`);
        }
        if (inv.student_package_id && inv.charge_kind === "one_time") {
          existingKeys.add(`agreement_${inv.student_package_id}_one_time`);
        }
        // Check if invoice description has installment e.g. Parcela 1/8
        const instMatch = inv.description?.match(/Parcela\s+(\d+)\/(\d+)/);
        if (instMatch) {
          existingKeys.add(`student_${inv.student_id}_inst_${instMatch[1]}`);
        }
      }
      if (inv.description && inv.description.includes("[Turma:")) {
        const classMatch = inv.description.match(/\[Turma:\s*([^\]]+)\]/);
        if (classMatch) {
          existingKeys.add(`class_${classMatch[1]}_${period}`);
        }
      }
    });

    const newInvoiceRows: any[] = [];

    // --- A. Contract receivables (individual students and per-member class students) ---
    const perMemberClassByStudent = new Map<string, any>();
    activeClasses.forEach((cls) => {
      if ((cls.billing_mode || "per_member") === "shared_class") return;
      (cls.class_members || [])
        .filter((m: any) => m.status === "active")
        .forEach((m: any) => {
          if (!perMemberClassByStudent.has(m.student_id)) perMemberClassByStudent.set(m.student_id, cls);
        });
    });

    activeStudents.forEach((student) => {
      const sp = studentPackagesMap.get(student.id);
      if (!sp?.billing_model) return; // legacy contracts are never reinterpreted
      const memberClass = student.type === "Group" ? perMemberClassByStudent.get(student.id) : null;
      if (student.type === "Group" && !memberClass) return; // billed by the class
      const pkg = sp.package_id ? packagesMap.get(sp.package_id) : null;
      const label = memberClass ? memberClass.name : pkg?.name || "Plano Personalizado";
      newInvoiceRows.push(
        ...buildMissingAgreementInvoices(teacherId, sp, {
          studentName: student.full_name,
          label,
          modeTag: memberClass ? "[Por Aluno]" : "| [Individual]",
          existingKeys: existingAgreementKeys,
          todayStr,
        }),
      );
    });

    // --- B. Shared class charges ---
    activeClasses.forEach((cls) => {
      if ((cls.billing_mode || "per_member") !== "shared_class") return;
      const pkg = cls.package_id ? packagesMap.get(cls.package_id) : null;
      const classKey = `class_${cls.id}_${currentPeriod}`;
      if (existingKeys.has(classKey)) return;
      const priceCents = cls.billing_amount || (pkg ? Math.round(Number(pkg.price || 0) * 100) : 0);
      const activeMembers = (cls.class_members || []).filter((m: any) => m.status === "active");
      const billedMember = activeMembers.find((member: any) => studentPackagesMap.has(member.student_id));
      const firstStudentId = billedMember?.student_id || null;
      const memberAgreement = firstStudentId ? studentPackagesMap.get(firstStudentId) : null;
      const dueDay = normalizeDueDay(memberAgreement?.due_day);
      const dueDateStr = dueDay ? billingDateForMonth(currentYear, currentDate.getMonth(), dueDay) : null;
      if (!firstStudentId || !memberAgreement?.id || !dueDateStr || priceCents < 1) return;
      newInvoiceRows.push({
        teacher_id: teacherId,
        student_id: firstStudentId,
        student_package_id: memberAgreement.id,
        charge_kind: "monthly",
        invoice_number: `INV-CLS-${currentYear}${currentMonth}-${Math.floor(1000 + Math.random() * 9000)}`,
        description: `Mensalidade ${cls.name} [Cobrança da Turma] [Turma: ${cls.id}] | Period: ${currentPeriod}`,
        amount_cents: priceCents,
        currency: "BRL",
        status: dueDateStr < todayStr ? "overdue" : "pending",
        due_date: dueDateStr,
      });
      existingKeys.add(classKey);
    });

    let insertedInvoices: any[] = [];
    if (newInvoiceRows.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("invoices")
        .insert(newInvoiceRows)
        .select("*, payments(id, amount_cents, received_at)");
      if (insertError) throw new FinanceSyncError("Não foi possível gerar os recebíveis.", insertError);
      insertedInvoices = inserted || [];
    }

    const overdueIds = existingInvoices
      .filter((inv) => inv.status === "pending" && inv.due_date < todayStr)
      .map((inv) => inv.id);
    if (overdueIds.length > 0) {
      const { error: overdueError } = await supabase
        .from("invoices")
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .in("id", overdueIds);
      if (overdueError) throw new FinanceSyncError("Não foi possível atualizar recebíveis vencidos.", overdueError);
    }

    // 6. Directly map invoices in memory from Promise.all data (Eliminates 2nd sequential DB query waterfall)
    const studentsMap = new Map<string, string>();
    activeStudents.forEach((s) => studentsMap.set(s.id, s.full_name));

    const studentPaidCounts = new Map<string, number>();
    const studentPaidSums = new Map<string, number>();

    const allRawInvoices = [
      ...existingInvoices,
      ...insertedInvoices,
    ];

    allRawInvoices.forEach((inv: any) => {
      if (inv.student_id && inv.status === "paid") {
        studentPaidCounts.set(inv.student_id, (studentPaidCounts.get(inv.student_id) || 0) + 1);
        studentPaidSums.set(inv.student_id, (studentPaidSums.get(inv.student_id) || 0) + (inv.amount_cents || 0));
      }
    });

    const mappedInvoices: RealInvoice[] = allRawInvoices.map((inv: any) => {
      const billingMode = extractBillingMode(inv.description);
      const billingPeriod = extractBillingPeriod(inv);

      let targetName = (inv.student_id ? studentsMap.get(inv.student_id) : null) || inv.student?.full_name || "Aluno Registrado";
      let targetType: "Student" | "Class" = "Student";

      if (billingMode === "shared_class") {
        targetType = "Class";
        const matchName = inv.description?.match(/Mensalidade\s+([^\[]+)/);
        if (matchName) {
          targetName = matchName[1].trim();
        }
      }

      let computedStatus: "pending" | "paid" | "overdue" | "cancelled" = inv.status || "pending";
      if (computedStatus === "pending" && inv.due_date < todayStr) {
        computedStatus = "overdue";
      }

      const paymentMethod = inv.payments && inv.payments.length > 0 ? inv.payments[0].method : null;

      let snapshotPackageName = "Plano Personalizado";
      const pkgMatch = inv.description?.match(/(?:Mensalidade|Parcela\s+\d+\/\d+\s+-)\s+([^|(\[]+)/);
      if (pkgMatch) {
        snapshotPackageName = pkgMatch[1].trim();
      }

      const instMatch = inv.description?.match(/Parcela\s+(\d+)\/(\d+)/);
      const sp = inv.student_id ? studentPackagesMap.get(inv.student_id) : null;

      let isInstallment = false;
      let installmentNumber: number | undefined = undefined;
      let installmentCount: number | undefined = undefined;
      let paidCount = 0;
      let progressLabel = "Mensalidade";
      let currentInstallmentLabel = "Mensalidade";
      let remainingBalanceCents = 0;

      if (instMatch) {
        isInstallment = true;
        installmentNumber = parseInt(instMatch[1], 10);
        installmentCount = parseInt(instMatch[2], 10);
        paidCount = inv.student_id ? (studentPaidCounts.get(inv.student_id) || 0) : 0;
        progressLabel = `${paidCount}/${installmentCount}`;
        currentInstallmentLabel = `Parcela ${installmentNumber} de ${installmentCount}`;
        const totalCents = sp?.total_amount_cents || (inv.amount_cents * installmentCount);
        const paidSum = inv.student_id ? (studentPaidSums.get(inv.student_id) || 0) : 0;
        remainingBalanceCents = Math.max(0, totalCents - paidSum);
      } else if (sp && billingModelFromAgreement(sp) === "installment_total" && (sp.installment_count || 1) > 1) {
        isInstallment = true;
        const validInstallmentCount = sp.installment_count || 1;
        installmentCount = validInstallmentCount;
        paidCount = studentPaidCounts.get(inv.student_id) || 0;
        progressLabel = `${paidCount}/${validInstallmentCount}`;
        currentInstallmentLabel = `Parcela ${Math.min(paidCount + 1, validInstallmentCount)} de ${validInstallmentCount}`;
        const totalCents = sp.total_amount_cents || (inv.amount_cents * validInstallmentCount);
        const paidSum = studentPaidSums.get(inv.student_id) || 0;
        remainingBalanceCents = Math.max(0, totalCents - paidSum);
      }

      return {
        id: inv.id,
        teacherId: inv.teacher_id,
        studentId: inv.student_id,
        classId: null,
        invoiceNumber: inv.invoice_number || `INV-${inv.id.substring(0, 6)}`,
        description: inv.description || "",
        amountCents: inv.amount_cents || 0,
        amountFormatted: formatCentsToBRL(inv.amount_cents || 0),
        currency: inv.currency || "BRL",
        status: computedStatus,
        dueDate: inv.due_date,
        paidAt: inv.paid_at,
        billingPeriod,
        billingMode,
        snapshotPackageName,
        targetName,
        targetType,
        paymentMethod,
        createdAt: inv.created_at || new Date().toISOString(),
        isInstallment,
        installmentNumber,
        installmentCount,
        paidInstallmentsCount: paidCount,
        progressLabel,
        currentInstallmentLabel,
        remainingBalanceCents,
        studentPackageId: inv.student_package_id || null,
      };
    });

    return mappedInvoices.sort((a, b) => (b.dueDate > a.dueDate ? 1 : -1));
  }
}

/**
 * Save or Update Student Enrollment Agreement Snapshot in public.student_packages
 */
export async function saveStudentEnrollmentAgreement(agreement: {
  teacherId: string;
  studentId: string;
  packageId: string;
  totalAmountCents: number | null;
  installmentCount: number | null;
  installmentAmountCents: number | null;
  dueDay: number;
  firstDueDate: string;
  paymentMethod?: string;
  billingModel: BillingModel;
  billingDurationType?: BillingDurationType | null;
  contractMonths?: number | null;
  monthlyAmountCents?: number | null;
  expectedTotalCents?: number | null;
  lastDueDate?: string | null;
}): Promise<boolean> {
  const {
    teacherId,
    studentId,
    packageId,
    totalAmountCents,
    installmentCount,
    dueDay,
    firstDueDate,
    paymentMethod = "Pix",
    billingModel,
    billingDurationType = null,
    contractMonths = null,
    monthlyAmountCents = null,
    expectedTotalCents = null,
    lastDueDate: providedLastDueDate,
  } = agreement;

  if (!teacherId || !studentId || !packageId) return false;
  const canonicalDueDay = normalizeDueDay(dueDay);
  if (!canonicalDueDay || !isValidBillingDate(firstDueDate)) return false;

  try {
    const safeInstallmentCount = billingModel === "installment_total"
      ? Math.max(1, Math.min(24, Math.round(installmentCount || 1)))
      : null;
    const scheduleInfo = safeInstallmentCount
      ? calculateInstallmentSchedule(totalAmountCents || 0, safeInstallmentCount)
      : null;
    const lastDueDate = providedLastDueDate ?? (
      billingModel === "one_time" ? firstDueDate : safeInstallmentCount
        ? calculateLastDueDate(firstDueDate, safeInstallmentCount, canonicalDueDay)
        : null
    );

    const canonicalRow = {
      student_id: studentId,
      package_id: packageId,
      teacher_id: teacherId,
      started_at: firstDueDate,
      status: "active",
      total_amount_cents: totalAmountCents,
      installment_count: safeInstallmentCount,
      installment_amount_cents: scheduleInfo?.baseAmountCents || null,
      due_day: canonicalDueDay,
      first_due_date: firstDueDate,
      last_due_date: lastDueDate,
      payment_method: paymentMethod,
      snapshot_frequency: billingModel,
      billing_model: billingModel,
      billing_duration_type: billingDurationType,
      contract_duration_months: contractMonths,
      monthly_amount_cents: monthlyAmountCents,
    };

    const { data: inserted, error } = await supabase.from("student_packages").insert(canonicalRow).select("*").single();

    if (error || !inserted) {
      console.error("[Student Save Failure]", {
        step: "student_packages_insert",
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
      console.error("[FinanceEngine] Error inserting enrollment agreement:", error);
      return false;
    }

    // Generate this contract's receivables before retiring the previous contract.
    // If they cannot be created, the brand-new contract is removed and the error reaches the UI.
    try {
      await createAgreementReceivables(teacherId, inserted);
    } catch (receivablesError) {
      await supabase.from("student_packages").delete().eq("id", inserted.id).eq("teacher_id", teacherId);
      throw receivablesError;
    }

    await supabase
      .from("student_packages")
      .update({ status: "inactive", ended_at: new Date().toISOString().split("T")[0] })
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId)
      .eq("status", "active")
      .neq("id", inserted.id);

    return true;
  } catch (err) {
    if (err instanceof FinanceSyncError) throw err;
    console.error("[FinanceEngine] Error saving enrollment agreement:", err);
    return false;
  }
}

/** Creates the initial receivables of one canonical contract, skipping any that already exist. */
export async function createAgreementReceivables(teacherId: string, sp: any): Promise<void> {
  if (!sp?.billing_model) return;
  const [{ data: existing, error: existingError }, { data: student, error: studentError }, { data: pkg }] = await Promise.all([
    supabase.from("invoices").select("student_package_id, charge_kind, sequence_number").eq("teacher_id", teacherId).eq("student_package_id", sp.id),
    supabase.from("students").select("full_name, type").eq("id", sp.student_id).maybeSingle(),
    sp.package_id
      ? supabase.from("packages").select("name").eq("id", sp.package_id).maybeSingle()
      : Promise.resolve({ data: null } as any),
  ]);
  if (existingError) throw new FinanceSyncError("Não foi possível verificar os recebíveis do contrato.", existingError);
  if (studentError) throw new FinanceSyncError("Não foi possível carregar o aluno do contrato.", studentError);

  const existingKeys = new Set<string>();
  (existing || []).forEach((inv: any) => {
    const kind = normalizeInvoiceChargeKind(inv.charge_kind);
    if (kind && inv.sequence_number) existingKeys.add(agreementChargeKey(sp.id, kind, inv.sequence_number));
  });

  let rows: any[];
  try {
    rows = buildMissingAgreementInvoices(teacherId, sp, {
      studentName: student?.full_name || "Aluno",
      label: pkg?.name || "Plano Personalizado",
      modeTag: student?.type === "Group" ? "[Por Aluno]" : "| [Individual]",
      existingKeys,
      todayStr: new Date().toISOString().split("T")[0],
    });
  } catch (domainError) {
    throw new FinanceSyncError((domainError as Error).message, domainError);
  }
  if (rows.length === 0) return;
  const { error } = await supabase.from("invoices").insert(rows);
  if (error) throw new FinanceSyncError("Não foi possível gerar as cobranças do contrato.", error);
}

/**
 * Fetch and format all invoices for a teacher, augmenting with derived installment progress
 */
export async function fetchTeacherInvoices(teacherId: string): Promise<RealInvoice[]> {
  if (!teacherId) return [];

  try {
    const { data: invoicesData, error } = await supabase
      .from("invoices")
      .select("*, student:students(full_name), payments(*)")
      .eq("teacher_id", teacherId)
      .order("due_date", { ascending: false });

    if (error || !invoicesData) {
      throw new FinanceSyncError("Não foi possível carregar os recebíveis.", error);
    }

    const { data: studentPackagesData } = await supabase
      .from("student_packages")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const spMap = new Map<string, any>();
    (studentPackagesData || []).forEach((sp) => {
      spMap.set(sp.student_id, sp);
    });

    const studentPaidCounts = new Map<string, number>();
    const studentPaidSums = new Map<string, number>();

    invoicesData.forEach((inv: any) => {
      if (inv.student_id && inv.status === "paid") {
        studentPaidCounts.set(inv.student_id, (studentPaidCounts.get(inv.student_id) || 0) + 1);
        studentPaidSums.set(inv.student_id, (studentPaidSums.get(inv.student_id) || 0) + (inv.amount_cents || 0));
      }
    });

    const todayStr = new Date().toISOString().split("T")[0];

    return invoicesData.map((inv: any) => {
      const billingMode = extractBillingMode(inv.description);
      const billingPeriod = extractBillingPeriod(inv);
      
      let targetName = inv.student?.full_name || "Aluno Registrado";
      let targetType: "Student" | "Class" = "Student";

      if (billingMode === "shared_class") {
        targetType = "Class";
        const matchName = inv.description?.match(/Mensalidade\s+([^\[]+)/);
        if (matchName) {
          targetName = matchName[1].trim();
        }
      }

      let computedStatus: "pending" | "paid" | "overdue" | "cancelled" = inv.status || "pending";
      if (computedStatus === "pending" && inv.due_date < todayStr) {
        computedStatus = "overdue";
      }

      const paymentMethod = inv.payments && inv.payments.length > 0 ? inv.payments[0].method : null;

      let snapshotPackageName = "Plano Personalizado";
      const pkgMatch = inv.description?.match(/(?:Mensalidade|Parcela\s+\d+\/\d+\s+-)\s+([^|(\[]+)/);
      if (pkgMatch) {
        snapshotPackageName = pkgMatch[1].trim();
      }

      // Derived Installment & Progress Logic
      const instMatch = inv.description?.match(/Parcela\s+(\d+)\/(\d+)/);
      const sp = inv.student_id ? spMap.get(inv.student_id) : null;

      let isInstallment = false;
      let installmentNumber: number | undefined = undefined;
      let installmentCount: number | undefined = undefined;
      let paidCount = 0;
      let progressLabel = "Mensalidade";
      let currentInstallmentLabel = "Mensalidade";
      let remainingBalanceCents = 0;

      if (instMatch) {
        isInstallment = true;
        installmentNumber = parseInt(instMatch[1], 10);
        installmentCount = parseInt(instMatch[2], 10);
        paidCount = inv.student_id ? (studentPaidCounts.get(inv.student_id) || 0) : 0;
        progressLabel = `${paidCount}/${installmentCount}`;
        currentInstallmentLabel = `Parcela ${installmentNumber} de ${installmentCount}`;
        const totalCents = sp?.total_amount_cents || (inv.amount_cents * installmentCount);
        const paidSum = inv.student_id ? (studentPaidSums.get(inv.student_id) || 0) : 0;
        remainingBalanceCents = Math.max(0, totalCents - paidSum);
      } else if (sp && billingModelFromAgreement(sp) === "installment_total" && (sp.installment_count || 1) > 1) {
        isInstallment = true;
        const validInstallmentCount = sp.installment_count || 1;
        installmentCount = validInstallmentCount;
        paidCount = studentPaidCounts.get(inv.student_id) || 0;
        progressLabel = `${paidCount}/${validInstallmentCount}`;
        currentInstallmentLabel = `Parcela ${Math.min(paidCount + 1, validInstallmentCount)} de ${validInstallmentCount}`;
        const totalCents = sp.total_amount_cents || (inv.amount_cents * validInstallmentCount);
        const paidSum = studentPaidSums.get(inv.student_id) || 0;
        remainingBalanceCents = Math.max(0, totalCents - paidSum);
      }

      return {
        id: inv.id,
        teacherId: inv.teacher_id,
        studentId: inv.student_id,
        classId: null,
        invoiceNumber: inv.invoice_number || `INV-${inv.id.substring(0, 6)}`,
        description: inv.description || "",
        amountCents: inv.amount_cents || 0,
        amountFormatted: formatCentsToBRL(inv.amount_cents || 0),
        currency: inv.currency || "BRL",
        status: computedStatus,
        dueDate: inv.due_date,
        paidAt: inv.paid_at,
        billingPeriod,
        billingMode,
        snapshotPackageName,
        targetName,
        targetType,
        paymentMethod,
        createdAt: inv.created_at,
        isInstallment,
        installmentNumber,
        installmentCount,
        paidInstallmentsCount: paidCount,
        progressLabel,
        currentInstallmentLabel,
        remainingBalanceCents,
        studentPackageId: inv.student_package_id || null,
      };
    });
  } catch (err) {
    if (err instanceof FinanceSyncError) throw err;
    throw new FinanceSyncError("Não foi possível carregar os recebíveis.", err);
  }
}

export interface StudentFinancialSummary {
  studentId: string;
  hasActiveAgreement: boolean;
  packageId?: string;
  packageName: string;
  billingModelLabel: string;
  isInstallment: boolean;
  totalAmountCents: number;
  installmentAmountCents: number;
  installmentCount: number;
  paidInstallmentsCount: number;
  progressLabel: string; // e.g. "2/6 pagas" or "Mensalidade"
  currentInstallmentLabel: string; // e.g. "Parcela 3 de 6" or "Mensalidade"
  nextDueDate: string | null;
  lastPaymentDate: string | null;
  remainingBalanceCents: number;
  remainingBalanceFormatted: string;
  invoices: RealInvoice[];
}

/**
 * Get comprehensive financial summary for a student profile
 */
export async function getStudentFinancialSummary(
  teacherId: string,
  studentId: string
): Promise<StudentFinancialSummary> {
  const defaultSummary: StudentFinancialSummary = {
    studentId,
    hasActiveAgreement: false,
    packageName: "Nenhum plano ativo",
    billingModelLabel: "Sem cobrança",
    isInstallment: false,
    totalAmountCents: 0,
    installmentAmountCents: 0,
    installmentCount: 1,
    paidInstallmentsCount: 0,
    progressLabel: "Nenhum",
    currentInstallmentLabel: "Nenhum",
    nextDueDate: null,
    lastPaymentDate: null,
    remainingBalanceCents: 0,
    remainingBalanceFormatted: "R$ 0,00",
    invoices: [],
  };

  if (!teacherId || !studentId) return defaultSummary;

  try {
    const { data: spData } = await supabase
      .from("student_packages")
      .select("*, package:packages(name, frequency)")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();

    const allInvoices = await fetchTeacherInvoices(teacherId);
    const allStudentInvoices = allInvoices.filter((i) => i.studentId === studentId);

    if (!spData) {
      return {
        ...defaultSummary,
        invoices: allStudentInvoices,
      };
    }

    const pkgName = spData.package?.name || "Pacote Personalizado";
    const billingModel = spData.billing_model
      ? billingModelFromAgreement(spData)
      : billingModelFromPackage({ frequency: spData.snapshot_frequency || spData.package?.frequency });
    const isInstallment = billingModel === "installment_total";
    const agreementStart = spData.first_due_date || spData.started_at;
    const agreementEnd = spData.ended_at || spData.last_due_date || null;
    const agreementCreatedAt = spData.created_at || "";
    const studentInvoices = allStudentInvoices.filter((invoice) => {
      if (invoice.studentPackageId) return invoice.studentPackageId === spData.id;
      const invoiceCreatedAt = invoice.createdAt || "";
      return Boolean(
        agreementStart
        && invoice.dueDate >= agreementStart
        && (!agreementEnd || invoice.dueDate <= agreementEnd)
        && (!agreementCreatedAt || invoiceCreatedAt >= agreementCreatedAt),
      );
    });

    const totalAmountCents = spData.expected_total_cents || spData.total_amount_cents || spData.monthly_amount_cents || 0;
    const installmentCount = isInstallment ? Math.max(1, Math.min(24, spData.installment_count || 1)) : 1;

    const paidInvoices = studentInvoices.filter((i) => i.status === "paid");
    const paidInstallmentsCount = paidInvoices.length;

    const paidSumCents = paidInvoices.reduce((sum, i) => sum + i.amountCents, 0);
    const remainingBalanceCents = isInstallment ? Math.max(0, totalAmountCents - paidSumCents) : 0;

    const pendingInvoices = studentInvoices.filter((i) => i.status === "pending" || i.status === "overdue");
    pendingInvoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const nextDueDate = pendingInvoices.length > 0
      ? pendingInvoices[0].dueDate
      : nextAgreementDueDate({
          firstDueDate: spData.first_due_date,
          dueDay: spData.due_day,
          billingModel,
          installmentCount: spData.installment_count,
          contractMonths: spData.billing_duration_type === "fixed"
            ? spData.contract_duration_months ?? spData.contract_months
            : null,
          lastDueDate: spData.last_due_date,
          afterDate: todayStr,
        });

    const paidInvoicesWithDate = paidInvoices.filter((i) => i.paidAt).sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
    const lastPaymentDate = paidInvoicesWithDate.length > 0 ? paidInvoicesWithDate[0].paidAt?.substring(0, 10) || null : null;

    const currentInstallmentNum = Math.min(paidInstallmentsCount + 1, installmentCount);

    return {
      studentId,
      hasActiveAgreement: true,
      packageId: spData.package_id,
      packageName: pkgName,
      billingModelLabel: isInstallment ? "Valor total do curso (Parcelado)" : billingModel === "one_time" ? "Pagamento único" : "Mensalidade",
      isInstallment,
      totalAmountCents,
      installmentAmountCents: isInstallment
        ? spData.installment_amount_cents || Math.round(totalAmountCents / installmentCount)
        : spData.monthly_amount_cents || spData.total_amount_cents || 0,
      installmentCount,
      paidInstallmentsCount,
      progressLabel: isInstallment ? `${paidInstallmentsCount}/${installmentCount} pagas` : billingModel === "one_time" ? (paidInstallmentsCount ? "Pago" : "Pendente") : "Mensalidade",
      currentInstallmentLabel: isInstallment ? `Parcela ${currentInstallmentNum} de ${installmentCount}` : billingModel === "one_time" ? "Pagamento único" : "Mensalidade",
      nextDueDate,
      lastPaymentDate,
      remainingBalanceCents,
      remainingBalanceFormatted: formatCentsToBRL(remainingBalanceCents),
      invoices: studentInvoices,
    };
  } catch (err) {
    console.error("[FinanceEngine] Error getting student financial summary:", err);
    return defaultSummary;
  }
}

/**
 * Mark a receivable/invoice as paid and log payment record in Supabase
 */
export async function markInvoiceAsPaid(
  invoiceId: string,
  teacherId: string,
  method: string = "Pix"
): Promise<boolean> {
  if (!invoiceId || !teacherId) return false;

  try {
    const { data: inv, error: invFetchErr } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .eq("teacher_id", teacherId)
      .single();

    if (invFetchErr || !inv) throw new Error("Invoice not found");

    const paidAtStr = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: paidAtStr,
        updated_at: paidAtStr,
      })
      .eq("id", invoiceId);

    if (updateErr) throw updateErr;

    const { error: payErr } = await supabase.from("payments").insert({
      teacher_id: teacherId,
      invoice_id: invoiceId,
      amount_cents: inv.amount_cents,
      currency: inv.currency || "BRL",
      method: method || "Pix",
      received_at: paidAtStr,
    });

    if (payErr) {
      console.warn("[FinanceEngine] Payment insert note:", payErr.message);
    }

    return true;
  } catch (err) {
    console.error("[FinanceEngine] Error marking invoice paid:", err);
    return false;
  }
}

/**
 * Update payment status
 */
export async function updateInvoiceStatus(
  invoiceId: string,
  teacherId: string,
  newStatus: "pending" | "cancelled"
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("invoices")
      .update({
        status: newStatus,
        paid_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId)
      .eq("teacher_id", teacherId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[FinanceEngine] Error updating invoice status:", err);
    return false;
  }
}

/**
 * Fetch Real Expenses from Supabase
 */
export async function fetchTeacherExpenses(teacherId: string): Promise<RealExpense[]> {
  if (!teacherId) return [];

  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("*, category:expense_categories(name)")
      .eq("teacher_id", teacherId)
      .order("date", { ascending: false });

    if (error || !data) return [];

    return data.map((exp: any) => ({
      id: exp.id,
      teacherId: exp.teacher_id,
      description: exp.description,
      category: exp.category?.name || "Geral",
      amountCents: exp.amount_cents,
      amountFormatted: formatCentsToBRL(exp.amount_cents),
      date: exp.date,
      method: "Card",
    }));
  } catch (err) {
    console.error("[FinanceEngine] Error fetching expenses:", err);
    return [];
  }
}

/**
 * Add a new real expense to Supabase
 */
export async function createTeacherExpense(
  teacherId: string,
  description: string,
  amountCents: number,
  date: string,
  categoryName: string = "Software"
): Promise<boolean> {
  if (!teacherId || !description || !amountCents) return false;

  try {
    const { error } = await supabase.from("expenses").insert({
      teacher_id: teacherId,
      description,
      amount_cents: amountCents,
      currency: "BRL",
      date: date || new Date().toISOString().split("T")[0],
    });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[FinanceEngine] Error creating expense:", err);
    return false;
  }
}

/**
 * Delete real expense from Supabase
 */
export async function deleteTeacherExpense(expenseId: string, teacherId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("expenses")
      .delete()
      .eq("id", expenseId)
      .eq("teacher_id", teacherId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("[FinanceEngine] Error deleting expense:", err);
    return false;
  }
}

/**
 * Compute real Finance KPIs directly from Supabase invoices, payments, and expenses
 */
export async function fetchFinanceKPIs(teacherId: string): Promise<FinanceKPIs> {
  if (!teacherId) {
    return {
      revenueReceived: 0,
      expectedRevenue: 0,
      outstandingBalance: 0,
      overdueBalance: 0,
      totalExpenses: 0,
      netProfit: 0,
    };
  }

  try {
    const invoices = await syncTeacherReceivables(teacherId);
    const expenses = await fetchTeacherExpenses(teacherId);

    let receivedCents = 0;
    let expectedCents = 0;
    let outstandingCents = 0;
    let overdueCents = 0;

    invoices.forEach((inv) => {
      expectedCents += inv.amountCents;
      if (inv.status === "paid") {
        receivedCents += inv.amountCents;
      } else if (inv.status === "pending") {
        outstandingCents += inv.amountCents;
      } else if (inv.status === "overdue") {
        outstandingCents += inv.amountCents;
        overdueCents += inv.amountCents;
      }
    });

    const expensesCents = expenses.reduce((sum, exp) => sum + exp.amountCents, 0);

    const revenueReceived = receivedCents / 100;
    const expectedRevenue = expectedCents / 100;
    const outstandingBalance = outstandingCents / 100;
    const overdueBalance = overdueCents / 100;
    const totalExpenses = expensesCents / 100;
    const netProfit = revenueReceived - totalExpenses;

    return {
      revenueReceived,
      expectedRevenue,
      outstandingBalance,
      overdueBalance,
      totalExpenses,
      netProfit,
    };
  } catch (err) {
    console.error("[FinanceEngine] Error computing KPIs:", err);
    return {
      revenueReceived: 0,
      expectedRevenue: 0,
      outstandingBalance: 0,
      overdueBalance: 0,
      totalExpenses: 0,
      netProfit: 0,
    };
  }
}

// ============================================================================
// BLOOM FINANCE — PAYMENT HISTORY & PACKAGE RENEWAL ENGINE
// ============================================================================

export interface PaymentHistoryItem {
  id: string;
  paymentDate: string; // YYYY-MM-DD
  packageName: string;
  amountCents: number;
  amountFormatted: string;
  invoiceReference: string;
  installmentLabel?: string; // "Parcela 2 de 6" or "Mensalidade"
  installmentNumber?: number;
  installmentCount?: number;
  paymentMethod: string;
  status: "Pago" | "Pendente" | "Atrasado" | "Cancelado";
  billingPeriod: string; // YYYY-MM
  notes?: string;
}

export interface PackageAgreementRecord {
  id: string;
  packageId: string;
  packageName: string;
  status: "active" | "completed" | "cancelled" | "paused" | "inactive";
  statusLabel: string; // "Ativo", "Concluído", etc.
  startedAt: string; // YYYY-MM-DD
  endedAt: string | null; // YYYY-MM-DD
  totalAmountCents: number;
  totalAmountFormatted: string;
  installmentCount: number;
  installmentAmountCents: number;
  installmentAmountFormatted: string;
  paidInstallmentsCount: number;
  progressLabel: string; // "6/6 pagas" or "0/8 pagas"
  changeType: "initial" | "renewal" | "upgrade" | "downgrade" | "lateral";
  changeTypeLabel: string; // "Inicial", "Renovação", "Upgrade", "Downgrade", "Troca de pacote"
  paymentMethod: string;
  dueDay: number;
  firstDueDate: string;
  lastDueDate: string;
  isCurrent: boolean;
  billingModel: BillingModel;
  billingModelLabel: string;
  agreementValueLabel: string;
  paymentTermsLabel: string;
}

export interface FinancialTimelineEvent {
  id: string;
  type:
    | "package_assigned"
    | "invoice_generated"
    | "payment_received"
    | "installment_paid"
    | "package_renewed"
    | "package_changed"
    | "upgrade"
    | "downgrade"
    | "package_ended"
    | "billing_paused";
  date: string; // YYYY-MM-DD or ISO
  title: string;
  description: string;
  badgeText?: string;
  badgeVariant?: "default" | "secondary" | "outline" | "destructive";
}

export interface PackageRenewalAlert {
  studentId: string;
  studentName: string;
  packageId: string;
  packageName: string;
  daysRemaining: number;
  endDate: string; // YYYY-MM-DD
  alertLevel: "subtle" | "warning" | "expired";
  alertMessage: string;
}

export interface RenewStudentPackageOptions {
  teacherId: string;
  studentId: string;
  newPackageId: string;
  isSamePackage: boolean;
  startDate?: string; // Optional start date override (default: day after current package ends)
  totalAmountCents?: number;
  installmentCount?: number;
  dueDay?: number;
  paymentMethod?: string;
  renewalNotes?: string;
  billingDurationType?: BillingDurationType;
  contractMonths?: number | null;
}

/**
 * Fetch immutable payment history for a specific student.
 * Never calculates old payment history from current package; reads stored invoice & payment snapshots.
 */
export async function getStudentPaymentHistory(
  teacherId: string,
  studentId: string
): Promise<PaymentHistoryItem[]> {
  if (!teacherId || !studentId) return [];

  try {
    const { data: invoicesData, error: invErr } = await supabase
      .from("invoices")
      .select("*, payments(*)")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .order("due_date", { ascending: false });

    if (invErr || !invoicesData) {
      console.error("[FinanceEngine] Error fetching payment history invoices:", invErr);
      return [];
    }

    const history: PaymentHistoryItem[] = [];

    invoicesData.forEach((inv: any) => {
      const payments = inv.payments || [];
      const instMatch = inv.description?.match(/Parcela\s+(\d+)\/(\d+)/);
      const installmentNumber = instMatch ? parseInt(instMatch[1], 10) : undefined;
      const installmentCount = instMatch ? parseInt(instMatch[2], 10) : undefined;
      const installmentLabel = instMatch
        ? `Parcela ${installmentNumber} de ${installmentCount}`
        : "Mensalidade";

      let packageName = inv.snapshot_package_name || "Plano Personalizado";
      if (!inv.snapshot_package_name) {
        const pkgMatch = inv.description?.match(/(?:Mensalidade|Parcela\s+\d+\/\d+\s+-)\s+([^|(\[]+)/);
        if (pkgMatch) {
          packageName = pkgMatch[1].trim();
        }
      }

      const billingPeriod = extractBillingPeriod(inv);
      const invoiceRef = inv.invoice_number || `INV-${inv.id.substring(0, 6)}`;

      if (payments.length > 0) {
        payments.forEach((pay: any) => {
          history.push({
            id: pay.id,
            paymentDate: pay.received_at ? pay.received_at.substring(0, 10) : inv.paid_at?.substring(0, 10) || inv.due_date,
            packageName,
            amountCents: pay.amount_cents || inv.amount_cents,
            amountFormatted: formatCentsToBRL(pay.amount_cents || inv.amount_cents),
            invoiceReference: invoiceRef,
            installmentLabel,
            installmentNumber,
            installmentCount,
            paymentMethod: pay.method || "Pix",
            status: "Pago",
            billingPeriod,
            notes: pay.notes || undefined,
          });
        });
      } else if (inv.status === "paid") {
        history.push({
          id: inv.id,
          paymentDate: inv.paid_at ? inv.paid_at.substring(0, 10) : inv.due_date,
          packageName,
          amountCents: inv.amount_cents,
          amountFormatted: formatCentsToBRL(inv.amount_cents),
          invoiceReference: invoiceRef,
          installmentLabel,
          installmentNumber,
          installmentCount,
          paymentMethod: "Pix",
          status: "Pago",
          billingPeriod,
        });
      }
    });

    // Sort by payment date descending
    return history.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  } catch (err) {
    console.error("[FinanceEngine] Error in getStudentPaymentHistory:", err);
    return [];
  }
}

/**
 * Fetch package agreements history for a student (Active & Past agreements).
 */
export async function getStudentPackageHistory(
  teacherId: string,
  studentId: string
): Promise<PackageAgreementRecord[]> {
  if (!teacherId || !studentId) return [];

  try {
    const { data, error } = await supabase
      .from("student_packages")
      .select("*, package:packages(name, price, frequency)")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .order("started_at", { ascending: false });

    if (error || !data) return [];

    const allInvoices = await fetchTeacherInvoices(teacherId);
    const studentInvoices = allInvoices.filter((i) => i.studentId === studentId);

    return data.map((sp: any) => {
      const isCurrent = sp.status === "active";
      const packageName = sp.snapshot_package_name || sp.package?.name || "Pacote Personalizado";
      const billingModel = sp.billing_model
        ? billingModelFromAgreement(sp)
        : billingModelFromPackage({ frequency: sp.snapshot_frequency || sp.package?.frequency });
      const catalogPriceCents = sp.package ? Math.round(Number(sp.package.price || 0) * 100) : 0;
      const monthlyAmountCents = sp.monthly_amount_cents || (billingModel === "monthly" ? sp.total_amount_cents || catalogPriceCents : 0);
      const totalAmountCents = sp.expected_total_cents || sp.total_amount_cents || monthlyAmountCents || catalogPriceCents;
      const installmentCount = billingModel === "installment_total" ? Math.max(1, Math.min(24, sp.installment_count || 1)) : 1;
      const installmentAmountCents = billingModel === "installment_total"
        ? sp.installment_amount_cents || Math.round(totalAmountCents / installmentCount)
        : monthlyAmountCents || totalAmountCents;

      // Count paid invoices related to this agreement period
      const agreementInvoices = studentInvoices.filter((inv) => {
        if (inv.dueDate >= sp.started_at && (!sp.ended_at || inv.dueDate <= sp.ended_at)) {
          return true;
        }
        return false;
      });

      const paidCount = agreementInvoices.filter((i) => i.status === "paid").length;

      let statusLabel = "Ativo";
      if (sp.status === "completed") statusLabel = "Concluído";
      else if (sp.status === "inactive") statusLabel = "Anterior";
      else if (sp.status === "cancelled") statusLabel = "Cancelado";
      else if (sp.status === "paused") statusLabel = "Pausado";

      let changeTypeLabel = "Inicial";
      if (sp.change_type === "renewal") changeTypeLabel = "Renovação";
      else if (sp.change_type === "upgrade") changeTypeLabel = "Upgrade";
      else if (sp.change_type === "downgrade") changeTypeLabel = "Downgrade";
      else if (sp.change_type === "lateral") changeTypeLabel = "Troca de pacote";

      const firstDueDate = sp.first_due_date || sp.started_at;
      const lastDueDate = sp.last_due_date || (billingModel === "installment_total"
        ? calculateLastDueDate(firstDueDate, installmentCount, sp.due_day)
        : firstDueDate);
      const billingModelLabel = billingModel === "monthly" ? "Mensalidade" : billingModel === "one_time" ? "Pagamento único" : "Valor total parcelado";
      const agreementValueLabel = billingModel === "monthly"
        ? `${formatCentsToBRL(monthlyAmountCents)} / mês`
        : formatCentsToBRL(totalAmountCents);
      const paymentTermsLabel = billingModel === "monthly"
        ? sp.billing_duration_type === "fixed" && (sp.contract_duration_months ?? sp.contract_months)
          ? `${(sp.contract_duration_months ?? sp.contract_months)} cobranças mensais de ${formatCentsToBRL(monthlyAmountCents)}`
          : `Cobrança mensal de ${formatCentsToBRL(monthlyAmountCents)}`
        : billingModel === "one_time"
          ? `Cobrança única de ${formatCentsToBRL(totalAmountCents)}`
          : `${installmentCount}x de ${formatCentsToBRL(installmentAmountCents)}`;

      return {
        id: sp.id,
        packageId: sp.package_id,
        packageName,
        status: sp.status as any,
        statusLabel,
        startedAt: sp.started_at || sp.first_due_date || (sp.created_at ? sp.created_at.split("T")[0] : new Date().toISOString().split("T")[0]),
        endedAt: sp.ended_at || lastDueDate,
        totalAmountCents,
        totalAmountFormatted: formatCentsToBRL(totalAmountCents),
        installmentCount,
        installmentAmountCents,
        installmentAmountFormatted: formatCentsToBRL(installmentAmountCents),
        paidInstallmentsCount: paidCount,
        progressLabel: billingModel === "installment_total" ? `${paidCount}/${installmentCount} pagas` : billingModel === "one_time" ? (paidCount ? "Pago" : "Pendente") : `${paidCount} mensalidade${paidCount === 1 ? " paga" : "s pagas"}`,
        changeType: (sp.change_type as any) || "initial",
        changeTypeLabel,
        paymentMethod: sp.payment_method || "Pix",
        dueDay: sp.due_day,
        firstDueDate,
        lastDueDate,
        isCurrent,
        billingModel,
        billingModelLabel,
        agreementValueLabel,
        paymentTermsLabel,
      };
    });
  } catch (err) {
    console.error("[FinanceEngine] Error in getStudentPackageHistory:", err);
    return [];
  }
}

/**
 * Generate a chronological financial timeline for a student.
 */
export async function getStudentFinancialTimeline(
  teacherId: string,
  studentId: string
): Promise<FinancialTimelineEvent[]> {
  if (!teacherId || !studentId) return [];

  try {
    const events: FinancialTimelineEvent[] = [];

    // 1. Fetch package agreements
    const packages = await getStudentPackageHistory(teacherId, studentId);
    packages.forEach((pkg) => {
      let title = `Pacote Atribuído: ${pkg.packageName}`;
      let type: FinancialTimelineEvent["type"] = "package_assigned";

      if (pkg.changeType === "renewal") {
        title = `Pacote Renovado: ${pkg.packageName}`;
        type = "package_renewed";
      } else if (pkg.changeType === "upgrade") {
        title = `Upgrade de Pacote: ${pkg.packageName}`;
        type = "upgrade";
      } else if (pkg.changeType === "downgrade") {
        title = `Downgrade de Pacote: ${pkg.packageName}`;
        type = "downgrade";
      } else if (pkg.changeType === "lateral") {
        title = `Troca de Pacote: ${pkg.packageName}`;
        type = "package_changed";
      }

      events.push({
        id: `pkg-start-${pkg.id}`,
        type,
        date: pkg.startedAt,
        title,
        description: `${pkg.billingModelLabel}: ${pkg.paymentTermsLabel} (${pkg.paymentMethod})`,
        badgeText: pkg.changeTypeLabel,
        badgeVariant: pkg.changeType === "upgrade" ? "default" : "secondary",
      });

      if (pkg.status === "completed" && pkg.endedAt) {
        events.push({
          id: `pkg-end-${pkg.id}`,
          type: "package_ended",
          date: pkg.endedAt,
          title: `Pacote Concluído: ${pkg.packageName}`,
          description: `Período encerrado em ${pkg.endedAt}. Todas as parcelas ou mensalidades foram cumpridas.`,
          badgeText: "Concluído",
          badgeVariant: "outline",
        });
      }
    });

    // 2. Fetch invoices & payments
    const { data: invoicesData } = await supabase
      .from("invoices")
      .select("*, payments(*)")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId);

    (invoicesData || []).forEach((inv: any) => {
      const instMatch = inv.description?.match(/Parcela\s+(\d+)\/(\d+)/);
      const isInst = !!instMatch;
      const instLabel = instMatch ? `Parcela ${instMatch[1]} de ${instMatch[2]}` : "Mensalidade";

      events.push({
        id: `inv-gen-${inv.id}`,
        type: "invoice_generated",
        date: inv.created_at?.substring(0, 10) || inv.due_date,
        title: `Fatura Gerada: ${formatCentsToBRL(inv.amount_cents)}`,
        description: `${inv.description.split("|")[0]} — Vencimento: ${inv.due_date}`,
        badgeText: "Cobrança",
        badgeVariant: "outline",
      });

      const payments = inv.payments || [];
      payments.forEach((pay: any) => {
        events.push({
          id: `pay-rec-${pay.id}`,
          type: isInst ? "installment_paid" : "payment_received",
          date: pay.received_at?.substring(0, 10) || inv.paid_at?.substring(0, 10) || inv.due_date,
          title: `${isInst ? "Parcela Paga" : "Pagamento Recebido"}: ${formatCentsToBRL(pay.amount_cents || inv.amount_cents)}`,
          description: `${instLabel} • Meio: ${pay.method || "Pix"} • Ref: ${inv.invoice_number || "Fatura"}`,
          badgeText: "Pago",
          badgeVariant: "default",
        });
      });
    });

    // Sort events by date descending
    return events.sort((a, b) => b.date.localeCompare(a.date));
  } catch (err) {
    console.error("[FinanceEngine] Error in getStudentFinancialTimeline:", err);
    return [];
  }
}

/**
 * Monitor student packages for upcoming expiration within 30 days.
 */
export async function checkPackageExpirationAlerts(
  teacherId: string,
  targetStudentId?: string
): Promise<PackageRenewalAlert[]> {
  if (!teacherId) return [];

  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    // Query active student packages
    let query = supabase
      .from("student_packages")
      .select("*, student:students(full_name, status), package:packages(name)")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    if (targetStudentId) {
      query = query.eq("student_id", targetStudentId);
    }

    const { data, error } = await query;
    if (error || !data) return [];

    const alerts: PackageRenewalAlert[] = [];

    data.forEach((sp: any) => {
      // Check if student is active
      if (sp.student?.status === "Paused" || sp.student?.status === "Inactive") return;

      const studentName = sp.student?.full_name || "Aluno";
      const packageName = sp.snapshot_package_name || sp.package?.name || "Pacote Ativo";

      // Calculate effective package end date
      let endDateStr = sp.ended_at;
      if (!endDateStr) {
        const billingModel = billingModelFromAgreement(sp);
        if (billingModel === "monthly" && sp.billing_duration_type !== "fixed") return;
        if (sp.last_due_date) {
          endDateStr = sp.last_due_date;
        } else if (sp.first_due_date && sp.installment_count) {
          endDateStr = calculateLastDueDate(sp.first_due_date, sp.installment_count, sp.due_day);
        } else {
          return;
        }
      }

      if (!endDateStr) return;

      // Calculate days remaining
      const endObj = new Date(endDateStr);
      const diffTime = endObj.getTime() - today.getTime();
      const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 30-day threshold logic
      if (daysRemaining <= 30) {
        let alertLevel: PackageRenewalAlert["alertLevel"] = "subtle";
        let alertMessage = `Renovação próxima — ${packageName} termina em ${daysRemaining} dias (${endDateStr.split("-").reverse().join("/")})`;

        if (daysRemaining <= 0) {
          alertLevel = "expired";
          alertMessage = `Pacote encerrado — renovar ${packageName} de ${studentName}`;
        } else if (daysRemaining <= 15) {
          alertLevel = "warning";
          alertMessage = `Atenção: Pacote de ${studentName} termina em ${daysRemaining} dias (${endDateStr.split("-").reverse().join("/")})`;
        }

        alerts.push({
          studentId: sp.student_id,
          studentName,
          packageId: sp.package_id,
          packageName,
          daysRemaining,
          endDate: endDateStr,
          alertLevel,
          alertMessage,
        });
      }
    });

    return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
  } catch (err) {
    console.error("[FinanceEngine] Error in checkPackageExpirationAlerts:", err);
    return [];
  }
}

/**
 * Execute package renewal flow idempotently.
 * Preserves past agreement and creates a new active enrollment agreement.
 */
export async function renewStudentPackage(
  options: RenewStudentPackageOptions
): Promise<{ success: boolean; message: string; newAgreementId?: string }> {
  const {
    teacherId,
    studentId,
    newPackageId,
    isSamePackage,
    startDate,
    totalAmountCents,
    installmentCount = 1,
    dueDay,
    paymentMethod = "Pix",
    renewalNotes,
    billingDurationType,
    contractMonths,
  } = options;

  if (!teacherId || !studentId || !newPackageId) {
    return { success: false, message: "Parâmetros obrigatórios ausentes." };
  }
  const canonicalDueDay = normalizeDueDay(dueDay);
  if (!canonicalDueDay || !isValidBillingDate(startDate)) {
    return { success: false, message: "Informe o dia e a data do primeiro vencimento." };
  }

  try {
    // 1. Fetch catalog packages to compare old vs new
    const { data: newPkg } = await supabase
      .from("packages")
      .select("*")
      .eq("id", newPackageId)
      .single();

    if (!newPkg) {
      return { success: false, message: "Pacote selecionado não encontrado." };
    }

    // 2. Fetch active student_package to calculate start date & change type
    const { data: currentSp } = await supabase
      .from("student_packages")
      .select("*, package:packages(name, price)")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();

    // Determine target start date (default: day after current package ends or current date)
    let effectiveStartDate = startDate;
    if (!effectiveStartDate) {
      if (currentSp) {
        const curEnd = currentSp.ended_at || currentSp.last_due_date;
        if (curEnd) {
          const endDateObj = new Date(curEnd);
          endDateObj.setDate(endDateObj.getDate() + 1);
          effectiveStartDate = endDateObj.toISOString().split("T")[0];
        }
      }
      if (!effectiveStartDate) {
        effectiveStartDate = new Date().toISOString().split("T")[0];
      }
    }

    // 3. IDEMPOTENCY CHECK: Prevent duplicate agreements on double-click or refresh
    const { data: existingDup } = await supabase
      .from("student_packages")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("student_id", studentId)
      .eq("package_id", newPackageId)
      .eq("started_at", effectiveStartDate)
      .eq("status", "active")
      .maybeSingle();

    if (existingDup) {
      return {
        success: true,
        message: "Renovação já processada anteriormente.",
        newAgreementId: existingDup.id,
      };
    }

    // 4. Classify Change Type (Upgrade vs Downgrade vs Renewal vs Lateral)
    let changeType: "initial" | "renewal" | "upgrade" | "downgrade" | "lateral" = "renewal";

    if (!isSamePackage && currentSp) {
      const oldPrice = currentSp.total_amount_cents || (currentSp.package ? Math.round(Number(currentSp.package.price || 0) * 100) : 0);
      const newPrice = totalAmountCents || Math.round(Number(newPkg.price || 0) * 100);

      if (newPrice > oldPrice) {
        changeType = "upgrade";
      } else if (newPrice < oldPrice) {
        changeType = "downgrade";
      } else {
        changeType = "lateral";
      }
    } else if (isSamePackage) {
      changeType = "renewal";
    }

    // 5. Calculate the new agreement through the canonical billing model.
    const terms = buildBillingAgreement(
      {
        price: Math.max(0, totalAmountCents ?? Math.round(Number(newPkg.price || 0) * 100)) / 100,
        billingModel: newPkg.billing_model,
        frequency: newPkg.frequency,
        billingDurationType: newPkg.billing_duration_type,
        contractMonths: newPkg.contract_duration_months,
        defaultInstallmentCount: newPkg.default_installment_count,
      },
      {
        firstDueDate: effectiveStartDate,
        installmentCount,
        billingDurationType: billingDurationType || newPkg.billing_duration_type,
        contractMonths: contractMonths ?? newPkg.contract_duration_months,
      },
    );
    const finalTotalCents = terms.totalAmountCents || terms.monthlyAmountCents || 0;

    // 7. Insert NEW active package agreement snapshot
    let { data: insertedSp, error: insertErr } = await supabase
      .from("student_packages")
      .insert({
        student_id: studentId,
        package_id: newPackageId,
        teacher_id: teacherId,
        started_at: effectiveStartDate,
        status: "active",
        total_amount_cents: terms.totalAmountCents,
        installment_count: terms.installmentCount,
        installment_amount_cents: terms.installmentAmountCents,
        due_day: canonicalDueDay,
        first_due_date: effectiveStartDate,
        last_due_date: terms.lastDueDate,
        payment_method: paymentMethod,
        snapshot_frequency: terms.billingModel,
        snapshot_package_name: newPkg.name,
        snapshot_package_price_cents: finalTotalCents,
        change_type: changeType,
        renewal_notes: renewalNotes || null,
        renewed_from_id: currentSp?.id || null,
        billing_model: terms.billingModel,
        billing_duration_type: terms.billingDurationType,
        contract_duration_months: terms.contractMonths,
        monthly_amount_cents: terms.monthlyAmountCents,
      })
      .select("*")
      .single();

    if (insertErr || !insertedSp) {
      console.error("[FinanceEngine] Error creating renewed package agreement:", insertErr);
      return { success: false, message: `Erro ao salvar nova renovação: ${insertErr?.message}` };
    }

    // Create the new agreement's receivables before retiring the previous one.
    try {
      await createAgreementReceivables(teacherId, insertedSp);
    } catch (receivablesError: any) {
      await supabase.from("student_packages").delete().eq("id", insertedSp.id).eq("teacher_id", teacherId);
      return { success: false, message: receivablesError?.message || "Não foi possível gerar as cobranças do contrato." };
    }

    // Complete the previous agreement only after the replacement exists.
    if (currentSp) {
      const prevEndDate = new Date(effectiveStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      await supabase
        .from("student_packages")
        .update({
          status: "completed",
          ended_at: prevEndDate.toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentSp.id);
    }

    // 8. Also update student table reference to new package_id
    await supabase
      .from("students")
      .update({
        package_id: newPackageId,
        due_day: canonicalDueDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", studentId)
      .eq("teacher_id", teacherId);

    return {
      success: true,
      message: `Renovação concluída com sucesso! (${changeType === "upgrade" ? "Upgrade" : changeType === "downgrade" ? "Downgrade" : "Renovação"})`,
      newAgreementId: insertedSp.id,
    };
  } catch (err: any) {
    console.error("[FinanceEngine] Exception in renewStudentPackage:", err);
    return { success: false, message: `Falha na renovação: ${err?.message || err}` };
  }
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  date: string;
  method: string;
  notes?: string;
  recurrenceType?: "one_time" | "fixed" | "period";
  recurrenceMonths?: number;
  endDate?: string;
  parentExpenseId?: string;
}

export interface RemoteExpensePayload {
  description: string;
  category: string;
  amount: number;
  date: string;
  method?: string;
  notes?: string;
  recurrenceType?: "one_time" | "fixed" | "period";
  recurrenceMonths?: number;
  endDate?: string;
}

/**
 * Fetch all expenses for a teacher from public.expenses with category join
 */
export async function fetchTeacherExpensesList(teacherId: string) {
  if (!teacherId) return [];

  try {
    const { data, error } = await supabase
      .from("expenses")
      .select("*, expense_categories(id, name)")
      .eq("teacher_id", teacherId)
      .order("date", { ascending: false });

    if (error) {
      console.error("[FinanceEngine] Error fetching expenses:", error);
      return [];
    }

    if (!data) return [];

    const DEMO_DESCRIPTIONS = [
      "zoom pro subscription",
      "instagram ads - july",
      "esl grammar workbooks",
    ];

    return data
      .filter((row: any) => {
        const desc = (row.description || "").trim().toLowerCase();
        return !DEMO_DESCRIPTIONS.includes(desc);
      })
      .map((row: any) => {
        const recType = row.recurrence_type || (row.recurring ? "fixed" : "one_time");
        return {
          id: row.id,
          description: row.description,
          category: row.expense_categories?.name || row.category || "Software",
          amount: Math.round(((row.amount_cents || 0) / 100) * 100) / 100,
          date: row.date,
          method: row.method || "Card",
          notes: row.notes || undefined,
          recurrenceType: recType as "one_time" | "fixed" | "period",
          recurrenceMonths: row.recurrence_months || undefined,
          endDate: row.end_date || undefined,
        };
      });
  } catch (err) {
    console.error("[FinanceEngine] Exception fetching expenses:", err);
    return [];
  }
}

/**
 * Create a new expense in public.expenses with full recurrence and metadata persistence
 */
export async function createTeacherExpenseRemote(teacherId: string, payload: RemoteExpensePayload) {
  if (!teacherId) throw new Error("ID de professor inválido.");

  // 1. Resolve or create category_id from public.expense_categories
  let categoryId: string | null = null;
  if (payload.category) {
    const { data: existingCat } = await supabase
      .from("expense_categories")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("name", payload.category)
      .maybeSingle();

    if (existingCat) {
      categoryId = existingCat.id;
    } else {
      const { data: newCat } = await supabase
        .from("expense_categories")
        .insert({
          teacher_id: teacherId,
          name: payload.category,
        })
        .select("id")
        .single();

      if (newCat) {
        categoryId = newCat.id;
      }
    }
  }

  const recType = payload.recurrenceType || "one_time";
  const isRecurring = recType !== "one_time";
  const amountCents = Math.round((Number(payload.amount) || 0) * 100);

  // 2. Insert into public.expenses
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      teacher_id: teacherId,
      description: payload.description.trim(),
      amount_cents: amountCents,
      currency: "BRL",
      date: payload.date || new Date().toISOString().split("T")[0],
      category_id: categoryId,
      method: payload.method || "Card",
      notes: payload.notes?.trim() || null,
      recurrence_type: recType,
      recurrence_months: recType === "period" ? payload.recurrenceMonths || null : null,
      end_date: recType === "period" ? payload.endDate || null : null,
      recurring: isRecurring,
    })
    .select("*, expense_categories(id, name)")
    .single();

  if (error || !data) {
    console.error("[FinanceEngine] Error inserting expense:", error);
    throw new Error(error?.message || "Erro ao salvar despesa no banco de dados.");
  }

  return {
    id: data.id,
    description: data.description,
    category: data.expense_categories?.name || payload.category || "Software",
    amount: Math.round(((data.amount_cents || 0) / 100) * 100) / 100,
    date: data.date,
    method: data.method || "Card",
    notes: data.notes || undefined,
    recurrenceType: (data.recurrence_type || recType) as "one_time" | "fixed" | "period",
    recurrenceMonths: data.recurrence_months || undefined,
    endDate: data.end_date || undefined,
  };
}

/**
 * Delete an expense from public.expenses
 */
export async function deleteTeacherExpenseRemote(teacherId: string, expenseId: string) {
  if (!teacherId || !expenseId) return false;

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("teacher_id", teacherId);

  if (error) {
    console.error("[FinanceEngine] Error deleting expense:", error);
    throw new Error(error.message);
  }

  return true;
}


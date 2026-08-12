import { supabase } from "@/lib/supabase";

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
 * Calculate due date for installment `N` (1-indexed) given firstDueDate
 */
export function calculateInstallmentDueDate(firstDueDateStr: string, installmentIndexZero: number, defaultDueDay: number = 5): string {
  if (!firstDueDateStr) {
    const now = new Date();
    now.setMonth(now.getMonth() + installmentIndexZero);
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(Math.min(Math.max(defaultDueDay, 1), 28)).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const parts = firstDueDateStr.split("-").map(Number);
  const startYear = parts[0] || new Date().getFullYear();
  const startMonth = (parts[1] || 1) - 1; // 0-indexed
  const startDay = parts[2] || defaultDueDay;

  const targetDate = new Date(startYear, startMonth + installmentIndexZero, startDay);
  const y = targetDate.getFullYear();
  const m = String(targetDate.getMonth() + 1).padStart(2, "0");
  const d = String(targetDate.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

/**
 * Calculate last payment date for an enrollment
 */
export function calculateLastDueDate(firstDueDateStr: string, installmentCount: number, dueDay: number = 5): string {
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

  try {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, "0");
    const currentPeriod = `${currentYear}-${currentMonth}`;
    const todayStr = currentDate.toISOString().split("T")[0];

    // 1. Fetch Teacher Packages Catalog
    const { data: packagesData } = await supabase
      .from("packages")
      .select("*")
      .eq("teacher_id", teacherId);

    const packagesMap = new Map<string, any>();
    (packagesData || []).forEach((pkg) => {
      packagesMap.set(pkg.id, pkg);
    });

    // 2. Fetch Active Students
    const { data: studentsData } = await supabase
      .from("students")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("status", "Active");

    const activeStudents = studentsData || [];

    // 3. Fetch Active Student Packages (Enrollment Agreements with snapshots & installment counts)
    const { data: studentPackagesData } = await supabase
      .from("student_packages")
      .select("*")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const studentPackagesMap = new Map<string, any>();
    (studentPackagesData || []).forEach((sp) => {
      studentPackagesMap.set(sp.student_id, sp);
    });

    // 4. Fetch Active Classes and Class Members
    const { data: classesData } = await supabase
      .from("classes")
      .select("*, class_members(*)")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    const activeClasses = classesData || [];

    // 5. Fetch Existing Invoices for this teacher
    const { data: existingInvoicesData } = await supabase
      .from("invoices")
      .select("*, payments(*)")
      .eq("teacher_id", teacherId);

    const existingInvoices = existingInvoicesData || [];

    // Track existing period and installment keys
    const existingKeys = new Set<string>();
    existingInvoices.forEach((inv) => {
      const period = extractBillingPeriod(inv);
      if (inv.student_id) {
        existingKeys.add(`student_${inv.student_id}_${period}`);
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

    // --- A. Sync Individual / VIP Students using per-enrollment agreements ---
    activeStudents.forEach((student) => {
      if (student.type === "Group") return;

      const sp = studentPackagesMap.get(student.id);
      const pkg = student.package_id ? packagesMap.get(student.package_id) : null;
      const pkgName = pkg ? pkg.name : "Plano VIP Personalizado";
      const isMonthly = pkg ? pkg.frequency === "Monthly" || pkg.frequency === "monthly" : true;

      if (sp && !isMonthly && sp.installment_count && sp.installment_count >= 1) {
        // --- Installment Course Package Flow ---
        const safeInstallmentCount = Math.max(1, Math.min(12, sp.installment_count));
        const totalCents = sp.total_amount_cents || (pkg ? (pkg.price < 1000 ? pkg.price * 100 : pkg.price) : 240000);
        const { schedule } = calculateInstallmentSchedule(totalCents, safeInstallmentCount);
        const firstDueDateStr = sp.first_due_date || todayStr;
        const dueDay = sp.due_day || student.due_day || 5;

        for (let i = 1; i <= safeInstallmentCount; i++) {
          const instKey = `student_${student.id}_inst_${i}`;
          const dueDateStr = calculateInstallmentDueDate(firstDueDateStr, i - 1, dueDay);
          const periodStr = dueDateStr.substring(0, 7);
          const periodKey = `student_${student.id}_${periodStr}`;

          if (!existingKeys.has(instKey) && !existingKeys.has(periodKey)) {
            const status = dueDateStr < todayStr ? "overdue" : "pending";
            const invNumber = `INV-${periodStr.replace("-", "")}-${i.toString().padStart(2, "0")}-${Math.floor(100 + Math.random() * 900)}`;
            const currentInstCents = schedule[i - 1] || Math.round(totalCents / safeInstallmentCount);
            const formattedInstAmount = formatCentsToBRL(currentInstCents);

            newInvoiceRows.push({
              teacher_id: teacherId,
              student_id: student.id,
              invoice_number: invNumber,
              description: `Parcela ${i}/${safeInstallmentCount} - ${pkgName} (${formattedInstAmount}) - ${student.full_name} | [Individual] | Period: ${periodStr}`,
              amount_cents: currentInstCents,
              currency: "BRL",
              status,
              due_date: dueDateStr,
            });

            existingKeys.add(instKey);
            existingKeys.add(periodKey);
          }
        }
      } else {
        // --- Monthly Package Flow ---
        const periodKey = `student_${student.id}_${currentPeriod}`;
        if (!existingKeys.has(periodKey)) {
          const priceCents = sp?.total_amount_cents || (pkg ? (pkg.price < 1000 ? pkg.price * 100 : pkg.price) : 30000);
          const dueDay = sp?.due_day || student.due_day || 5;
          const dueDateStr = `${currentYear}-${currentMonth}-${String(Math.min(Math.max(dueDay, 1), 28)).padStart(2, "0")}`;
          const status = dueDateStr < todayStr ? "overdue" : "pending";
          const invNumber = `INV-${currentYear}${currentMonth}-${Math.floor(1000 + Math.random() * 9000)}`;

          newInvoiceRows.push({
            teacher_id: teacherId,
            student_id: student.id,
            invoice_number: invNumber,
            description: `Mensalidade ${pkgName} - ${student.full_name} | [Individual] | Period: ${currentPeriod}`,
            amount_cents: priceCents,
            currency: "BRL",
            status,
            due_date: dueDateStr,
          });

          existingKeys.add(periodKey);
        }
      }
    });

    // --- B. Sync Classes & Duplas ---
    activeClasses.forEach((cls) => {
      const mode = cls.billing_mode || "per_member";
      const pkg = cls.package_id ? packagesMap.get(cls.package_id) : null;
      const dueDay = Math.min(Math.max(cls.due_day || 5, 1), 28);
      const dueDateStr = `${currentYear}-${currentMonth}-${String(dueDay).padStart(2, "0")}`;
      const status = dueDateStr < todayStr ? "overdue" : "pending";

      if (mode === "shared_class") {
        const classKey = `class_${cls.id}_${currentPeriod}`;
        if (!existingKeys.has(classKey)) {
          const priceCents = cls.billing_amount || (pkg ? (pkg.price < 1000 ? pkg.price * 100 : pkg.price) : 50000);
          const pkgName = pkg ? pkg.name : `Turma ${cls.name}`;
          const invNumber = `INV-CLS-${currentYear}${currentMonth}-${Math.floor(1000 + Math.random() * 9000)}`;
          
          const activeMembers = (cls.class_members || []).filter((m: any) => m.status === "active");
          const firstStudentId = activeMembers.length > 0 ? activeMembers[0].student_id : (activeStudents[0]?.id || null);

          if (firstStudentId) {
            newInvoiceRows.push({
              teacher_id: teacherId,
              student_id: firstStudentId,
              invoice_number: invNumber,
              description: `Mensalidade ${cls.name} [Cobrança da Turma] [Turma: ${cls.id}] | Period: ${currentPeriod}`,
              amount_cents: priceCents,
              currency: "BRL",
              status,
              due_date: dueDateStr,
            });
            existingKeys.add(classKey);
          }
        }
      } else {
        const activeMembers = (cls.class_members || []).filter((m: any) => m.status === "active");

        activeMembers.forEach((mem: any) => {
          const memberStudent = activeStudents.find((s) => s.id === mem.student_id);
          if (!memberStudent) return;

          const sp = studentPackagesMap.get(mem.student_id);
          const pkgName = pkg ? pkg.name : `Turma ${cls.name}`;
          const isMonthly = pkg ? pkg.frequency === "Monthly" || pkg.frequency === "monthly" : true;

          if (sp && !isMonthly && sp.installment_count && sp.installment_count >= 1) {
            const safeInstallmentCount = Math.max(1, Math.min(12, sp.installment_count));
            const totalCents = sp.total_amount_cents || (pkg ? (pkg.price < 1000 ? pkg.price * 100 : pkg.price) : 240000);
            const { schedule } = calculateInstallmentSchedule(totalCents, safeInstallmentCount);
            const firstDueDateStr = sp.first_due_date || todayStr;
            const dueDay = sp.due_day || 5;

            for (let i = 1; i <= safeInstallmentCount; i++) {
              const instKey = `student_${mem.student_id}_inst_${i}`;
              const dueDateStr = calculateInstallmentDueDate(firstDueDateStr, i - 1, dueDay);
              const periodStr = dueDateStr.substring(0, 7);
              const periodKey = `student_${mem.student_id}_${periodStr}`;

              if (!existingKeys.has(instKey) && !existingKeys.has(periodKey)) {
                const instStatus = dueDateStr < todayStr ? "overdue" : "pending";
                const invNumber = `INV-${periodStr.replace("-", "")}-${i.toString().padStart(2, "0")}-${Math.floor(100 + Math.random() * 900)}`;
                const currentInstCents = schedule[i - 1] || Math.round(totalCents / safeInstallmentCount);
                const formattedInstAmount = formatCentsToBRL(currentInstCents);

                newInvoiceRows.push({
                  teacher_id: teacherId,
                  student_id: mem.student_id,
                  invoice_number: invNumber,
                  description: `Parcela ${i}/${safeInstallmentCount} - ${cls.name} (${formattedInstAmount}) - ${memberStudent.full_name} [Por Aluno] | Period: ${periodStr}`,
                  amount_cents: currentInstCents,
                  currency: "BRL",
                  status: instStatus,
                  due_date: dueDateStr,
                });

                existingKeys.add(instKey);
                existingKeys.add(periodKey);
              }
            }
          } else {
            const memberKey = `student_${mem.student_id}_${currentPeriod}`;
            if (!existingKeys.has(memberKey)) {
              const priceCents = sp?.total_amount_cents || (pkg ? (pkg.price < 1000 ? pkg.price * 100 : pkg.price) : 30000);
              const invNumber = `INV-${currentYear}${currentMonth}-${Math.floor(1000 + Math.random() * 9000)}`;

              newInvoiceRows.push({
                teacher_id: teacherId,
                student_id: mem.student_id,
                invoice_number: invNumber,
                description: `Mensalidade ${cls.name} - ${memberStudent.full_name} [Por Aluno] | Period: ${currentPeriod}`,
                amount_cents: priceCents,
                currency: "BRL",
                status,
                due_date: dueDateStr,
              });
              existingKeys.add(memberKey);
            }
          }
        });
      }
    });

    // 5. Insert New Invoices safely
    if (newInvoiceRows.length > 0) {
      const { error: insertErr } = await supabase.from("invoices").insert(newInvoiceRows);
      if (insertErr) {
        console.warn("[FinanceEngine] Note on invoice insert:", insertErr.message);
      }
    }

    // 6. Update Status of Unpaid Past Invoices to 'overdue'
    const overdueUpdates = existingInvoices.filter(
      (inv) => inv.status === "pending" && inv.due_date < todayStr
    );

    if (overdueUpdates.length > 0) {
      const overdueIds = overdueUpdates.map((inv) => inv.id);
      await supabase
        .from("invoices")
        .update({ status: "overdue", updated_at: new Date().toISOString() })
        .in("id", overdueIds);
    }

    // 7. Return Refetched Invoices
    return await fetchTeacherInvoices(teacherId);
  } catch (err) {
    console.error("[FinanceEngine] Error syncing receivables:", err);
    return await fetchTeacherInvoices(teacherId);
  }
}

/**
 * Save or Update Student Enrollment Agreement Snapshot in public.student_packages
 */
export async function saveStudentEnrollmentAgreement(agreement: {
  teacherId: string;
  studentId: string;
  packageId: string;
  totalAmountCents: number;
  installmentCount: number;
  installmentAmountCents: number;
  dueDay: number;
  firstDueDate: string;
  lastDueDate?: string;
  paymentMethod?: string;
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
  } = agreement;

  if (!teacherId || !studentId || !packageId) return false;

  try {
    const safeInstallmentCount = Math.max(1, Math.min(12, Math.round(installmentCount || 1)));
    const scheduleInfo = calculateInstallmentSchedule(totalAmountCents, safeInstallmentCount);
    const lastDueDate = calculateLastDueDate(firstDueDate, safeInstallmentCount, dueDay);

    // 1. Deactivate existing active student_packages for this student
    await supabase
      .from("student_packages")
      .update({ status: "inactive", ended_at: new Date().toISOString().split("T")[0] })
      .eq("student_id", studentId)
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    // 2. Insert new active enrollment agreement snapshot
    const { error } = await supabase.from("student_packages").insert({
      student_id: studentId,
      package_id: packageId,
      teacher_id: teacherId,
      started_at: firstDueDate || new Date().toISOString().split("T")[0],
      status: "active",
      total_amount_cents: totalAmountCents,
      installment_count: safeInstallmentCount,
      installment_amount_cents: scheduleInfo.baseAmountCents,
      due_day: dueDay,
      first_due_date: firstDueDate,
      last_due_date: lastDueDate,
      payment_method: paymentMethod,
    });

    if (error) {
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

    // Trigger immediate invoice sync
    await syncTeacherReceivables(teacherId);
    return true;
  } catch (err) {
    console.error("[FinanceEngine] Error saving enrollment agreement:", err);
    return false;
  }
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
      console.error("[FinanceEngine] Failed fetching invoices:", error);
      return [];
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
      } else if (sp && (sp.installment_count || 1) > 1) {
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
      };
    });
  } catch (err) {
    console.error("[FinanceEngine] Error in fetchTeacherInvoices:", err);
    return [];
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
    const studentInvoices = allInvoices.filter((i) => i.studentId === studentId);

    if (!spData) {
      return {
        ...defaultSummary,
        invoices: studentInvoices,
      };
    }

    const pkgName = spData.package?.name || "Pacote Personalizado";
    const isMonthly = spData.package?.frequency === "Monthly" || spData.package?.frequency === "monthly";
    const isInstallment = !isMonthly && (spData.installment_count || 1) >= 1;

    const totalAmountCents = spData.total_amount_cents || 0;
    const installmentCount = Math.max(1, Math.min(12, spData.installment_count || 1));

    const paidInvoices = studentInvoices.filter((i) => i.status === "paid");
    const paidInstallmentsCount = paidInvoices.length;

    const paidSumCents = paidInvoices.reduce((sum, i) => sum + i.amountCents, 0);
    const remainingBalanceCents = isInstallment ? Math.max(0, totalAmountCents - paidSumCents) : 0;

    const pendingInvoices = studentInvoices.filter((i) => i.status === "pending" || i.status === "overdue");
    pendingInvoices.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const nextDueDate = pendingInvoices.length > 0 ? pendingInvoices[0].dueDate : null;

    const paidInvoicesWithDate = paidInvoices.filter((i) => i.paidAt).sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
    const lastPaymentDate = paidInvoicesWithDate.length > 0 ? paidInvoicesWithDate[0].paidAt?.substring(0, 10) || null : null;

    const currentInstallmentNum = Math.min(paidInstallmentsCount + 1, installmentCount);

    return {
      studentId,
      hasActiveAgreement: true,
      packageId: spData.package_id,
      packageName: pkgName,
      billingModelLabel: isInstallment ? "Valor total do curso (Parcelado)" : "Mensalidade",
      isInstallment,
      totalAmountCents,
      installmentAmountCents: spData.installment_amount_cents || Math.round(totalAmountCents / installmentCount),
      installmentCount,
      paidInstallmentsCount,
      progressLabel: isInstallment ? `${paidInstallmentsCount}/${installmentCount} pagas` : "Mensalidade",
      currentInstallmentLabel: isInstallment ? `Parcela ${currentInstallmentNum} de ${installmentCount}` : "Mensalidade",
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
      const totalAmountCents = sp.total_amount_cents || (sp.package ? (sp.package.price < 1000 ? sp.package.price * 100 : sp.package.price) : 0);
      const installmentCount = Math.max(1, Math.min(12, sp.installment_count || 1));
      const installmentAmountCents = sp.installment_amount_cents || Math.round(totalAmountCents / installmentCount);

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
      const lastDueDate = sp.last_due_date || calculateLastDueDate(firstDueDate, installmentCount, sp.due_day || 5);

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
        progressLabel: installmentCount > 1 ? `${paidCount}/${installmentCount} pagas` : `${paidCount} pagas`,
        changeType: (sp.change_type as any) || "initial",
        changeTypeLabel,
        paymentMethod: sp.payment_method || "Pix",
        dueDay: sp.due_day || 5,
        firstDueDate,
        lastDueDate,
        isCurrent,
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
        description: `Contrato de ${pkg.totalAmountFormatted} em ${pkg.installmentCount}x de ${pkg.installmentAmountFormatted} (${pkg.paymentMethod})`,
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
        if (sp.last_due_date) {
          endDateStr = sp.last_due_date;
        } else if (sp.first_due_date && sp.installment_count) {
          endDateStr = calculateLastDueDate(sp.first_due_date, sp.installment_count, sp.due_day || 5);
        } else {
          // Default 1 month or 6 months if undefined
          const start = new Date(sp.started_at || todayStr);
          start.setMonth(start.getMonth() + (sp.installment_count || 1));
          endDateStr = start.toISOString().split("T")[0];
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
    dueDay = 5,
    paymentMethod = "Pix",
    renewalNotes,
  } = options;

  if (!teacherId || !studentId || !newPackageId) {
    return { success: false, message: "Parâmetros obrigatórios ausentes." };
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
      const oldPrice = currentSp.total_amount_cents || (currentSp.package ? (currentSp.package.price < 1000 ? currentSp.package.price * 100 : currentSp.package.price) : 0);
      const newPrice = totalAmountCents || (newPkg.price < 1000 ? newPkg.price * 100 : newPkg.price);

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

    // 5. Update previous active package agreement to status = 'completed'
    if (currentSp) {
      const prevEndDate = new Date(effectiveStartDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
      const prevEndDateStr = prevEndDate.toISOString().split("T")[0];

      await supabase
        .from("student_packages")
        .update({
          status: "completed",
          ended_at: prevEndDateStr,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentSp.id);
    }

    // 6. Calculate total amount & installment schedules for new agreement
    const safeInstallmentCount = Math.max(1, Math.min(12, Math.round(installmentCount || 1)));
    const finalTotalCents = totalAmountCents || (newPkg.price < 1000 ? newPkg.price * 100 : newPkg.price);
    const scheduleInfo = calculateInstallmentSchedule(finalTotalCents, safeInstallmentCount);
    const lastDueDate = calculateLastDueDate(effectiveStartDate, safeInstallmentCount, dueDay);

    // 7. Insert NEW active package agreement snapshot
    const { data: insertedSp, error: insertErr } = await supabase
      .from("student_packages")
      .insert({
        student_id: studentId,
        package_id: newPackageId,
        teacher_id: teacherId,
        started_at: effectiveStartDate,
        status: "active",
        total_amount_cents: finalTotalCents,
        installment_count: safeInstallmentCount,
        installment_amount_cents: scheduleInfo.baseAmountCents,
        due_day: dueDay,
        first_due_date: effectiveStartDate,
        last_due_date: lastDueDate,
        payment_method: paymentMethod,
        snapshot_package_name: newPkg.name,
        snapshot_package_price_cents: finalTotalCents,
        change_type: changeType,
        renewal_notes: renewalNotes || null,
        renewed_from_id: currentSp?.id || null,
      })
      .select("id")
      .single();

    if (insertErr || !insertedSp) {
      console.error("[FinanceEngine] Error creating renewed package agreement:", insertErr);
      return { success: false, message: `Erro ao salvar nova renovação: ${insertErr?.message}` };
    }

    // 8. Also update student table reference to new package_id
    await supabase
      .from("students")
      .update({
        package_id: newPackageId,
        due_day: dueDay,
        updated_at: new Date().toISOString(),
      })
      .eq("id", studentId)
      .eq("teacher_id", teacherId);

    // 9. Sync receivables immediately for new agreement
    await syncTeacherReceivables(teacherId);

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


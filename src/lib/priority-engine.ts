import { supabase } from "@/lib/supabase";
import { formatLocalDateStr } from "./time-off-engine";

export type PriorityType =
  | "homework_pending"
  | "attendance_pending"
  | "payment_due_today"
  | "payment_reminder_5d"
  | "renewal_30d";

export type CompletionType = "SOURCE_RESOLVED" | "MANUAL_ACTION";

export interface PriorityItem {
  id: string; // Deterministic unique ID e.g. "hw_les123" or "rem_inv456"
  type: PriorityType;
  teacherId: string;
  sourceEntity: "student_lessons" | "calendar_events" | "invoices" | "student_packages";
  sourceRecordId: string;
  studentId?: string;
  studentName?: string;
  title: string; // Main title e.g. "Postar tarefa de Maria — Conversation Class"
  subtitle?: string; // Secondary info e.g. "R$ 400,00 • vence 15/08"
  categoryLabel: string; // "Tarefa pendente", "Presença pendente", "Pagamento vence hoje", "Lembrar cobrança", "Renovação próxima"
  targetDate?: string;
  deepLink: {
    route: string;
    params?: Record<string, string>;
  };
  completionType: CompletionType;
  isResolved: boolean; // Source action completed in DB
  isManuallyCompleted: boolean; // Manually checked done on dashboard for today
  completedAt?: string; // ISO string or timestamp string (e.g. "09:42")
}

export interface ManualPriorityCompletionRecord {
  priorityId: string;
  teacherId: string;
  dateStr: string; // YYYY-MM-DD
  completedAt: string;
}

const nodeMemoryCompletionsMap: Record<string, Record<string, ManualPriorityCompletionRecord>> = {};

/**
 * Fetch manual priority completion records for a teacher for a specific date
 */
export function getManualCompletionsForToday(teacherId: string, dateStr: string): Record<string, ManualPriorityCompletionRecord> {
  if (!teacherId || !dateStr) return {};

  if (typeof localStorage !== "undefined") {
    const cacheKey = `bloom.priority_completions.${teacherId}.${dateStr}`;
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error("[priority-engine] Error parsing manual completions:", e);
    }
  }

  const memoryKey = `${teacherId}_${dateStr}`;
  return nodeMemoryCompletionsMap[memoryKey] || {};
}

/**
 * Persist manual completion status for a Type B priority item for today
 */
export async function saveManualPriorityCompletion(
  teacherId: string,
  priorityId: string,
  completed: boolean,
  dateStr: string = formatLocalDateStr(new Date())
): Promise<void> {
  if (!teacherId || !priorityId) return;

  const cacheKey = `bloom.priority_completions.${teacherId}.${dateStr}`;
  const memoryKey = `${teacherId}_${dateStr}`;
  const existingMap = getManualCompletionsForToday(teacherId, dateStr);

  if (completed) {
    existingMap[priorityId] = {
      priorityId,
      teacherId,
      dateStr,
      completedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
  } else {
    delete existingMap[priorityId];
  }

  nodeMemoryCompletionsMap[memoryKey] = existingMap;

  if (typeof localStorage !== "undefined") {
    localStorage.setItem(cacheKey, JSON.stringify(existingMap));
  }

  // Also sync to Supabase settings for cross-device consistency
  try {
    const { data: settingsData } = await supabase
      .from("settings")
      .select("dashboard_completions")
      .eq("teacher_id", teacherId)
      .maybeSingle();

    const dbMap = settingsData?.dashboard_completions || {};
    dbMap[`${dateStr}_${priorityId}`] = completed ? existingMap[priorityId] : undefined;

    await supabase
      .from("settings")
      .upsert({ teacher_id: teacherId, dashboard_completions: dbMap });
  } catch (err) {
    console.warn("[priority-engine] Server sync note for manual completion:", err);
  }
}

/**
 * Undo manual priority completion for a Type B priority item for today
 */
export async function undoManualPriorityCompletion(
  teacherId: string,
  priorityId: string,
  dateStr: string = formatLocalDateStr(new Date())
): Promise<void> {
  await saveManualPriorityCompletion(teacherId, priorityId, false, dateStr);
}

/**
 * Fetch and discover all real daily priorities from Bloom database records
 */
export async function fetchTeacherDailyPriorities(
  teacherId: string,
  todayDate: Date = new Date()
): Promise<{
  activePriorities: PriorityItem[];
  completedTodayPriorities: PriorityItem[];
  completedCount: number;
  totalCount: number;
  progressPercentage: number;
}> {
  if (!teacherId) {
    return {
      activePriorities: [],
      completedTodayPriorities: [],
      completedCount: 0,
      totalCount: 0,
      progressPercentage: 100,
    };
  }

  const todayStr = formatLocalDateStr(todayDate);
  const manualCompletions = getManualCompletionsForToday(teacherId, todayStr);

  // Calculate 5 days ahead and 30 days ahead for calendar date comparisons
  const d5Ahead = new Date(todayDate);
  d5Ahead.setDate(d5Ahead.getDate() + 5);
  const date5DaysAheadStr = formatLocalDateStr(d5Ahead);

  const d30Ahead = new Date(todayDate);
  d30Ahead.setDate(d30Ahead.getDate() + 30);
  const date30DaysAheadStr = formatLocalDateStr(d30Ahead);

  const rawPrioritiesList: PriorityItem[] = [];

  // =========================================================================
  // 1. HOMEWORK PENDING (Tarefa pendente)
  // Source: student_lessons where homework exists and homework_posted = false
  // =========================================================================
  try {
    const localLessonsKey = `bloom.student_lessons.all.${teacherId}`;
    let studentLessonsData: any[] = [];

    // Query Supabase student_lessons
    const { data: dbLessons } = await supabase
      .from("student_lessons")
      .select("*, students(full_name)")
      .eq("teacher_id", teacherId);

    if (dbLessons && dbLessons.length > 0) {
      studentLessonsData = dbLessons;
    } else if (typeof localStorage !== "undefined") {
      const cached = localStorage.getItem(localLessonsKey);
      if (cached) studentLessonsData = JSON.parse(cached);
    }

    studentLessonsData.forEach((les: any) => {
      const isLessonCompleted = Boolean(les.completed);
      const isExplicitlyPending = les.homework_posted === false;
      const isPosted = les.homework_posted === true;
      const sName = les.students?.full_name || les.student_name || "Aluno";

      // Only generate "Tarefa pendente" priority if the lesson is completed AND homework status is explicitly "Pendente" (false) or "Entregue" (true)
      if (isLessonCompleted && (isExplicitlyPending || isPosted)) {
        const itemKey = `hw_${les.id || `${les.student_id}_${les.lesson_number}`}`;
        const isManuallyDone = Boolean(manualCompletions[itemKey]);

        rawPrioritiesList.push({
          id: itemKey,
          type: "homework_pending",
          teacherId,
          sourceEntity: "student_lessons",
          sourceRecordId: les.id || itemKey,
          studentId: les.student_id,
          studentName: sName,
          categoryLabel: "Tarefa pendente",
          title: `Postar tarefa de ${sName} — ${les.content || `Aula ${les.lesson_number}`}`,
          subtitle: `Aula ${les.lesson_number} • ${les.scheduled_date ? les.scheduled_date.split("-").reverse().join("/") : "Sem data"}`,
          targetDate: les.scheduled_date,
          deepLink: {
            route: "/students",
            params: { studentId: les.student_id, tab: "Lessons" },
          },
          completionType: "SOURCE_RESOLVED",
          isResolved: isPosted,
          isManuallyCompleted: isManuallyDone,
          completedAt: isPosted ? "Origem" : isManuallyDone ? manualCompletions[itemKey].completedAt : undefined,
        });
      }
    });
  } catch (err) {
    console.warn("[priority-engine] Error discovering homework priorities:", err);
  }

  // =========================================================================
  // 2. ATTENDANCE PENDING (Presença pendente)
  // Source: past or today calendar_events / student_lessons where attendance_recorded = false
  // =========================================================================
  try {
    const { data: eventsData } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("teacher_id", teacherId)
      .lte("date", todayStr);

    if (eventsData) {
      eventsData.forEach((evt: any) => {
        // Attendance eligible only if event date is past or today
        const isPastOrToday = evt.date <= todayStr;
        const isRecorded = Boolean(evt.attendance_recorded || evt.attendance_status);

        if (isPastOrToday && evt.status !== "Closed" && evt.status !== "Cancelled") {
          const itemKey = `att_${evt.id}`;
          const isManuallyDone = Boolean(manualCompletions[itemKey]);

          rawPrioritiesList.push({
            id: itemKey,
            type: "attendance_pending",
            teacherId,
            sourceEntity: "calendar_events",
            sourceRecordId: evt.id,
            studentId: evt.student_id,
            studentName: evt.student_name || "Aluno",
            categoryLabel: "Presença pendente",
            title: `Registrar presença — ${evt.student_name || "Aula"}`,
            subtitle: `${evt.date.split("-").reverse().join("/")} às ${evt.start_time} • ${evt.focus || "Aula"}`,
            targetDate: evt.date,
            deepLink: {
              route: "/calendar",
              params: { eventId: evt.id },
            },
            completionType: "SOURCE_RESOLVED",
            isResolved: isRecorded,
            isManuallyCompleted: isManuallyDone,
            completedAt: isRecorded ? "Origem" : isManuallyDone ? manualCompletions[itemKey].completedAt : undefined,
          });
        }
      });
    }
  } catch (err) {
    console.warn("[priority-engine] Error discovering attendance priorities:", err);
  }

  // =========================================================================
  // 3. PAYMENT DUE TODAY (Pagamento vence hoje) &
  // 4. 5-DAY PAYMENT REMINDER (Lembrar cobrança - 5 dias)
  // Source: invoices table
  // =========================================================================
  try {
    const { data: invoicesData } = await supabase
      .from("invoices")
      .select("*, students(full_name)")
      .eq("teacher_id", teacherId)
      .neq("status", "Paid")
      .neq("status", "Pago")
      .neq("status", "Cancelled");

    if (invoicesData) {
      invoicesData.forEach((inv: any) => {
        const sName = inv.students?.full_name || inv.student_name || "Aluno";
        const formattedAmount = (Number(inv.amount) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const isPaid = inv.status === "Paid" || inv.status === "Pago";

        // Priority 3: DUE TODAY
        if (inv.due_date === todayStr) {
          const itemKey = `pay_today_${inv.id}`;
          const isManuallyDone = Boolean(manualCompletions[itemKey]);

          rawPrioritiesList.push({
            id: itemKey,
            type: "payment_due_today",
            teacherId,
            sourceEntity: "invoices",
            sourceRecordId: inv.id,
            studentId: inv.student_id,
            studentName: sName,
            categoryLabel: "Pagamento vence hoje",
            title: `${sName} — ${formattedAmount}`,
            subtitle: `Vencimento hoje (${todayStr.split("-").reverse().join("/")}) • Fatura #${inv.id.substring(0, 6)}`,
            targetDate: inv.due_date,
            deepLink: {
              route: "/finance",
              params: { invoiceId: inv.id, studentId: inv.student_id },
            },
            completionType: "SOURCE_RESOLVED",
            isResolved: isPaid,
            isManuallyCompleted: isManuallyDone,
            completedAt: isPaid ? "Origem" : isManuallyDone ? manualCompletions[itemKey].completedAt : undefined,
          });
        }

        // Priority 4: 5 DAYS BEFORE DUE DATE
        if (inv.due_date === date5DaysAheadStr) {
          const itemKey = `rem_5d_${inv.id}`;
          const isManuallyDone = Boolean(manualCompletions[itemKey]);

          rawPrioritiesList.push({
            id: itemKey,
            type: "payment_reminder_5d",
            teacherId,
            sourceEntity: "invoices",
            sourceRecordId: inv.id,
            studentId: inv.student_id,
            studentName: sName,
            categoryLabel: "Lembrar cobrança",
            title: `Enviar lembrete para ${sName} — vence em 5 dias`,
            subtitle: `${formattedAmount} • vence ${date5DaysAheadStr.split("-").reverse().join("/")}`,
            targetDate: inv.due_date,
            deepLink: {
              route: "/students",
              params: { studentId: inv.student_id, tab: "Finance" },
            },
            completionType: "MANUAL_ACTION",
            isResolved: isPaid,
            isManuallyCompleted: isManuallyDone,
            completedAt: isManuallyDone ? manualCompletions[itemKey].completedAt : undefined,
          });
        }
      });
    }
  } catch (err) {
    console.warn("[priority-engine] Error discovering invoice priorities:", err);
  }

  // =========================================================================
  // 5. CONTRACT / PACKAGE EXPIRES IN 30 DAYS (Renovação próxima)
  // Source: student_packages table / agreements
  // =========================================================================
  try {
    const { data: pkgsData } = await supabase
      .from("student_packages")
      .select("*, students(full_name), packages(name)")
      .eq("teacher_id", teacherId)
      .eq("status", "active");

    if (pkgsData) {
      pkgsData.forEach((spk: any) => {
        const endDate = spk.end_date || spk.expires_at;
        const sName = spk.students?.full_name || spk.student_name || "Aluno";
        const pkgName = spk.packages?.name || spk.package_name || "Pacote";

        if (endDate === date30DaysAheadStr) {
          const itemKey = `ren_30d_${spk.id}`;
          const isManuallyDone = Boolean(manualCompletions[itemKey]);

          rawPrioritiesList.push({
            id: itemKey,
            type: "renewal_30d",
            teacherId,
            sourceEntity: "student_packages",
            sourceRecordId: spk.id,
            studentId: spk.student_id,
            studentName: sName,
            categoryLabel: "Renovação próxima",
            title: `Pacote de ${sName} vence em 30 dias`,
            subtitle: `Plano ${pkgName} • Vence em ${date30DaysAheadStr.split("-").reverse().join("/")}`,
            targetDate: endDate,
            deepLink: {
              route: "/students",
              params: { studentId: spk.student_id, openRenewal: "true" },
            },
            completionType: "SOURCE_RESOLVED",
            isResolved: spk.status === "renewed" || spk.status === "inactive",
            isManuallyCompleted: isManuallyDone,
            completedAt: isManuallyDone ? manualCompletions[itemKey].completedAt : undefined,
          });
        }
      });
    }
  } catch (err) {
    console.warn("[priority-engine] Error discovering package renewal priorities:", err);
  }

  // Priority Ordering Matrix:
  // 1. Payment due today
  // 2. Attendance pending
  // 3. Homework pending
  // 4. Payment reminder (5 days)
  // 5. Renewal reminder (30 days)
  const priorityOrder: Record<PriorityType, number> = {
    payment_due_today: 1,
    attendance_pending: 2,
    homework_pending: 3,
    payment_reminder_5d: 4,
    renewal_30d: 5,
  };

  rawPrioritiesList.sort((a, b) => {
    const orderDiff = priorityOrder[a.type] - priorityOrder[b.type];
    if (orderDiff !== 0) return orderDiff;
    return (a.targetDate || "").localeCompare(b.targetDate || "");
  });

  // Separate into Active vs Completed Today Lists
  const activePriorities = rawPrioritiesList.filter((item) => !item.isResolved && !item.isManuallyCompleted);
  const completedTodayPriorities = rawPrioritiesList.filter((item) => item.isResolved || item.isManuallyCompleted);

  const totalCount = rawPrioritiesList.length;
  const completedCount = completedTodayPriorities.length;
  const progressPercentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;

  return {
    activePriorities,
    completedTodayPriorities,
    completedCount,
    totalCount,
    progressPercentage,
  };
}

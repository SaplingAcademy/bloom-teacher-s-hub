import { reportUserError, toUserMessage } from "@/lib/user-error";
import { t as i18nT } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { getTeacherAvailability, WorkingAvailability } from "@/lib/teacher-availability";
import {
  fetchMonthlyGoal,
  saveMonthlyGoal,
  fetchCurrentMRR,
  computeGrowthMetrics,
  formatBRL as rawFormatBRL,
  parseBRL,
  MRRResult,
  fetchTeacherExpenses,
  fetchEffectiveHourlyRate,
  WEEKS_PER_MONTH,
  EffectiveHourlyResult,
} from "@/lib/growth-engine";
import { calculateRealCapacity, RealCapacityResult } from "@/lib/capacity-engine";
import { calculateRevenuePotential, weeklyFreeTeachingHours } from "@/lib/growth-revenue-potential";
import { fetchTeacherReceivedInvoices } from "@/lib/finance-engine";
import { buildGrowthOpportunities, receivedHistoryCents, type GrowthOpportunity } from "@/lib/growth-opportunities";
import {
  fetchGrowthMetrics,
  EMPTY_GROWTH_METRICS,
  RealGrowthMetrics,
} from "@/lib/growth-metrics";
import { CentralAvailabilityModal } from "@/components/bloom/CentralAvailabilityModal";
import {
  TrendingUp,
  Users,
  Target,
  Clock,
  ArrowRight,
  ChevronRight,
  Zap,
  DollarSign,
  Briefcase,
  Percent,
  AlertTriangle,
  CheckCircle,
  Pencil,
  Loader2,
  CheckCircle2,
  PlusCircle,
  ExternalLink,
  Info,
} from "lucide-react";
import { FinancialPrivacyToggle } from "@/components/bloom/FinancialPrivacyToggle";
import { PremiumBenefitsDialog, PremiumCardLock } from "@/components/bloom/PremiumGate";
import { useFeatureAccess } from "@/hooks/use-plan";
import { useFinancialPrivacy } from "@/lib/financial-privacy";
import { GrowthMetricsChart } from "@/components/bloom/GrowthMetricsChart";
import { PageHeader } from "@/components/bloom/PageHeader";
import { InfoTooltip } from "@/components/bloom/InfoTooltip";
import { PanelSkeleton } from "@/components/bloom/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface SafeNumberInputProps {
  id?: string;
  value: number;
  onChange: (val: number) => void;
  className?: string;
  min?: number;
  max?: number;
  step?: string | number;
  required?: boolean;
}

function SafeNumberInput({
  id,
  value,
  onChange,
  className,
  min,
  max,
  step,
  required,
}: SafeNumberInputProps) {
  const [tempVal, setTempVal] = useState<string>(String(value));

  useEffect(() => {
    setTempVal(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value;

    if (raw === "") {
      setTempVal("");
      onChange(0);
      return;
    }

    if (/^0\d/.test(raw)) {
      raw = raw.replace(/^0+/, "");
      if (raw === "") raw = "0";
    }

    setTempVal(raw);

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    let parsed = parseFloat(tempVal) || 0;
    if (min !== undefined && parsed < min) parsed = min;
    if (max !== undefined && parsed > max) parsed = max;
    setTempVal(String(parsed));
    onChange(parsed);
  };

  return (
    <Input
      id={id}
      type="number"
      value={tempVal}
      onChange={handleChange}
      onBlur={handleBlur}
      className={className}
      min={min}
      max={max}
      step={step}
      required={required}
    />
  );
}

export const Route = createFileRoute("/_app/growth")({
  head: () => ({
    meta: [
      { title: "Growth · Bloom" },
      { name: "description", content: "Optimize and scale your language teaching school." },
      { property: "og:title", content: "Growth · Bloom" },
      { property: "og:description", content: "Track teaching capacity, available lesson times and revenue with Bloom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GrowthPage,
});

const translations = {
  en: {
    langToggle: "PT",
    title: "Growth & Scaling",
    description:
      "Understand your capacity, calculate revenue potential, and find growth opportunities.",
    monthlyGoalTitle: "Monthly Goal",
    remaining: "Remaining:",
    estimationText: "To reach your goal, you need approximately:",
    estimationPrivate: "4 more private students",
    estimationGroup: "7 group enrollments",
    or: "or",
    capacityTitle: "Teaching Capacity",
    capacitySubtitle: "weekly",
    capacityOccupied: "occupied",
    capacityFreeHours: "free teaching hours per week",
    capacityNoSchedule: "No lesson schedules with a known duration yet",
    capacityAvailable: "slots available",
    capacityBreakdown: "Weekly Slots Status",
    viewScheduleBtn: "View Schedule",
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    full: "Full",
    available: "available",
    month: "month",
    opportunitiesTitle: "Growth Opportunities",
    opportunitiesSubtitle: "AI-generated recommendations to expand your teaching business.",
    funnelTitle: "Sales Funnel & Conversions",
    funnelEmpty: "Funnel numbers will appear here once they are calculated from your real pipeline.",
    opportunitiesEmpty: "Opportunities will be generated from your business data.",
    funnelSubtitle: "Track prospects from inquiries to active students.",
    metricsTitle: "Growth Performance Metrics",
    metricNewStudents: "New Students This Month",
    metricRetention: "Student Retention",
    metricRenewal: "Renewal Rate",
    metricAvgPackage: "Avg Revenue per Student",
    metricAvgRevenue: "Received per Student (month)",
    metricGrowthRate: "Monthly Growth Rate",
    metricsCurrentValue: "Current value",
    metricsNoHistory: "History for this indicator will be available soon.",
    metricsInsufficient: "There is not enough data yet to chart this indicator.",
    metricsUnitStudents: "students",
    metricsUnitStudent: "student",
    metricsNoStartDate: "{n} student(s) without a start date are not counted.",
  },
  pt: {
    langToggle: "EN",
    title: "Crescimento & Escala",
    description: "Entenda sua capacidade, calcule o potencial de receita e encontre oportunidades.",
    monthlyGoalTitle: "Meta Mensal",
    remaining: "Restante:",
    estimationText: "Para atingir sua meta, você precisa de aproximadamente:",
    estimationPrivate: "Mais 4 alunos VIP",
    estimationGroup: "7 matrículas em turmas",
    or: "ou",
    capacityTitle: "Capacidade de Aulas",
    capacitySubtitle: "semanais",
    capacityOccupied: "ocupado",
    capacityFreeHours: "horas livres para aulas por semana",
    capacityNoSchedule: "Ainda não há horários de aula com duração definida",
    capacityAvailable: "horários disponíveis",
    capacityBreakdown: "Status de Horários da Semana",
    viewScheduleBtn: "Ver Agenda",
    mon: "Segunda-feira",
    tue: "Terça-feira",
    wed: "Quarta-feira",
    thu: "Quinta-feira",
    fri: "Sexta-feira",
    sat: "Sábado",
    full: "Esgotado",
    available: "disponíveis",
    month: "mês",
    opportunitiesTitle: "Oportunidades de Crescimento",
    opportunitiesSubtitle: "Recomendações automáticas baseadas em inteligência para expandir.",
    funnelTitle: "Funil de Vendas & Conversões",
    funnelEmpty: "Os números do funil aparecerão aqui quando forem calculados a partir do seu pipeline real.",
    opportunitiesEmpty: "As oportunidades serão geradas a partir dos dados do seu negócio.",
    funnelSubtitle: "Acompanhe interessados desde o contato até a matrícula ativa.",
    metricsTitle: "Métricas de Crescimento",
    metricNewStudents: "Novos Alunos Este Mês",
    metricRetention: "Retenção de Alunos",
    metricRenewal: "Taxa de Renovação",
    metricAvgPackage: "Receita Média por Aluno",
    metricAvgRevenue: "Recebido por Aluno (mês)",
    metricGrowthRate: "Taxa de Crescimento Mensal",
    metricsCurrentValue: "Valor atual",
    metricsNoHistory: "O histórico deste indicador estará disponível em breve.",
    metricsInsufficient: "Ainda não há dados suficientes para montar o gráfico deste indicador.",
    metricsUnitStudents: "alunos",
    metricsUnitStudent: "aluno",
    metricsNoStartDate: "{n} aluno(s) sem data de início não entram neste indicador.",
  },
};

function GrowthPage() {
  const { money, financialValuesHidden } = useFinancialPrivacy();
  const formatBRL = (v: number) => money(rawFormatBRL(v));
  const { lang, t: tr, formatWeekday } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Premium gate: Revenue Potential + Growth Opportunities cards. Fails closed
  // while the plan loads or is unreadable — locked users never compute or
  // receive the premium insights below.
  const growthInsights = useFeatureAccess("growth_insights");
  const [isPremiumDialogOpen, setIsPremiumDialogOpen] = useState(false);

  // Growth Goal & Real Data States
  const [loadingGrowth, setLoadingGrowth] = useState(true);
  const queryClient = useQueryClient();
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [mrrData, setMrrData] = useState<MRRResult>({
    totalMRR: 0,
    contributingStudentRevenues: [],
    activeStudentCount: 0,
    payingStudentCount: 0,
    hasBillingData: false,
    studentRevenue: {},
    classRevenue: {},
  });
  const [capacityData, setCapacityData] = useState<RealCapacityResult>({
    hasWorkingHours: false,
    totalValidSlots: 0,
    totalOccupiedSlots: 0,
    totalRemainingSlots: 0,
    occupancyPct: 0,
    availableWeeklyMinutes: 0,
    slotDurationMinutes: 60,
    days: [],
  });
  const [effectiveHourlyData, setEffectiveHourlyData] = useState<EffectiveHourlyResult>({
    effectiveHourlyRate: 0,
    totalMRR: 0,
    activeStudentCount: 0,
    billableHoursPerMonth: 0,
    weeklyTeachingMinutes: 0,
    hasEnoughData: false,
    slots: [],
    mrr: null,
  });
  const [realExpenses, setRealExpenses] = useState<number>(0);
  const [isManualExpenses, setIsManualExpenses] = useState<boolean>(true);

  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [editGoalInputValue, setEditGoalInputValue] = useState("");
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  // Capacity card: day whose available times are shown (display only). Mouse hover wins; otherwise the
  // day focused by keyboard or tapped on touch devices (touch fires synthetic mouse leaves, so hover is mouse-only).
  const [hoveredCapacityDay, setHoveredCapacityDay] = useState<string | null>(null);
  const [focusedCapacityDay, setFocusedCapacityDay] = useState<string | null>(null);
  const shownCapacityDay = hoveredCapacityDay ?? focusedCapacityDay;

  const [availability, setAvailability] = useState<WorkingAvailability[]>([]);
  // Simulator Input States (Data-driven defaults)
  // Simulator-only state. Seeded from the official goal (business_goals); 0 = goal not defined yet.
  const [incomeGoal, setIncomeGoal] = useState(0);
  const [currency, setCurrency] = useState("R$");
  const [workHoursPerWeek, setWorkHoursPerWeek] = useState(40);
  const [teachHoursPerWeek, setTeachHoursPerWeek] = useState(20);
  const [weeksPerMonth, setWeeksPerMonth] = useState(4.33);
  const [expenses, setExpenses] = useState(0);
  const [taxPercent, setTaxPercent] = useState(15);
  const [safetyMarginPercent, setSafetyMarginPercent] = useState(10);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);

  // Suggested / Prefilled Data States
  const [currentAvgHourlyRate, setCurrentAvgHourlyRate] = useState(0);
  const [currentStudentsCount, setCurrentStudentsCount] = useState(0);
  const [currentMRR, setCurrentMRR] = useState(0);

  // Real, teacher-scoped growth performance metrics
  const [growthMetrics, setGrowthMetrics] = useState<RealGrowthMetrics>(EMPTY_GROWTH_METRICS);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  // Load real monthly goal, active MRR data, real capacity, expenses, and effective hourly rate.
  // Cached per teacher, so returning to Growth renders instantly and revalidates in background.
  const growthQuery = useQuery({
    queryKey: ["growth-data", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      if (!user?.id) throw new Error("Authentication required");
      const [goalRes, mrrRes, capacityRes, expRes, hourlyRes, metricsRes] = await Promise.all([
        fetchMonthlyGoal(user.id),
        fetchCurrentMRR(user.id),
        calculateRealCapacity(user.id),
        fetchTeacherExpenses(user.id),
        fetchEffectiveHourlyRate(user.id),
        fetchGrowthMetrics(user.id),
      ]);
      // Canonical received revenue history; a failure only disables history-based insights.
      const receivedHistory = await fetchTeacherReceivedInvoices(user.id)
        .then((inv) => receivedHistoryCents(inv))
        .catch(() => [] as number[]);
      return { goalRes, mrrRes, capacityRes, expRes, hourlyRes, metricsRes, receivedHistory };
    },
  });

  const opportunities = useMemo<GrowthOpportunity[]>(() => {
    if (!growthInsights.allowed) return [];
    const d = growthQuery.data;
    if (!d || !d.capacityRes.hasWorkingHours) return [];
    return buildGrowthOpportunities({
      goal: d.goalRes?.targetValue ?? null,
      mrr: d.mrrRes.totalMRR,
      hasBillingData: d.mrrRes.hasBillingData,
      weeklyCapacityMinutes: d.capacityRes.availableWeeklyMinutes,
      weeklyOccupiedMinutes: d.hourlyRes.weeklyTeachingMinutes,
      slots: d.hourlyRes.slots,
      studentRevenue: d.hourlyRes.mrr?.studentRevenue ?? d.mrrRes.studentRevenue,
      classRevenue: d.hourlyRes.mrr?.classRevenue ?? d.mrrRes.classRevenue,
      receivedHistoryCents: d.receivedHistory,
    });
  }, [growthQuery.data, growthInsights.allowed]);

  const loadGrowthData = useCallback(async () => {
    if (!user) return;
    await queryClient.invalidateQueries({ queryKey: ["growth-data", user.id] });
  }, [user, queryClient]);

  useEffect(() => {
    if (!user) {
      setLoadingGrowth(false);
      return;
    }
    setLoadingGrowth(growthQuery.isLoading);
  }, [user, growthQuery.isLoading]);

  useEffect(() => {
    const d = growthQuery.data;
    if (!d) return;
    const { goalRes, mrrRes, capacityRes, expRes, hourlyRes, metricsRes } = d;

    setGrowthMetrics(metricsRes);
    setLoadingMetrics(false);

    if (goalRes) {
      setMonthlyGoal(goalRes.targetValue);
      setIncomeGoal(goalRes.targetValue);
    } else {
      setMonthlyGoal(null);
      setIncomeGoal(0);
    }

    setMrrData(mrrRes);
    setCapacityData(capacityRes);
    setEffectiveHourlyData(hourlyRes);
    setRealExpenses(expRes);

    if (expRes > 0) {
      setExpenses(expRes);
      setIsManualExpenses(false);
    } else {
      setExpenses(0);
      setIsManualExpenses(true);
    }

    // Simulator inputs are scenario assumptions: only total work hours is prefilled
    // from real available time; reserved teaching hours never mirror real schedules.
    if (capacityRes.hasWorkingHours && capacityRes.availableWeeklyMinutes > 0) {
      setWorkHoursPerWeek(Math.round(capacityRes.availableWeeklyMinutes / 60));
    }

    if (mrrRes.totalMRR > 0) setCurrentMRR(mrrRes.totalMRR);
    if (mrrRes.activeStudentCount > 0) setCurrentStudentsCount(mrrRes.activeStudentCount);
    if (hourlyRes.hasEnoughData) setCurrentAvgHourlyRate(hourlyRes.effectiveHourlyRate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [growthQuery.data]);

  const handleOpenEditGoal = () => {
    setEditGoalInputValue(monthlyGoal ? String(monthlyGoal) : "");
    setIsEditGoalOpen(true);
  };

  const handleSaveGoalSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user) return;
    const parsed = parseBRL(editGoalInputValue);
    if (!parsed || parsed <= 0) {
      toast.error(
        tr("auditUi.pleaseEnterAValidGoalGreaterThan")
      );
      return;
    }
    setIsSavingGoal(true);
    const res = await saveMonthlyGoal(user.id, parsed);
    setIsSavingGoal(false);
    if (res.success) {
      setMonthlyGoal(parsed);
      setIsEditGoalOpen(false);
      toast.success(
        tr("auditUi.monthlyGoalSavedSuccessfully")
      );
    } else {
      toast.error(toUserMessage(res.error, i18nT("errors.saveGoal", lang)));
    }
  };

  useEffect(() => {
    let cancelled = false;

    const run = async (availList: WorkingAvailability[]) => {
    if (cancelled) return;
    setAvailability(availList);


    // Load saved pricing goal if exists
    const savedGoal = localStorage.getItem("bloom.pricing.goal");
    if (savedGoal) {
      try {
        const parsed = JSON.parse(savedGoal);
        // incomeGoal is never restored from local storage: the official goal
        // lives only in business_goals and seeds the simulator.
        setCurrency(parsed.currency ?? "R$");
        setWorkHoursPerWeek(parsed.workHoursPerWeek ?? 40);
        setTeachHoursPerWeek(parsed.teachHoursPerWeek ?? 20);
        setWeeksPerMonth(parsed.weeksPerMonth ?? 4);
        setExpenses(parsed.expenses ?? 300);
        setTaxPercent(parsed.taxPercent ?? 15);
        setSafetyMarginPercent(parsed.safetyMarginPercent ?? 10);
      } catch (e) {
        console.error(e);
      }
    }
    };

    if (user?.id) {
      getTeacherAvailability(user.id)
        .then((snap) => run(snap.days))
        .catch((err) => {
          console.warn("[Growth] Could not load teacher availability:", err);
          run([]);
        });
    } else {
      run([]);
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSaveGoal = () => {
    const goalData = {
      incomeGoal,
      currency,
      workHoursPerWeek,
      teachHoursPerWeek,
      weeksPerMonth,
      expenses,
      taxPercent,
      safetyMarginPercent,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem("bloom.pricing.goal", JSON.stringify(goalData));
    alert(
      tr("auditUi.pricingGoalSuccessfullySaved"),
    );
  };

  const handleResetSimulator = () => {
    setIncomeGoal(monthlyGoal ?? 0);
    setCurrency("R$");
    setWorkHoursPerWeek(40);
    setTeachHoursPerWeek(20);
    setWeeksPerMonth(4);
    setExpenses(300);
    setTaxPercent(15);
    setSafetyMarginPercent(10);
  };

  const t = translations[lang];

  // REAL Bloom data (Supabase): duration-aware schedules vs working hours minus rest blocks.
  const realTeachWeeklyH = effectiveHourlyData.weeklyTeachingMinutes / 60;
  const realAvailWeeklyH = capacityData.availableWeeklyMinutes / 60;
  const realOccupancyPct = realAvailWeeklyH > 0 && realTeachWeeklyH > 0
    ? Math.round((realTeachWeeklyH / realAvailWeeklyH) * 100)
    : null;
  const realFreeWeeklyH = Math.max(0, realAvailWeeklyH - realTeachWeeklyH);
  const fmtH = (v: number) =>
    v.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 });
  const avgRevenuePerPayingStudent = mrrData.hasBillingData && mrrData.payingStudentCount > 0 && mrrData.totalMRR > 0
    ? Math.round((mrrData.totalMRR / mrrData.payingStudentCount) * 100) / 100
    : null;

  const capacityDays = capacityData.days.filter((day) => day.enabled);

  // Capacity card times area (display only): sized to fit the longest day's list at the current width,
  // so no time is ever clipped and hover/focus never changes the card height. Each list sits next to its
  // day row (lower rows end at their row) and is clamped inside the area.
  const capacityRowsRef = useRef<HTMLUListElement>(null);
  const capacityTimesRef = useRef<HTMLDivElement>(null);
  const [capacityTimesLayout, setCapacityTimesLayout] = useState<{ height: number; tops: number[] }>({ height: 0, tops: [] });
  const capacityLayoutKey = capacityDays.map((day) => `${day.day}:${day.availableSlots.length}`).join("|");
  useEffect(() => {
    const rowsEl = capacityRowsRef.current;
    const area = capacityTimesRef.current;
    if (!rowsEl || !area || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const rows = Array.from(rowsEl.children) as HTMLElement[];
      const lists = Array.from(area.children) as HTMLElement[];
      const areaTop = area.getBoundingClientRect().top;
      const heights = lists.map((list) => list.offsetHeight);
      const height = Math.max(rowsEl.offsetHeight, ...heights);
      const tops = lists.map((_, index) => {
        const row = rows[index]?.getBoundingClientRect();
        if (!row) return 0;
        const desired = index >= lists.length / 2 ? row.bottom - areaTop - heights[index] : row.top - areaTop;
        return Math.max(0, Math.min(Math.round(desired), height - heights[index]));
      });
      setCapacityTimesLayout((prev) => (prev.height === height && prev.tops.join() === tops.join() ? prev : { height, tops }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rowsEl);
    Array.from(area.children).forEach((list) => observer.observe(list));
    return () => observer.disconnect();
  }, [capacityLayoutKey, capacityData.hasWorkingHours, growthQuery.isError]);

  // Real Growth Metrics calculations
  const metrics = computeGrowthMetrics(monthlyGoal || 0, mrrData);
  // Real-metric formatters — never fabricate values; show em dash when data is missing
  const NO_DATA = "—";
  const metricCount = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : String(v);
  // Percentages with the locale decimal separator (pt-BR "46,2%"); values are unchanged.
  const formatPercent = (v: number) => `${v.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 })}%`;
  const formatGrowthPercent = (v: number) => `${v > 0 ? "+" : ""}${formatPercent(v)}`;
  const metricPercent = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : formatPercent(v);
  const metricSignedPercent = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : formatGrowthPercent(v);
  const metricMoney = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : formatBRL(v);
  const formatBRLCompact = (v: number) =>
    new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(v);
  const metricTrend = (change: number | null) =>
    !loadingMetrics && change !== null
      ? { value: formatGrowthPercent(change), positive: change >= 0 }
      : undefined;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const ringProgress = Math.min(100, metrics.progressPct);
  const strokeDashoffset = circumference - (ringProgress / 100) * circumference;
  const revenueCardData = growthInsights.allowed && !growthQuery.isLoading && !growthQuery.isError ? growthQuery.data : undefined;
  const revenuePotential = revenueCardData ? calculateRevenuePotential({
    mrr: revenueCardData.mrrRes,
    hourly: revenueCardData.hourlyRes,
    capacity: revenueCardData.capacityRes,
  }) : null;
  const revenueCardFreeHours = revenueCardData ? weeklyFreeTeachingHours(revenueCardData.capacityRes) : null;
  const revenueCardMRR = revenueCardData?.mrrRes;
  const hasRevenueCardMRR = revenueCardMRR?.hasBillingData && Number.isFinite(revenueCardMRR.totalMRR) && revenueCardMRR.totalMRR > 0;
  const revenueCardMoney = (value: number) => money(new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "en-US", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2,
  }).format(value));

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <PageHeader
        title={t.title}
        titleAddon={<InfoTooltip label={`${tr("globalUi.aboutPage")} ${t.title}`} text={t.description} className="text-muted-foreground" />}
        actions={<FinancialPrivacyToggle />}
      />

      {/* Meta Mensal & Capacidade Grid — items-start: expanding the capacity times must not stretch the goal card */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        {/* LEFT COLUMN: Monthly Goal + Revenue Potential (each keeps its own height) */}
        <div className="flex min-w-0 flex-col gap-5">
          {/* MONTHLY GOAL CARD */}
          {loadingGrowth ? (
            <PanelSkeleton label={t.title} />
          ) : monthlyGoal === null || monthlyGoal <= 0 ? (
            /* EMPTY STATE CARD: No Goal Set */
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <h3 className="font-display text-lg font-bold text-foreground">{t.monthlyGoalTitle}</h3>
                </div>
              </div>

              <div className="my-4 flex flex-col items-center justify-center text-center p-4 space-y-3">
                <div className="h-14 w-14 rounded-full bg-primary-soft flex items-center justify-center text-primary">
                  <Target className="h-7 w-7" />
                </div>
                <div className="space-y-1 max-w-sm">
                  <h4 className="font-display text-base font-bold text-foreground">
                    {tr("auditUi.setYourMonthlyGoal")}
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {tr("auditUi.addYourMonthlyTargetToTrackRevenue")}
                  </p>
                </div>
                <Button
                  onClick={handleOpenEditGoal}
                  className="mt-1 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/95"
                >
                  <PlusCircle className="mr-1.5 h-4 w-4" />
                  {tr("auditUi.setGoal")}
                </Button>
              </div>
            </div>
          ) : (
            /* REAL GOAL SET CARD */
            <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <h3 className="font-display text-lg font-bold text-foreground">{t.monthlyGoalTitle}</h3>
                </div>
                <button
                  onClick={handleOpenEditGoal}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline cursor-pointer bg-primary-soft/50 hover:bg-primary-soft px-2.5 py-1 rounded-lg transition-colors"
                  title="Editar meta mensal"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>{tr("auditUi.editGoal")}</span>
                </button>
              </div>

              <div className="my-6 flex flex-col items-center justify-center gap-5 sm:flex-row">
                {/* Progress Circular Ring */}
                <div className="relative h-32 w-32 shrink-0">
                  <svg className="h-full w-full -rotate-90">
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      className="stroke-secondary fill-none"
                      strokeWidth="8"
                    />
                    <circle
                      cx="64"
                      cy="64"
                      r={radius}
                      className="stroke-primary fill-none transition-all duration-500 ease-out"
                      strokeWidth="8"
                      strokeDasharray={circumference}
                      strokeDashoffset={strokeDashoffset}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-2xl font-extrabold text-foreground">
                      {metrics.progressPct}%
                    </span>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      {tr("auditUi.goal")}
                    </span>
                  </div>
                </div>

                {/* Goal Text Values */}
                <div className="text-center sm:text-left space-y-2 flex-1">
                  <div className="text-2xl font-extrabold text-foreground flex items-baseline justify-center sm:justify-start gap-1 flex-wrap">
                    <button
                      onClick={() => navigate({ to: "/finance" })}
                      className="hover:text-primary transition-colors cursor-pointer text-left"
                      title={tr("auditUi.clickToViewDetailedRevenueInFinance")}
                    >
                      {formatBRL(mrrData.totalMRR)}
                    </button>
                    <span className="text-muted-foreground font-semibold text-lg">
                      {" "}/ {formatBRL(monthlyGoal)}
                    </span>
                  </div>

                  {metrics.goalReached ? (
                    <div className="space-y-0.5">
                      <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 justify-center sm:justify-start">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{tr("auditUi.goalReached")}</span>
                      </p>
                      {metrics.overage > 0 && (
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          {formatBRL(metrics.overage)} {tr("auditUi.aboveTarget")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground font-medium">
                      {t.remaining}{" "}
                      <span className="font-bold text-foreground">{formatBRL(metrics.remaining)}</span>
                    </p>
                  )}

                  {/* Student Gap Recommendation Box */}
                  {!metrics.goalReached && (
                    <div className="mt-3 rounded-xl bg-primary-soft/60 p-3 text-xs text-primary leading-snug space-y-2">
                      {metrics.hasEnoughDataForGap ? (
                        <>
                          <p className="font-medium">
                            {lang === "pt"
                              ? `Para atingir sua meta, faltam aproximadamente `
                              : `To reach your goal, you need approximately `}
                            <strong className="font-extrabold text-foreground">
                              {metrics.studentGap} {metrics.studentGap === 1 ? (tr("auditUi.student")) : (tr("auditUi.students"))}
                            </strong>
                            {lang === "pt"
                              ? ` com ticket semelhante ao atual (${formatBRL(metrics.avgTicket)}/mês).`
                              : ` with a similar ticket as current average (${formatBRL(metrics.avgTicket)}/mo).`}
                          </p>

                          {/* Schedule Capacity Limitation Bottleneck */}
                          {capacityData.hasWorkingHours && metrics.studentGap > capacityData.totalRemainingSlots && (
                            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] leading-relaxed space-y-1">
                              <p className="font-bold flex items-center gap-1">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                <span>
                                  {lang === "pt"
                                    ? `Pelo seu horário atual, você tem capacidade para aproximadamente ${capacityData.totalRemainingSlots} novos alunos.`
                                    : `Based on your current schedule, you have capacity for approximately ${capacityData.totalRemainingSlots} new students.`}
                                </span>
                              </p>
                              <p className="text-[10px] opacity-90 font-normal">
                                {tr("auditUi.toReachYourGoalWithNewStudents")}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="font-medium opacity-90 text-[11px]">
                          {tr("auditUi.addYourActiveStudentsAndPackageContracts")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* REVENUE POTENTIAL CARD */}
          <div className="rounded-2xl border border-border bg-sidebar text-sidebar-accent-foreground p-6 shadow-[var(--shadow-sm)] flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-sidebar-primary" />
                <h3 className="font-display text-lg font-bold">{tr("growthRevenue.title")}</h3>
              </div>
            </div>

            {growthInsights.isLoading ? (
              <div className="mt-6 flex-1 space-y-4" role="status" aria-label={tr("growthRevenue.title")}>
                <Skeleton className="h-4 w-2/3 bg-sidebar-accent-foreground/15" />
                <Skeleton className="h-4 w-1/2 bg-sidebar-accent-foreground/15" />
                <Skeleton className="h-8 w-4/5 bg-sidebar-accent-foreground/15" />
              </div>
            ) : !growthInsights.allowed ? (
              <PremiumCardLock tone="dark" onLearnMore={() => setIsPremiumDialogOpen(true)} />
            ) : (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-sidebar-accent-foreground/15 pb-2">
                <span className="text-xs font-semibold text-sidebar-foreground">{tr("growthRevenue.projectedRevenue")}</span>
                <span className="font-display font-bold">{hasRevenueCardMRR && revenueCardMRR ? revenueCardMoney(revenueCardMRR.totalMRR) : NO_DATA}</span>
              </div>

              <div className="border-b border-sidebar-accent-foreground/15 pb-2 space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-xs font-semibold text-sidebar-foreground">{tr("growthRevenue.freeHours")}</span>
                  <span className="font-display font-bold">{revenueCardFreeHours !== null ? tr("growthRevenue.weeklyHours").replace("{hours}", fmtH(revenueCardFreeHours)) : NO_DATA}</span>
                </div>
                <p className="text-[11px] text-sidebar-foreground">{tr("growthRevenue.capacityPeriod")}</p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-sidebar-accent-foreground/15 pb-2">
                <span className="text-xs font-semibold text-sidebar-foreground">{tr("growthRevenue.revenuePerHour")}</span>
                <span className="font-display font-bold">{revenuePotential ? tr("growthRevenue.hourlyAmount").replace("{amount}", revenueCardMoney(revenuePotential.effectiveRevenuePerHour)) : NO_DATA}</span>
              </div>

              <div className="space-y-2 pt-1">
                <p className="text-xs font-semibold text-sidebar-foreground">{tr("growthRevenue.estimatedPotential")}</p>
                <p className="font-display text-2xl font-extrabold break-words">
                  {revenuePotential ? tr("growthRevenue.monthlyAmount").replace("{amount}", revenueCardMoney(revenuePotential.estimatedRevenuePotential)) : NO_DATA}
                </p>
                {revenuePotential && revenuePotential.weeklyFreeHours > 0 ? (
                  <p className="text-xs text-sidebar-foreground">{tr("growthRevenue.additionalPotential").replace("{amount}", revenueCardMoney(revenuePotential.additionalMonthlyPotential))}</p>
                ) : null}
                <p className="text-xs text-sidebar-foreground leading-relaxed">
                  {revenuePotential
                    ? revenuePotential.weeklyFreeHours === 0
                      ? tr("growthRevenue.fullyOccupied")
                      : tr("growthRevenue.estimate").replace("{amount}", revenueCardMoney(revenuePotential.estimatedRevenuePotential))
                    : tr("growthRevenue.insufficientData")}
                </p>
              </div>
            </div>
            )}
          </div>
        </div>

        {/* TEACHING CAPACITY CARD */}
        {growthQuery.isError ? (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-3">
            <h3 className="font-display text-lg font-bold text-foreground">{t.capacityTitle}</h3>
            <p role="alert" className="text-sm text-destructive">{tr("growthAvailability.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => growthQuery.refetch()}>{tr("growthAvailability.retry")}</Button>
          </div>
        ) : !capacityData.hasWorkingHours ? (
          /* EMPTY STATE: No Working Availability Configured */
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent" />
                <h3 className="font-display text-lg font-bold text-foreground">{t.capacityTitle}</h3>
              </div>
            </div>

            <div className="my-4 flex flex-col items-center justify-center text-center p-4 space-y-3">
              <div className="h-14 w-14 rounded-full bg-accent-soft flex items-center justify-center text-accent">
                <Clock className="h-7 w-7" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h4 className="font-display text-base font-bold text-foreground">
                  {tr("auditUi.configureYourAvailabilityToCalculateYourTeaching")}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {tr("auditUi.setYourWeeklyWorkingDaysAndHours")}
                </p>
              </div>
              <Button
                onClick={() => setIsAvailabilityModalOpen(true)}
                className="mt-1 rounded-xl bg-accent text-xs font-bold text-accent-foreground shadow-sm hover:bg-accent/90 cursor-pointer"
              >
                <Clock className="mr-1.5 h-4 w-4" />
                {tr("auditUi.configureAvailability")}
              </Button>
            </div>
          </div>
        ) : (
          /* REAL CAPACITY CARD */
          <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
            {/* Title + free hours on the left, occupancy ring with the weekly hours and % on the right */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col items-start justify-between gap-3 pt-1 sm:min-h-36">
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-bold text-foreground">{t.capacityTitle}</h3>
                  <div className="mt-1.5 text-xs font-bold text-accent">
                    {realTeachWeeklyH > 0
                      ? `${fmtH(realFreeWeeklyH)}h ${t.capacityFreeHours}`
                      : t.capacityNoSchedule}
                  </div>
                </div>
                {/* sm+: beside the ring; on phones the column is too narrow, so it stays at the card bottom */}
                <button
                  onClick={() => setIsAvailabilityModalOpen(true)}
                  className="hidden h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 cursor-pointer sm:inline-flex"
                >
                  <span>{tr("auditUi.configureAvailability")}</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
              <div
                className="relative h-36 w-36 shrink-0"
                role="img"
                aria-label={`${fmtH(realTeachWeeklyH)}h / ${fmtH(realAvailWeeklyH)}h · ${realOccupancyPct ?? 0}% ${t.capacityOccupied}`}
              >
                <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden="true">
                  <circle cx="60" cy="60" r="54" className="fill-none stroke-secondary" strokeWidth="8" />
                  <circle
                    cx="60"
                    cy="60"
                    r="54"
                    pathLength={100}
                    className="fill-none stroke-accent transition-[stroke-dasharray] duration-500 ease-out"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${Math.min(100, realOccupancyPct ?? 0)} 100`}
                  />
                </svg>
                {(() => {
                  const hoursLabel = `${fmtH(realTeachWeeklyH)}h / ${fmtH(realAvailWeeklyH)}h`;
                  return (
                    <span aria-hidden="true" className="absolute inset-[18px] flex flex-col items-center justify-center text-center tabular-nums">
                      <span className={`whitespace-nowrap font-display font-extrabold leading-tight text-foreground ${hoursLabel.length > 9 ? "text-base" : "text-lg"}`}>
                        {hoursLabel}
                      </span>
                      <span className="mt-0.5 text-xs font-semibold text-muted-foreground/80">{realOccupancyPct ?? 0}%</span>
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Days (one per row) + reserved area on the right for the hovered/focused day's times */}
            <div className="mt-2 grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-x-6 sm:mt-3">
              <ul ref={capacityRowsRef} className="divide-y divide-border/40">
                {capacityDays.map((day) => (
                  <li
                    key={day.day}
                    tabIndex={0}
                    onPointerEnter={(event) => { if (event.pointerType === "mouse") setHoveredCapacityDay(day.day); }}
                    onPointerLeave={(event) => { if (event.pointerType === "mouse") setHoveredCapacityDay((current) => (current === day.day ? null : current)); }}
                    onFocus={() => setFocusedCapacityDay(day.day)}
                    onBlur={() => setFocusedCapacityDay((current) => (current === day.day ? null : current))}
                    onClick={(event) => event.currentTarget.focus()} // touch: tapping a day reveals its times
                    aria-describedby={`capacity-times-${day.day}`}
                    className="flex h-11 cursor-default flex-col justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <span className="text-sm font-semibold leading-tight text-foreground">{formatWeekday(day.day)}</span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      {day.remainingSlots === 0 ? t.full : `${day.remainingSlots} ${t.available}`}
                    </span>
                  </li>
                ))}
              </ul>
              {/* Absolute lists in an area sized to the longest list: showing one never changes the card height. */}
              <div ref={capacityTimesRef} className="relative" style={capacityTimesLayout.height ? { height: capacityTimesLayout.height } : undefined}>
                {capacityDays.map((day, index) => {
                  const visible = shownCapacityDay === day.day;
                  return (
                    <div
                      key={day.day}
                      id={`capacity-times-${day.day}`}
                      aria-hidden={!visible}
                      style={{ top: capacityTimesLayout.tops[index] ?? 0 }}
                      className={`pointer-events-none absolute inset-x-0 flex min-h-11 items-center transition-opacity duration-200 ease-out ${visible ? "opacity-100" : "opacity-0"}`}
                    >
                      {day.availableSlots.length > 0 ? (
                        <ul className="w-full list-disc columns-[6.5rem] gap-x-4 pl-4 text-xs leading-5 text-foreground/60 tabular-nums marker:text-foreground/30">
                          {day.availableSlots.map((slot) => (
                            <li key={slot.startTime} className="break-inside-avoid">{slot.startTime} – {slot.endTime}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-foreground/60">{tr("growthAvailability.empty")}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex justify-end sm:hidden">
              <button
                onClick={() => setIsAvailabilityModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 cursor-pointer"
              >
                <span>{tr("auditUi.configureAvailability")}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>


      {/* METRICS DASHBOARD SECTION — 100% real, teacher-scoped data */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-bold text-foreground">{t.metricsTitle}</h3>
        <GrowthMetricsChart
          months={growthMetrics.history.months}
          locale={lang === "pt" ? "pt-BR" : "en-US"}
          loading={loadingMetrics}
          texts={{ noHistory: t.metricsNoHistory, insufficient: t.metricsInsufficient, current: t.metricsCurrentValue }}
          options={[
            {
              key: "newStudents",
              label: t.metricNewStudents,
              currentText: metricCount(growthMetrics.newStudentsThisMonth.value),
              trend: metricTrend(growthMetrics.newStudentsThisMonth.change),
              series: growthMetrics.history.newStudents,
              formatValue: (v) => `${v} ${v === 1 ? t.metricsUnitStudent : t.metricsUnitStudents}`,
              formatTick: (v) => String(v),
              unit: t.metricsUnitStudents,
              integer: true,
              note: growthMetrics.newStudentsWithoutStartDate > 0
                ? t.metricsNoStartDate.replace("{n}", String(growthMetrics.newStudentsWithoutStartDate))
                : undefined,
            },
            {
              key: "retention",
              label: t.metricRetention,
              currentText: metricPercent(growthMetrics.retentionRate.value),
              trend: metricTrend(growthMetrics.retentionRate.change),
              series: null, // current snapshot only: no stored status history
              formatValue: (v) => formatPercent(v),
              formatTick: (v) => formatPercent(v),
              unit: "%",
            },
            {
              key: "renewal",
              label: t.metricRenewal,
              currentText: metricPercent(growthMetrics.renewalRate.value),
              trend: metricTrend(growthMetrics.renewalRate.change),
              series: null, // current snapshot only
              formatValue: (v) => formatPercent(v),
              formatTick: (v) => formatPercent(v),
              unit: "%",
            },
            {
              key: "avgPackage",
              label: t.metricAvgPackage,
              currentText: metricMoney(avgRevenuePerPayingStudent),
              series: null, // current contracted revenue snapshot only
              formatValue: (v) => formatBRL(v),
              formatTick: (v) => (financialValuesHidden ? "" : formatBRLCompact(v)),
              unit: "R$",
            },
            {
              key: "avgRevenue",
              label: t.metricAvgRevenue,
              currentText: metricMoney(growthMetrics.avgRevenuePerStudent.value),
              trend: metricTrend(growthMetrics.avgRevenuePerStudent.change),
              series: growthMetrics.history.avgRevenuePerStudent,
              formatValue: (v) => formatBRL(v),
              formatTick: (v) => (financialValuesHidden ? "" : formatBRLCompact(v)),
              unit: "R$",
            },
            {
              key: "growthRate",
              label: t.metricGrowthRate,
              currentText: metricSignedPercent(growthMetrics.monthlyGrowthRate.value),
              trend: metricTrend(growthMetrics.monthlyGrowthRate.change),
              series: growthMetrics.history.monthlyGrowthRate,
              formatValue: (v) => formatGrowthPercent(v),
              formatTick: (v) => formatPercent(v),
              unit: "%",
            },
          ]}
        />
      </section>

      {/* HOURLY RATE SIMULATOR SECTION */}
      <section className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-[var(--shadow-sm)]">
        <div className="mb-6">
          <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
            {tr("auditUi.hourlyRateSimulator")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {tr("auditUi.discoverHowMuchToChargePerTeaching")}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 items-start">
          {/* Left Column: Input Form */}
          <div className="flex flex-col gap-5 pt-6">
            {/* Income Goal Row */}
            <div className="grid grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <Label
                  htmlFor="sim-income"
                  className="text-xs font-semibold text-foreground flex items-center gap-1"
                >
                  {tr("auditUi.desiredNetIncome")}
                  <span className="text-[10px] text-muted-foreground font-medium opacity-85">
                    (Take-home)
                  </span>
                </Label>
                <SafeNumberInput
                  id="sim-income"
                  min={1}
                  value={incomeGoal}
                  onChange={setIncomeGoal}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sim-currency" className="text-xs font-semibold text-foreground">
                  {tr("auditUi.currency")}
                </Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id="sim-currency" className="h-10 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="R$">Real (R$)</SelectItem>
                    <SelectItem value="$">Dollar ($)</SelectItem>
                    <SelectItem value="€">Euro (€)</SelectItem>
                    <SelectItem value="£">Pound (£)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Working Capacity & Workload Breakdown Row */}
            <div className="grid grid-cols-3 gap-4">
              <div className="relative flex flex-col pb-4">
                <Label
                  htmlFor="sim-workhrs"
                  className="text-[11px] font-semibold text-foreground block"
                >
                  {tr("auditUi.totalWorkHoursWeek")}
                  <span className="text-[9px] text-muted-foreground block leading-tight mt-0.5">
                    ({tr("auditUi.desiredTotalWorkload")})
                  </span>
                </Label>
                <SafeNumberInput
                  id="sim-workhrs"
                  min={1}
                  value={workHoursPerWeek}
                  onChange={(val) => {
                    setWorkHoursPerWeek(val);
                    if (teachHoursPerWeek > val) {
                      setTeachHoursPerWeek(val);
                    }
                  }}
                  className="h-10 rounded-xl mt-auto"
                />
              </div>

              <div className="relative flex flex-col pb-4">
                <Label
                  htmlFor="sim-teachhrs"
                  className="text-[11px] font-semibold text-foreground block"
                >
                  {tr("auditUi.hoursReservedForLessonsWeek")}
                  <span className="text-[9px] text-muted-foreground block leading-tight mt-0.5">
                    ({tr("auditUi.paidTeachingSlots")})
                  </span>
                </Label>
                <SafeNumberInput
                  id="sim-teachhrs"
                  min={1}
                  max={workHoursPerWeek}
                  value={teachHoursPerWeek}
                  onChange={(val) => {
                    if (val > workHoursPerWeek) {
                      toast.error(
                        tr("auditUi.teachingHoursCannotExceedTotalWorkHours")
                      );
                      setTeachHoursPerWeek(workHoursPerWeek);
                    } else {
                      setTeachHoursPerWeek(val);
                    }
                  }}
                  className="h-10 rounded-xl mt-auto"
                />
              </div>

              <div className="relative flex flex-col pb-4">
                <Label
                  htmlFor="sim-weeks"
                  className="text-[11px] font-semibold text-foreground flex items-center justify-between"
                >
                  <span>{tr("auditUi.averageWeeksMonth")}</span>
                  <span
                    className="cursor-help text-muted-foreground hover:text-foreground"
                    title={
                      tr("auditUi.weUseAnAnnualAverage52Weeks")
                    }
                  >
                    <Info className="h-3 w-3 inline-block" />
                  </span>
                </Label>
                <SafeNumberInput
                  id="sim-weeks"
                  min={1}
                  max={5}
                  step={0.01}
                  value={weeksPerMonth}
                  onChange={setWeeksPerMonth}
                  className="h-10 rounded-xl mt-auto"
                />
                <span className="text-[9px] text-muted-foreground block leading-none absolute bottom-0 left-0">
                  ({tr("auditUi.annualAvg433")})
                </span>
              </div>
            </div>

            {/* Visual Workload Split & Slider */}
            <div className="space-y-2 p-4 rounded-xl bg-secondary/35 border border-border/50">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                  {tr("auditUi.workloadSplitForLessons")}
                </span>
                <span className="text-primary font-extrabold text-xs">
                  {teachHoursPerWeek}h / {workHoursPerWeek}h (
                  {Math.round((teachHoursPerWeek / (workHoursPerWeek || 1)) * 100)}%)
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={workHoursPerWeek}
                value={teachHoursPerWeek}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 1;
                  if (val <= workHoursPerWeek) setTeachHoursPerWeek(val);
                }}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />

              <div className="text-[11px] text-muted-foreground leading-relaxed pt-0.5">
                <p className="font-medium text-foreground/80">
                  💡 {Math.max(0, workHoursPerWeek - teachHoursPerWeek)}h {tr("auditUi.weeklyHoursRemainAvailableForPreparationAdmin")}
                </p>
                {Math.round((teachHoursPerWeek / (workHoursPerWeek || 1)) * 100) > 75 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
                    ⚠️ {tr("auditUi.youAllocatedOver75OfYourWorkload")}
                  </p>
                )}
              </div>
            </div>

            {/* Advanced Settings Drawer */}
            <div className="border border-border/70 rounded-xl overflow-hidden bg-secondary/5">
              <button
                type="button"
                onClick={() => setAdvancedExpanded(!advancedExpanded)}
                className="w-full flex items-center justify-between p-3.5 text-xs font-bold text-foreground hover:bg-secondary/40 transition-colors"
              >
                <span>
                  {tr("auditUi.advancedSettingsCostsMargins")}
                </span>
                <span>{advancedExpanded ? "▲" : "▼"}</span>
              </button>

              {advancedExpanded && (
                <div className="p-4 pt-0 border-t border-border/40 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Estimated Expenses */}
                  <div className="space-y-1 pt-3">
                    <Label
                      htmlFor="sim-exp"
                      className="text-xs font-semibold text-foreground flex items-center justify-between"
                    >
                      <span>
                        {tr("auditUi.monthlyBusinessExpenses")}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {isManualExpenses
                          ? (tr("auditUi.manualEstimate"))
                          : (tr("auditUi.realFinanceData"))}
                      </span>
                    </Label>
                    <SafeNumberInput
                      id="sim-exp"
                      min={0}
                      value={expenses}
                      onChange={setExpenses}
                      className="h-10 rounded-xl"
                    />
                  </div>

                  {/* Taxes & Margin Row */}
                  <div className="grid grid-cols-2 gap-4 items-start">
                    <div className="space-y-1">
                      <Label htmlFor="sim-tax" className="text-xs font-semibold text-foreground">
                        {tr("auditUi.taxPaymentFees")}
                      </Label>
                      <div className="relative">
                        <SafeNumberInput
                          id="sim-tax"
                          min={0}
                          max={90}
                          value={taxPercent}
                          onChange={setTaxPercent}
                          className="h-10 rounded-xl pr-6"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">
                          %
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="sim-safety" className="text-xs font-semibold text-foreground">
                        {tr("auditUi.safetyMargin")}
                      </Label>
                      <div className="relative">
                        <SafeNumberInput
                          id="sim-safety"
                          min={0}
                          max={100}
                          value={safetyMarginPercent}
                          onChange={setSafetyMarginPercent}
                          className="h-10 rounded-xl pr-6"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-muted-foreground font-bold">
                          %
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Suggestions Banner */}
            <div className="rounded-xl border border-border/80 bg-primary-soft/30 p-4 space-y-1.5">
              <h5 className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {tr("auditUi.currentBusinessData")}
              </h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold text-foreground/80">
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {tr("auditUi.activeStudents")}
                  </span>
                  <span>{currentStudentsCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {tr("auditUi.currentMrr")}
                  </span>
                  <span>
                    {currentMRR > 0 ? formatBRL(currentMRR) : (tr("auditUi.0"))}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {tr("auditUi.avgHourlyRate")}
                  </span>
                  <span>
                    {currentAvgHourlyRate > 0
                      ? `${currency} ${currentAvgHourlyRate}/h`
                      : (tr("auditUi.noData"))}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {tr("auditUi.agendaOccupied")}
                  </span>
                  <span>{realOccupancyPct !== null ? `${realOccupancyPct}%` : tr("auditUi.noData")}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  if (!user) return;
                  if (incomeGoal <= 0) {
                    toast.error(tr("auditUi.pleaseEnterAValidGoal"));
                    return;
                  }
                  setIsSavingGoal(true);
                  const res = await saveMonthlyGoal(user.id, incomeGoal);
                  setIsSavingGoal(false);
                  if (res.success) {
                    setMonthlyGoal(incomeGoal);
                    toast.success(
                      tr("auditUi.savedAsYourOfficialMonthlyGoal")
                    );
                  } else {
                    toast.error(toUserMessage(res.error, i18nT("errors.saveGoal", lang)));
                  }
                }}
                disabled={isSavingGoal}
                className="flex-1 inline-flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingGoal ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {tr("auditUi.saveAsMyPricingGoal")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncomeGoal(monthlyGoal ?? 0);

                  setWorkHoursPerWeek(
                    capacityData.hasWorkingHours && capacityData.availableWeeklyMinutes > 0
                      ? Math.round(capacityData.availableWeeklyMinutes / 60)
                      : 40,
                  );
                  setTeachHoursPerWeek(20);

                  setWeeksPerMonth(4.33);
                  setExpenses(realExpenses);
                  setTaxPercent(15);
                  setSafetyMarginPercent(10);
                  toast.info(tr("auditUi.simulatorResetToRealData"));
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary cursor-pointer transition-all"
              >
                {tr("auditUi.reset")}
              </button>
            </div>
          </div>

          {/* Right Column: Prominent Results Card */}
          <div className="flex flex-col rounded-2xl border border-border bg-gradient-lilac p-6 shadow-sm text-lilac-foreground self-start h-full">
            {(() => {
              const monthlyBillableHours = Math.max(1, Math.round(teachHoursPerWeek * weeksPerMonth));
              const grossNeeded = Math.round(
                ((incomeGoal + expenses) * (1 + safetyMarginPercent / 100)) /
                  (1 - taxPercent / 100),
              );

              const minHourlyRate = Math.round(
                (expenses * (1 + safetyMarginPercent / 100)) / (monthlyBillableHours || 1),
              );
              const recHourlyRate = Math.round((grossNeeded / (monthlyBillableHours || 1)) * 100) / 100;
              const money = (v: number) =>
                `${currency} ${v.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              const hoursFmt = (v: number) =>
                v.toLocaleString(lang === "pt" ? "pt-BR" : "en-US", { maximumFractionDigits: 1 });
              const fill = (key: string, vars: Record<string, string | number>) =>
                Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), tr(key));

              // Real Bloom data
              const hasRealAvg = effectiveHourlyData.hasEnoughData && effectiveHourlyData.effectiveHourlyRate > 0;
              const realAvg = hasRealAvg ? effectiveHourlyData.effectiveHourlyRate : 0;
              const teachingHoursMonth = effectiveHourlyData.billableHoursPerMonth;
              const availableHoursMonth = capacityData.hasWorkingHours
                ? Math.round((capacityData.availableWeeklyMinutes / 60) * WEEKS_PER_MONTH * 10) / 10
                : 0;
              const hasCapacity = availableHoursMonth > 0 && teachingHoursMonth > 0;
              const capacityPct = hasCapacity ? Math.round((teachingHoursMonth / availableHoursMonth) * 100) : null;
              const realDiff = hasRealAvg ? Math.round((recHourlyRate - realAvg) * 100) / 100 : 0;
              const canCompare = hasRealAvg && incomeGoal > 0;
              const insight = !canCompare
                ? null
                : realAvg >= recHourlyRate * 0.95
                  ? tr("auditUi.hiAligned")
                  : capacityPct === null
                    ? fill("auditUi.hiBelowNoCapacity", { diff: money(realDiff) })
                    : capacityPct < 70
                      ? fill("auditUi.hiLowOccupancy", { pct: capacityPct, diff: money(realDiff) })
                      : fill("auditUi.hiHighOccupancy", { pct: capacityPct, diff: money(realDiff) });
              
              // Calendar Feasibility Check: Compare reserved lesson hours against real calendar capacity
              const realCalendarSlots = capacityData.hasWorkingHours && capacityData.availableWeeklyMinutes > 0
                ? Math.round((capacityData.availableWeeklyMinutes / 60) * 10) / 10
                : workHoursPerWeek;
              const isOverCalendarCapacity = teachHoursPerWeek > realCalendarSlots;

              // Projections
              const weeklyVIPsNeeded = Math.round(monthlyBillableHours / (weeksPerMonth || 1));
              const groupsNeeded = Math.ceil(weeklyVIPsNeeded / 5);

              return (
                <div className="flex flex-col gap-5">
                  {/* Recommended rate badge */}
                  <div className="text-center py-4 border-b border-lilac-foreground/20 space-y-1">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest opacity-80 block">
                      {tr("auditUi.recommendedHourlyRate")}
                    </span>
                    <h3 className="font-display text-4xl font-extrabold text-white">
                      {money(recHourlyRate)}{" "}
                      <span className="text-sm font-semibold opacity-90">
                        /{tr("auditUi.hour")}
                      </span>
                    </h3>
                    <p className="text-[11px] opacity-80 pt-1">
                      {lang === "pt"
                        ? `Com ${teachHoursPerWeek}h reservadas para aulas por semana e sua estrutura atual de custos.`
                        : `With ${teachHoursPerWeek} weekly reserved lesson hours and current cost structure.`}
                    </p>
                  </div>

                  {/* Real Bloom data insights */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold">
                    <div className="space-y-1 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">{tr("auditUi.hiCurrentAvg")}</span>
                      {hasRealAvg ? (
                        <>
                          <span className="text-sm font-bold text-white block">{money(realAvg)}/h</span>
                          <span className="text-[11px] font-medium opacity-80 block leading-snug">
                            {fill("auditUi.hiCurrentAvgContext", {
                              students: effectiveHourlyData.activeStudentCount,
                              hours: hoursFmt(teachingHoursMonth),
                            })}
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium opacity-80 block leading-snug">{tr("auditUi.hiNoCurrentAvg")}</span>
                      )}
                    </div>
                    <div className="space-y-1 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">{tr("auditUi.hiCapacity")}</span>
                      {capacityData.hasWorkingHours && availableHoursMonth > 0 ? (
                        <>
                          <span className="text-sm font-bold text-white block">{capacityPct !== null ? `${capacityPct}%` : "—"}</span>
                          <span className="text-[11px] font-medium opacity-80 block leading-snug">
                            {tr("auditUi.hiTeachingHours")}: {teachingHoursMonth > 0 ? `${hoursFmt(teachingHoursMonth)}h` : "—"} · {tr("auditUi.hiAvailableHours")}: {hoursFmt(availableHoursMonth)}h
                          </span>
                        </>
                      ) : (
                        <span className="text-[11px] font-medium opacity-80 block leading-snug">{tr("auditUi.hiNoAvailability")}</span>
                      )}
                    </div>
                  </div>

                  {canCompare && (
                    <div className="rounded-xl bg-white/10 border border-white/20 p-3.5 space-y-1.5 text-white text-xs">
                      <h5 className="text-[10px] uppercase font-bold tracking-wider opacity-90">{tr("auditUi.hiCompare")}</h5>
                      <div className="flex justify-between"><span className="opacity-85">{tr("auditUi.hiCurrent")}</span><span className="font-bold">{money(realAvg)}/h</span></div>
                      <div className="flex justify-between"><span className="opacity-85">{tr("auditUi.hiRecommended")}</span><span className="font-bold">{money(recHourlyRate)}/h</span></div>
                      <div className="flex justify-between border-t border-white/15 pt-1.5"><span className="opacity-85">{tr("auditUi.hiDifference")}</span><span className="font-bold">{realDiff > 0 ? "+" : ""}{money(realDiff)}/h</span></div>
                      {insight && <p className="text-[11px] leading-snug opacity-95 pt-1">{insight}</p>}
                    </div>
                  )}

                  {/* Calculations Details grid */}
                  <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 flex items-center gap-1">
                        <span>{tr("auditUi.minSustainableRate")}</span>
                        <span
                          className="cursor-help opacity-70 hover:opacity-100"
                          title={
                            tr("auditUi.theLowestHourlyRateThatCoversOperating")
                          }
                        >
                          <Info className="h-3 w-3 inline-block" />
                        </span>
                      </span>
                      <span className="text-sm font-bold text-white">
                        {money(minHourlyRate)}/h
                      </span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">
                        {tr("auditUi.requiredGrossRevenue")}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {money(grossNeeded)}/{t.month}
                      </span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">
                        {tr("auditUi.billableHoursMonth")}
                      </span>
                      <span className="text-sm font-bold text-white">{monthlyBillableHours}h</span>
                    </div>

                  </div>

                  {/* Calendar Feasibility Alert */}
                  <div
                    className={`rounded-xl p-3.5 border text-xs font-semibold leading-relaxed flex gap-2.5 items-start ${
                      isOverCalendarCapacity
                        ? "bg-destructive/15 text-destructive-foreground border-destructive/20"
                        : "bg-white/10 text-white border-white/20"
                    }`}
                  >
                    {isOverCalendarCapacity ? (
                      <>
                        <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-amber-300" />
                        <div className="space-y-1.5 flex-1">
                          <p className="font-bold text-amber-200">
                            {tr("auditUi.calendarAvailabilityAlert")}
                          </p>
                          <p className="opacity-95 text-[11px] leading-normal">
                            {lang === "pt"
                              ? `Sua meta é reservar ${teachHoursPerWeek}h por semana para aulas, mas sua disponibilidade atual configurada no calendário comporta aproximadamente ${realCalendarSlots}h.`
                              : `Your goal is to reserve ${teachHoursPerWeek}h/week for lessons, but your current calendar availability supports approximately ${realCalendarSlots}h.`}
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsAvailabilityModalOpen(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[11px] font-bold transition-colors cursor-pointer"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{tr("auditUi.reviewAvailability")}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4.5 w-4.5 shrink-0 text-emerald-300" />
                        <div>
                          <p className="font-bold text-emerald-200">
                            {tr("auditUi.goalFitsCalendarAvailability")}
                          </p>
                          <p className="opacity-95 text-[11px] leading-normal mt-0.5">
                            {lang === "pt"
                              ? `Sua meta de reservar ${teachHoursPerWeek}h semanais para aulas se encaixa perfeitamente na sua disponibilidade configurada de ${realCalendarSlots} slots semanais.`
                              : `Your target of ${teachHoursPerWeek} weekly lesson hours fits within your configured availability of ${realCalendarSlots} slots.`}
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Student Projections estimate box */}
                  <div className="rounded-xl bg-white/5 border border-white/15 p-3.5 space-y-2 text-white">
                    <h5 className="text-[10px] uppercase font-bold tracking-wider opacity-90">
                      {tr("auditUi.studentProjections")}
                    </h5>
                    <p className="text-[11px] leading-snug opacity-95">
                      {tr("auditUi.toReachThisGoalYouWouldNeed")}
                    </p>
                    <ul className="text-xs list-disc list-inside space-y-1 font-medium pl-1">
                      <li>
                        {lang === "pt"
                          ? `${weeklyVIPsNeeded} alunos VIP semanais no valor hora recomendado de ${money(recHourlyRate)}`
                          : `${weeklyVIPsNeeded} weekly VIP students at the recommended rate of ${money(recHourlyRate)}`}
                      </li>
                      <li className="list-none italic opacity-70 text-[10px] pl-3">
                        — {tr("auditUi.or")} —
                      </li>
                      <li>
                        {lang === "pt"
                          ? `${groupsNeeded} turmas com 5 alunos cada`
                          : `${groupsNeeded} group classes with 5 students each`}
                      </li>
                    </ul>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Pricing scenarios list comparison */}
        {(() => {
          const monthlyBillableHours = teachHoursPerWeek * weeksPerMonth;
          const grossNeeded = Math.round(
            ((incomeGoal + expenses) * (1 + safetyMarginPercent / 100)) / (1 - taxPercent / 100),
          );

          const minHourlyRate = Math.round((incomeGoal + expenses) / (monthlyBillableHours || 1));
          const recHourlyRate = Math.round(grossNeeded / (monthlyBillableHours || 1));

          const scenarios = [
            {
              name: tr("auditUi.currentPricing"),
              rate: currentAvgHourlyRate,
              mrr: currentMRR,
              hours: effectiveHourlyData.billableHoursPerMonth,
              students: currentStudentsCount,
              occupancy: realOccupancyPct ?? 0,
            },
            {
              name: tr("auditUi.minSustainable"),
              rate: minHourlyRate,
              mrr: incomeGoal + expenses,
              hours: monthlyBillableHours,
              students: Math.round(monthlyBillableHours / weeksPerMonth),
              occupancy: Math.round((teachHoursPerWeek / (realAvailWeeklyH || workHoursPerWeek || 1)) * 100),
            },
            {
              name: tr("auditUi.recommended"),
              rate: recHourlyRate,
              mrr: grossNeeded,
              hours: monthlyBillableHours,
              students: Math.round(monthlyBillableHours / weeksPerMonth),
              occupancy: Math.round((teachHoursPerWeek / (realAvailWeeklyH || workHoursPerWeek || 1)) * 100),
            },
          ];

          return (
            <div className="mt-6 rounded-xl border border-border bg-card p-5 md:p-6 shadow-sm space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {tr("auditUi.pricingScenariosComparison")}
              </h4>
              <div className="grid gap-4 sm:grid-cols-3 items-stretch">
                {scenarios.map((sc, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-border/80 bg-secondary/10 space-y-2 flex flex-col justify-between h-full"
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wide text-primary block">
                      {sc.name}
                    </span>
                    <div className="font-display text-lg font-extrabold text-foreground">
                      {currency} {sc.rate}/h
                    </div>
                    <div className="text-[11px] font-semibold text-muted-foreground space-y-1">
                      <p>
                        MRR:{" "}
                        <span className="text-foreground">
                          {currency} {sc.mrr.toLocaleString()}
                        </span>
                      </p>
                      <p>
                        {tr("auditUi.hoursMonth")}:{" "}
                        <span className="text-foreground">{sc.hours}h</span>
                      </p>
                      <p>
                        {tr("auditUi.estStudents")}:{" "}
                        <span className="text-foreground">{sc.students}</span>
                      </p>
                      <p>
                        {tr("auditUi.occupancy")}:{" "}
                        <span className="text-foreground">{sc.occupancy}%</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </section>

        {/* GROWTH OPPORTUNITIES SECTION */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] h-full flex flex-col">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-lilac" />
            <h3 className="font-display text-lg font-bold text-foreground">
              {t.opportunitiesTitle}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t.opportunitiesSubtitle}</p>

          {growthInsights.isLoading ? (
            <div className="mt-5 flex-1 space-y-3" role="status" aria-label={t.opportunitiesTitle}>
              <Skeleton className="h-16 rounded-xl bg-secondary/60" />
              <Skeleton className="h-16 rounded-xl bg-secondary/60" />
            </div>
          ) : !growthInsights.allowed ? (
            <PremiumCardLock onLearnMore={() => setIsPremiumDialogOpen(true)} />
          ) : opportunities.length > 0 ? (
            <ul className="mt-5 flex-1 space-y-3">
              {opportunities.map((op) => (
                <OpportunityCard key={op.family} op={op} lang={lang} tr={tr} formatWeekday={formatWeekday} />
              ))}
            </ul>
          ) : (
            <div className="mt-5 flex-1 grid place-items-center rounded-xl border border-dashed border-border/70 bg-secondary/30 p-6 text-center">
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">{t.opportunitiesEmpty}</p>
            </div>
          )}
        </div>

      {/* SALES FUNNEL CARD */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <h3 className="font-display text-lg font-bold text-foreground">{t.funnelTitle}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t.funnelSubtitle}</p>
        <p className="mt-2 text-xs text-muted-foreground">{t.funnelEmpty}</p>

        {/* Funnel Layout */}
        <div className="mt-6 flex flex-col items-center justify-center gap-4 max-w-xl mx-auto">
          {/* Stage 1 */}
          <div className="w-full flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl p-3.5 relative">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary hover:bg-primary">—</Badge>
              <span className="text-sm font-bold text-foreground">
                {tr("auditUi.leads")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold"></span>
          </div>

          <div className="flex flex-col items-center gap-1 -my-2 text-primary font-bold text-xs">
            <span>↓</span>
            <span className="bg-secondary/85 px-2 py-0.5 rounded border border-border/50 text-[10px]"> {tr("auditUi.conv")}: —
            </span>
          </div>

          {/* Stage 2 */}
          <div className="w-5/6 flex items-center justify-between bg-primary/15 border border-primary/25 rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary hover:bg-primary">—</Badge>
              <span className="text-sm font-bold text-foreground">
                {tr("auditUi.contacted")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold"></span>
          </div>

          <div className="flex flex-col items-center gap-1 -my-2 text-primary font-bold text-xs">
            <span>↓</span>
            <span className="bg-secondary/85 px-2 py-0.5 rounded border border-border/50 text-[10px]"> {tr("auditUi.conv")}: —
            </span>
          </div>

          {/* Stage 3 */}
          <div className="w-4/6 flex items-center justify-between bg-primary/20 border border-primary/30 rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary hover:bg-primary">—</Badge>
              <span className="text-sm font-bold text-foreground">
                {tr("auditUi.trial")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold"></span>
          </div>

          <div className="flex flex-col items-center gap-1 -my-2 text-primary font-bold text-xs">
            <span>↓</span>
            <span className="bg-secondary/85 px-2 py-0.5 rounded border border-border/50 text-[10px]"> {tr("auditUi.conv")}: —
            </span>
          </div>

          {/* Stage 4 */}
          <div className="w-3/6 flex items-center justify-between bg-gradient-primary rounded-xl p-3.5 text-primary-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold">—</Badge>
              <span className="text-sm font-bold">
                {tr("auditUi.activeStudents")}
              </span>
            </div>
            <span className="text-xs font-bold"></span>
          </div>
        </div>
      </section>

      {/* EDIT MONTHLY GOAL DIALOG */}
      <Dialog open={isEditGoalOpen} onOpenChange={setIsEditGoalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              {tr("auditUi.editMonthlyGoal")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveGoalSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="monthly-goal-input" className="text-xs font-semibold text-foreground">
                {tr("auditUi.monthlyRevenueTargetR")}
              </Label>
              <Input
                id="monthly-goal-input"
                type="text"
                placeholder="e.g. 10000"
                value={editGoalInputValue}
                onChange={(e) => setEditGoalInputValue(e.target.value)}
                className="h-10 rounded-xl"
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">
                {tr("auditUi.setYourTargetGrossMonthlyRevenueIn")}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditGoalOpen(false)}
                className="rounded-xl"
              >
                {tr("auditUi.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSavingGoal}
                className="rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                {isSavingGoal ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {tr("auditUi.saveGoal")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* PREMIUM BENEFITS PRESENTATION (no checkout in this stage) */}
      <PremiumBenefitsDialog open={isPremiumDialogOpen} onOpenChange={setIsPremiumDialogOpen} />

      {/* CENTRAL AVAILABILITY MODAL */}
      {user && (
        <CentralAvailabilityModal
          isOpen={isAvailabilityModalOpen}
          onClose={() => setIsAvailabilityModalOpen(false)}
          teacherId={user.id}
          initialTab="rest_blocks"
          onSaved={() => {
            loadGrowthData();
          }}
        />
      )}
    </div>
  );
}

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in values ? String(values[k]) : m));
}

function OpportunityCard({ op, lang, tr, formatWeekday }: {
  op: GrowthOpportunity;
  lang: string;
  tr: (key: string) => string;
  formatWeekday: (day: string | undefined | null, short?: boolean) => string;
}) {
  const { money } = useFinancialPrivacy();
  const formatBRL = (v: number) => money(rawFormatBRL(v));
  const k = (s: string) => tr(`growthOpportunities.${s}`);
  const hours = (n: number) => n.toLocaleString(lang === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 1 });
  let body = "";
  let action = "";
  if (op.family === "pricing") {
    body = fill(k(`body_pricing_${op.tone}`), { occ: op.occupancyPct, goal: formatBRL(op.goal), perHour: formatBRL(op.increasePerHour), pct: op.increasePct });
    action = k("action_pricing");
  } else if (op.family === "capacity") {
    body = fill(k(`body_capacity_${op.mode}`), { occ: op.occupancyPct, free: hours(op.freeWeeklyHours), hours: hours(op.hoursNeeded), potential: formatBRL(op.potentialRevenue), goal: formatBRL(op.goal) });
    action = k("action_capacity");
  } else if (op.family === "goal") {
    body = fill(k(`body_goal_${op.trigger}`), { progress: op.progressPct, goal: formatBRL(op.goal), occ: op.occupancyPct });
    action = fill(k("action_goal"), { suggested: formatBRL(op.suggestedGoal) });
  } else {
    const labels = op.slots.map((s) => fill(k("slot"), { day: formatWeekday(s.weekday), time: s.startTime }));
    const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} ${k("and")} ${labels[labels.length - 1]}` : labels[0];
    body = fill(k("body_efficiency"), { count: op.slots.length, pct: op.avgBelowPct, ref: formatBRL(op.referencePerHour), slots: list });
    action = k(op.hasGroupSlot ? "action_efficiency_group" : "action_efficiency_individual");
  }
  return (
    <li className="rounded-xl border border-border/70 bg-secondary/30 p-4">
      <p className="font-display text-sm font-bold text-foreground">{k(`title_${op.family}`)}</p>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{body}</p>
      <p className="mt-2 text-xs font-medium text-foreground leading-relaxed">{action}</p>
    </li>
  );
}

import { reportUserError, toUserMessage } from "@/lib/user-error";
import { t as i18nT } from "@/lib/i18n";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { getCalendarEvents } from "@/lib/calendar-sync";
import { getTeacherAvailability, WorkingAvailability } from "@/lib/teacher-availability";
import {
  fetchMonthlyGoal,
  saveMonthlyGoal,
  fetchCurrentMRR,
  computeGrowthMetrics,
  formatBRL,
  parseBRL,
  MRRResult,
  fetchTeacherExpenses,
  fetchEffectiveHourlyRate,
  EffectiveHourlyResult,
} from "@/lib/growth-engine";
import { calculateRealCapacity, RealCapacityResult } from "@/lib/capacity-engine";
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
  Sparkles,
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
import { PageHeader } from "@/components/bloom/PageHeader";
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
import { StatCard } from "@/components/bloom/StatCard";
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
    capacitySubtitle: "occupied slots",
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
    potentialTitle: "Revenue Potential",
    potentialSubtitle: "If all available slots were filled at your current average rate.",
    currentRev: "Current Revenue",
    maxRev: "Maximum Potential",
    potentialGrowth: "Potential Growth",
    month: "month",
    opportunitiesTitle: "Growth Opportunities",
    opportunitiesSubtitle: "AI-generated recommendations to expand your teaching business.",
    funnelTitle: "Sales Funnel & Conversions",
    funnelSubtitle: "Track prospects from inquiries to active students.",
    metricsTitle: "Growth Performance Metrics",
    metricNewStudents: "New Students This Month",
    metricRetention: "Student Retention",
    metricRenewal: "Renewal Rate",
    metricAvgPackage: "Average Package Value",
    metricAvgRevenue: "Avg Revenue per Student",
    metricGrowthRate: "Monthly Growth Rate",
    opportunity1: "Tuesday still has 3 available lesson slots.",
    opportunity2: "Two student contracts are expiring this month.",
    opportunity3: "Four new leads haven't received a reply yet.",
    opportunity4: "Friday evenings currently have your highest availability.",
    opportunity5: "Business English is currently your highest revenue course.",
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
    capacitySubtitle: "horários ocupados",
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
    potentialTitle: "Potencial de Receita",
    potentialSubtitle: "Se todos os horários fossem preenchidos com o seu ticket médio atual.",
    currentRev: "Receita Atual",
    maxRev: "Potencial Máximo",
    potentialGrowth: "Crescimento Potencial",
    month: "mês",
    opportunitiesTitle: "Oportunidades de Crescimento",
    opportunitiesSubtitle: "Recomendações automáticas baseadas em inteligência para expandir.",
    funnelTitle: "Funil de Vendas & Conversões",
    funnelSubtitle: "Acompanhe interessados desde o contato até a matrícula ativa.",
    metricsTitle: "Métricas de Crescimento",
    metricNewStudents: "Novos Alunos Este Mês",
    metricRetention: "Retenção de Alunos",
    metricRenewal: "Taxa de Renovação",
    metricAvgPackage: "Valor Médio do Pacote",
    metricAvgRevenue: "Receita Média por Aluno",
    metricGrowthRate: "Taxa de Crescimento Mensal",
    opportunity1: "Terça-feira ainda tem 3 horários livres para aulas.",
    opportunity2: "Dois contratos de alunos expiram este mês.",
    opportunity3: "Quatro novos leads ainda não receberam resposta.",
    opportunity4: "Sexta à noite é o período com maior disponibilidade.",
    opportunity5: "Business English é o seu curso com maior faturamento atualmente.",
  },
};

function GrowthPage() {
  const { lang, t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Growth Goal & Real Data States
  const [loadingGrowth, setLoadingGrowth] = useState(true);
  const queryClient = useQueryClient();
  const [monthlyGoal, setMonthlyGoal] = useState<number | null>(null);
  const [mrrData, setMrrData] = useState<MRRResult>({
    totalMRR: 0,
    contributingStudentRevenues: [],
    activeStudentCount: 0,
    hasBillingData: false,
  });
  const [capacityData, setCapacityData] = useState<RealCapacityResult>({
    hasWorkingHours: false,
    totalValidSlots: 0,
    totalOccupiedSlots: 0,
    totalRemainingSlots: 0,
    occupancyPct: 0,
    slotDurationMinutes: 60,
    days: [],
  });
  const [effectiveHourlyData, setEffectiveHourlyData] = useState<EffectiveHourlyResult>({
    effectiveHourlyRate: 0,
    totalMRR: 0,
    activeStudentCount: 0,
    billableHoursPerMonth: 0,
    hasEnoughData: false,
  });
  const [realExpenses, setRealExpenses] = useState<number>(0);
  const [isManualExpenses, setIsManualExpenses] = useState<boolean>(true);

  const [isEditGoalOpen, setIsEditGoalOpen] = useState(false);
  const [editGoalInputValue, setEditGoalInputValue] = useState("");
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);

  const [availability, setAvailability] = useState<WorkingAvailability[]>([]);
  const [occupiedCount, setOccupiedCount] = useState(32);
  const [totalCapacity, setTotalCapacity] = useState(40);
  const [weekdayAvailabilities, setWeekdayAvailabilities] = useState<Record<string, number>>({
    Monday: 0,
    Tuesday: 2,
    Wednesday: 1,
    Thursday: 3,
    Friday: 0,
    Saturday: 2,
    Sunday: 0,
  });

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
  const [currentAvgPackageValue, setCurrentAvgPackageValue] = useState(0);
  const [currentStudentsCount, setCurrentStudentsCount] = useState(0);
  const [availableWeeklySlots, setAvailableWeeklySlots] = useState(0);
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
      const [goalRes, mrrRes, capacityRes, expRes, hourlyRes, metricsRes] = await Promise.all([
        fetchMonthlyGoal(user!.id),
        fetchCurrentMRR(user!.id),
        calculateRealCapacity(user!.id),
        fetchTeacherExpenses(user!.id),
        fetchEffectiveHourlyRate(user!.id),
        fetchGrowthMetrics(user!.id),
      ]);
      return { goalRes, mrrRes, capacityRes, expRes, hourlyRes, metricsRes };
    },
  });

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

    if (capacityRes.hasWorkingHours) {
      setWorkHoursPerWeek(capacityRes.totalValidSlots);
      setTeachHoursPerWeek(capacityRes.totalOccupiedSlots || Math.min(20, capacityRes.totalValidSlots));
      setAvailableWeeklySlots(capacityRes.totalValidSlots);
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
        t("auditUi.pleaseEnterAValidGoalGreaterThan")
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
        t("auditUi.monthlyGoalSavedSuccessfully")
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

    // Calculate total capacity
    let totalSlots = 0;
    const daySlotCapacities: Record<string, number> = {};
    availList.forEach((dayAvail) => {
      if (dayAvail.enabled) {
        const [startH, startM] = dayAvail.startTime.split(":").map(Number);
        const [endH, endM] = dayAvail.endTime.split(":").map(Number);
        const hours = endH - startH + (endM - startM) / 60;
        const slots = Math.max(0, Math.floor(hours));
        totalSlots += slots;
        daySlotCapacities[dayAvail.day] = slots;
      } else {
        daySlotCapacities[dayAvail.day] = 0;
      }
    });
    setTotalCapacity(totalSlots);
    setAvailableWeeklySlots(totalSlots);

    // Get current week's events
    const allEvents = getCalendarEvents();

    // Find current week's dates (Mon - Sun)
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sun, 1 = Mon, etc.
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)); // align to Monday

    const weekDates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dayVal = String(d.getDate()).padStart(2, "0");
      weekDates.push(`${y}-${m}-${dayVal}`);
    }

    const thisWeekEvents = allEvents.filter(
      (evt) => weekDates.includes(evt.date) && evt.status !== "Closed",
    );

    const occupiedByDay: Record<string, number> = {
      Monday: 0,
      Tuesday: 0,
      Wednesday: 0,
      Thursday: 0,
      Friday: 0,
      Saturday: 0,
      Sunday: 0,
    };

    thisWeekEvents.forEach((evt) => {
      const dateObj = new Date(evt.date + "T00:00:00");
      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" });
      if (dayName in occupiedByDay) {
        occupiedByDay[dayName]++;
      }
    });

    let occupiedSlotsTotal = 0;
    const weekdayAvails: Record<string, number> = {};
    availList.forEach((dayAvail) => {
      const cap = daySlotCapacities[dayAvail.day] || 0;
      const occupied = occupiedByDay[dayAvail.day] || 0;
      occupiedSlotsTotal += occupied;
      weekdayAvails[dayAvail.day] = Math.max(0, cap - occupied);
    });

    setOccupiedCount(occupiedSlotsTotal);
    setWeekdayAvailabilities(weekdayAvails);

    // Load dynamic students stats
    const studentsStored = localStorage.getItem("bloom.students.list");
    const packagesStored = localStorage.getItem("bloom.packages.list");
    let parsedStudents = [];
    let parsedPackages = [];
    if (studentsStored) {
      try {
        parsedStudents = JSON.parse(studentsStored);
      } catch (e) {}
    }
    if (packagesStored) {
      try {
        parsedPackages = JSON.parse(packagesStored);
      } catch (e) {}
    }

    if (parsedStudents.length > 0) {
      const activeStds = parsedStudents.filter(
        (s: any) => s.status === "Active" || s.status === "Trial",
      );
      setCurrentStudentsCount(activeStds.length);

      let mrr = 0;
      let ratesSum = 0;
      let rateCount = 0;

      activeStds.forEach((s: any) => {
        const pkg = parsedPackages.find((p: any) => p.id === s.packageId);
        if (pkg) {
          mrr += pkg.price;
          const durationHrs = (s.scheduleDetails?.duration || 60) / 60;
          const lessonsPerMonth = 4; // standard monthly frequency
          const lessonHour = lessonsPerMonth * durationHrs;
          if (lessonHour > 0) {
            ratesSum += pkg.price / lessonHour;
            rateCount++;
          }
        }
      });

      if (mrr > 0) {
        setCurrentMRR(mrr);
      }
      if (rateCount > 0) {
        setCurrentAvgHourlyRate(Math.round(ratesSum / rateCount));
      }

      if (parsedPackages.length > 0) {
        const avgPkg =
          parsedPackages.reduce((sum: number, p: any) => sum + p.price, 0) / parsedPackages.length;
        setCurrentAvgPackageValue(Math.round(avgPkg));
      }
    }

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
      t("auditUi.pricingGoalSuccessfullySaved"),
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

  // Real Growth Metrics calculations
  const metrics = computeGrowthMetrics(monthlyGoal || 0, mrrData);
  // Real-metric formatters — never fabricate values; show em dash when data is missing
  const NO_DATA = "—";
  const metricCount = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : String(v);
  const metricPercent = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : `${v}%`;
  const metricSignedPercent = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : `${v > 0 ? "+" : ""}${v}%`;
  const metricMoney = (v: number | null) =>
    loadingMetrics || v === null ? NO_DATA : formatBRL(v);
  const metricTrend = (change: number | null) =>
    !loadingMetrics && change !== null
      ? { value: `${change > 0 ? "+" : ""}${change}%`, positive: change >= 0 }
      : undefined;

  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const ringProgress = Math.min(100, metrics.progressPct);
  const strokeDashoffset = circumference - (ringProgress / 100) * circumference;

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <PageHeader title={t.title} description={t.description} />

      {/* Meta Mensal & Capacidade Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* MONTHLY GOAL CARD */}
        {loadingGrowth ? (
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] animate-pulse">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary opacity-50" />
              <div className="h-5 w-32 bg-secondary rounded" />
            </div>
            <div className="my-8 flex items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          </div>
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
                  {t("auditUi.setYourMonthlyGoal")}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("auditUi.addYourMonthlyTargetToTrackRevenue")}
                </p>
              </div>
              <Button
                onClick={handleOpenEditGoal}
                className="mt-1 rounded-xl bg-primary text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/95"
              >
                <PlusCircle className="mr-1.5 h-4 w-4" />
                {t("auditUi.setGoal")}
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
                <span>{t("auditUi.editGoal")}</span>
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
                    {t("auditUi.goal")}
                  </span>
                </div>
              </div>

              {/* Goal Text Values */}
              <div className="text-center sm:text-left space-y-2 flex-1">
                <div className="text-2xl font-extrabold text-foreground flex items-baseline justify-center sm:justify-start gap-1 flex-wrap">
                  <button
                    onClick={() => navigate({ to: "/finance" })}
                    className="hover:text-primary transition-colors cursor-pointer text-left"
                    title={t("auditUi.clickToViewDetailedRevenueInFinance")}
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
                      <span>{t("auditUi.goalReached")}</span>
                    </p>
                    {metrics.overage > 0 && (
                      <p className="text-[11px] font-semibold text-muted-foreground">
                        {formatBRL(metrics.overage)} {t("auditUi.aboveTarget")}
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
                            {metrics.studentGap} {metrics.studentGap === 1 ? (t("auditUi.student")) : (t("auditUi.students"))}
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
                              {t("auditUi.toReachYourGoalWithNewStudents")}
                            </p>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="font-medium opacity-90 text-[11px]">
                        {t("auditUi.addYourActiveStudentsAndPackageContracts")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TEACHING CAPACITY CARD */}
        {!capacityData.hasWorkingHours ? (
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
                  {t("auditUi.configureYourAvailabilityToCalculateYourTeaching")}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("auditUi.setYourWeeklyWorkingDaysAndHours")}
                </p>
              </div>
              <Button
                onClick={() => setIsAvailabilityModalOpen(true)}
                className="mt-1 rounded-xl bg-accent text-xs font-bold text-accent-foreground shadow-sm hover:bg-accent/90 cursor-pointer"
              >
                <Clock className="mr-1.5 h-4 w-4" />
                {t("auditUi.configureAvailability")}
              </Button>
            </div>
          </div>
        ) : (
          /* REAL CAPACITY CARD */
          <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-accent" />
                <h3 className="font-display text-lg font-bold text-foreground">{t.capacityTitle}</h3>
              </div>
              <button
                onClick={() => setIsAvailabilityModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 cursor-pointer"
              >
                <span>{t("auditUi.configureAvailability")}</span>
                <ArrowRight className="h-3 w-3" />
              </button>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-3xl font-extrabold text-foreground">
                {capacityData.totalOccupiedSlots} / {capacityData.totalValidSlots}
              </span>
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
                {t.capacitySubtitle} ({capacityData.occupancyPct}%{" "}
                {t("auditUi.occupied")})
              </span>
            </div>

            <div className="mt-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              {capacityData.totalRemainingSlots} {t("auditUi.slotsAvailable")}
            </div>

            {/* Slots Availability Breakdown for working days only */}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold text-foreground/80">{t.capacityBreakdown}:</p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                {capacityData.days
                  .filter((day) => day.enabled)
                  .map((day) => (
                    <div
                      key={day.day}
                      className={`rounded-lg p-2 border ${
                        day.remainingSlots === 0
                          ? "bg-secondary/40 border-border/40"
                          : "bg-accent-soft/40 border-accent/10"
                      }`}
                    >
                      <span className="block font-semibold text-foreground/70">{day.dayLabelPt}</span>
                      <span
                        className={`text-[10px] font-bold ${
                          day.remainingSlots === 0 ? "text-success uppercase" : "text-accent"
                        }`}
                      >
                        {day.remainingSlots === 0
                          ? t.full
                          : `${day.remainingSlots} ${t.available}`}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* METRICS DASHBOARD SECTION — 100% real, teacher-scoped data */}
      <section className="space-y-4">
        <h3 className="font-display text-lg font-bold text-foreground">{t.metricsTitle}</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            label={t.metricNewStudents}
            value={metricCount(growthMetrics.newStudentsThisMonth.value)}
            icon={Users}
            tone="primary"
            trend={metricTrend(growthMetrics.newStudentsThisMonth.change)}
          />
          <StatCard
            label={t.metricRetention}
            value={metricPercent(growthMetrics.retentionRate.value)}
            icon={Percent}
            tone="lilac"
            trend={metricTrend(growthMetrics.retentionRate.change)}
          />
          <StatCard
            label={t.metricRenewal}
            value={metricPercent(growthMetrics.renewalRate.value)}
            icon={Target}
            tone="accent"
            trend={metricTrend(growthMetrics.renewalRate.change)}
          />
          <StatCard
            label={t.metricAvgPackage}
            value={metricMoney(growthMetrics.avgPackageValue.value)}
            icon={Briefcase}
            tone="warning"
            trend={metricTrend(growthMetrics.avgPackageValue.change)}
          />
          <StatCard
            label={t.metricAvgRevenue}
            value={metricMoney(growthMetrics.avgRevenuePerStudent.value)}
            icon={DollarSign}
            tone="primary"
            trend={metricTrend(growthMetrics.avgRevenuePerStudent.change)}
          />
          <StatCard
            label={t.metricGrowthRate}
            value={metricSignedPercent(growthMetrics.monthlyGrowthRate.value)}
            icon={TrendingUp}
            tone="accent"
            trend={metricTrend(growthMetrics.monthlyGrowthRate.change)}
          />
        </div>
      </section>

      {/* HOURLY RATE SIMULATOR SECTION */}
      <section className="rounded-2xl border border-border bg-card p-6 md:p-8 shadow-[var(--shadow-sm)]">
        <div className="mb-6">
          <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
            {t("auditUi.hourlyRateSimulator")}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("auditUi.discoverHowMuchToChargePerTeaching")}
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
                  {t("auditUi.desiredNetIncome")}
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
                  {t("auditUi.currency")}
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
            <div className="grid grid-cols-3 gap-4 items-start">
              <div className="space-y-1.5">
                <Label
                  htmlFor="sim-workhrs"
                  className="text-[11px] font-semibold text-foreground block"
                >
                  {t("auditUi.totalWorkHoursWeek")}
                  <span className="text-[9px] text-muted-foreground block leading-tight mt-0.5">
                    ({t("auditUi.desiredTotalWorkload")})
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
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="sim-teachhrs"
                  className="text-[11px] font-semibold text-foreground block"
                >
                  {t("auditUi.hoursReservedForLessonsWeek")}
                  <span className="text-[9px] text-muted-foreground block leading-tight mt-0.5">
                    ({t("auditUi.paidTeachingSlots")})
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
                        t("auditUi.teachingHoursCannotExceedTotalWorkHours")
                      );
                      setTeachHoursPerWeek(workHoursPerWeek);
                    } else {
                      setTeachHoursPerWeek(val);
                    }
                  }}
                  className="h-10 rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="sim-weeks"
                  className="text-[11px] font-semibold text-foreground flex items-center justify-between"
                >
                  <span>{t("auditUi.averageWeeksMonth")}</span>
                  <span
                    className="cursor-help text-muted-foreground hover:text-foreground"
                    title={
                      t("auditUi.weUseAnAnnualAverage52Weeks")
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
                  className="h-10 rounded-xl"
                />
                <span className="text-[9px] text-muted-foreground block leading-none">
                  ({t("auditUi.annualAvg433")})
                </span>
              </div>
            </div>

            {/* Visual Workload Split & Slider */}
            <div className="space-y-2 p-4 rounded-xl bg-secondary/35 border border-border/50">
              <div className="flex justify-between items-center text-xs font-semibold text-foreground">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground/90">
                  {t("auditUi.workloadSplitForLessons")}
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
                  💡 {Math.max(0, workHoursPerWeek - teachHoursPerWeek)}h {t("auditUi.weeklyHoursRemainAvailableForPreparationAdmin")}
                </p>
                {Math.round((teachHoursPerWeek / (workHoursPerWeek || 1)) * 100) > 75 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-1">
                    ⚠️ {t("auditUi.youAllocatedOver75OfYourWorkload")}
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
                  {t("auditUi.advancedSettingsCostsMargins")}
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
                        {t("auditUi.monthlyBusinessExpenses")}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground">
                        {isManualExpenses
                          ? (t("auditUi.manualEstimate"))
                          : (t("auditUi.realFinanceData"))}
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
                        {t("auditUi.taxPaymentFees")}
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
                        {t("auditUi.safetyMargin")}
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
                {t("auditUi.currentBusinessData")}
              </h5>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-semibold text-foreground/80">
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {t("auditUi.activeStudents")}
                  </span>
                  <span>{currentStudentsCount}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {t("auditUi.currentMrr")}
                  </span>
                  <span>
                    {currentMRR > 0 ? formatBRL(currentMRR) : (t("auditUi.0"))}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {t("auditUi.avgHourlyRate")}
                  </span>
                  <span>
                    {currentAvgHourlyRate > 0
                      ? `${currency} ${currentAvgHourlyRate}/h`
                      : (t("auditUi.noData"))}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[9px] uppercase font-bold">
                    {t("auditUi.agendaOccupied")}
                  </span>
                  <span>{capacityData.occupancyPct}%</span>
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
                    toast.error(t("auditUi.pleaseEnterAValidGoal"));
                    return;
                  }
                  setIsSavingGoal(true);
                  const res = await saveMonthlyGoal(user.id, incomeGoal);
                  setIsSavingGoal(false);
                  if (res.success) {
                    setMonthlyGoal(incomeGoal);
                    toast.success(
                      t("auditUi.savedAsYourOfficialMonthlyGoal")
                    );
                  } else {
                    toast.error(toUserMessage(res.error, i18nT("errors.saveGoal", lang)));
                  }
                }}
                disabled={isSavingGoal}
                className="flex-1 inline-flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingGoal ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {t("auditUi.saveAsMyPricingGoal")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIncomeGoal(monthlyGoal ?? 0);

                  if (capacityData.hasWorkingHours) {
                    setWorkHoursPerWeek(capacityData.totalValidSlots);
                    setTeachHoursPerWeek(capacityData.totalOccupiedSlots || Math.min(20, capacityData.totalValidSlots));
                  } else {
                    setWorkHoursPerWeek(40);
                    setTeachHoursPerWeek(20);
                  }

                  setWeeksPerMonth(4.33);
                  setExpenses(realExpenses);
                  setTaxPercent(15);
                  setSafetyMarginPercent(10);
                  toast.info(t("auditUi.simulatorResetToRealData"));
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-secondary cursor-pointer transition-all"
              >
                {t("auditUi.reset")}
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
              const recHourlyRate = Math.round(grossNeeded / (monthlyBillableHours || 1));
              const adjustmentDiff = currentAvgHourlyRate > 0 ? recHourlyRate - currentAvgHourlyRate : 0;
              
              // Calendar Feasibility Check: Compare reserved lesson hours against real calendar capacity
              const realCalendarSlots = capacityData.hasWorkingHours
                ? capacityData.totalValidSlots
                : workHoursPerWeek;
              const isOverCalendarCapacity = teachHoursPerWeek > realCalendarSlots;
              const occupiedVersusReservedPct = Math.round(
                (capacityData.totalOccupiedSlots / (teachHoursPerWeek || 1)) * 100,
              );

              // Projections
              const weeklyVIPsNeeded = Math.round(monthlyBillableHours / (weeksPerMonth || 1));
              const groupsNeeded = Math.ceil(weeklyVIPsNeeded / 5);

              return (
                <div className="flex flex-col gap-5">
                  {/* Recommended rate badge */}
                  <div className="text-center py-4 border-b border-lilac-foreground/20 space-y-1">
                    <span className="text-[10px] uppercase font-extrabold tracking-widest opacity-80 block">
                      {t("auditUi.recommendedHourlyRate")}
                    </span>
                    <h3 className="font-display text-4xl font-extrabold text-white">
                      {currency} {recHourlyRate}{" "}
                      <span className="text-sm font-semibold opacity-90">
                        /{t("auditUi.hour")}
                      </span>
                    </h3>
                    <p className="text-[11px] opacity-80 pt-1">
                      {lang === "pt"
                        ? `Com ${teachHoursPerWeek}h reservadas para aulas por semana e sua estrutura atual de custos.`
                        : `With ${teachHoursPerWeek} weekly reserved lesson hours and current cost structure.`}
                    </p>
                  </div>

                  {/* Calculations Details grid */}
                  <div className="grid grid-cols-2 gap-4 text-xs font-semibold">
                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 flex items-center gap-1">
                        <span>{t("auditUi.minSustainableRate")}</span>
                        <span
                          className="cursor-help opacity-70 hover:opacity-100"
                          title={
                            t("auditUi.theLowestHourlyRateThatCoversOperating")
                          }
                        >
                          <Info className="h-3 w-3 inline-block" />
                        </span>
                      </span>
                      <span className="text-sm font-bold text-white">
                        {currency} {minHourlyRate}/h
                      </span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">
                        {t("auditUi.requiredGrossRevenue")}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {currency} {grossNeeded.toLocaleString()}/{t.month}
                      </span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">
                        {t("auditUi.billableHoursMonth")}
                      </span>
                      <span className="text-sm font-bold text-white">{monthlyBillableHours}h</span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 flex items-center gap-1">
                        <span>{t("auditUi.reservedCapacityOccupancy")}</span>
                        <span
                          className="cursor-help opacity-70 hover:opacity-100"
                          title={
                            t("auditUi.percentageOfYourReservedLessonHoursCurrently")
                          }
                        >
                          <Info className="h-3 w-3 inline-block" />
                        </span>
                      </span>
                      <span className="text-sm font-bold text-white">
                        {capacityData.totalOccupiedSlots}h / {teachHoursPerWeek}h ({occupiedVersusReservedPct}%)
                      </span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">
                        {t("auditUi.currentRate")}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {currentAvgHourlyRate > 0 ? `${currency} ${currentAvgHourlyRate}/h` : "—"}
                      </span>
                    </div>

                    <div className="space-y-0.5 border-b border-lilac-foreground/10 pb-2">
                      <span className="opacity-80 block">
                        {t("auditUi.requiredDifference")}
                      </span>
                      <span className="text-sm font-bold text-white">
                        {currentAvgHourlyRate > 0
                          ? `${adjustmentDiff >= 0 ? "+" : ""}${currency} ${adjustmentDiff}/h`
                          : "—"}
                      </span>
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
                            {t("auditUi.calendarAvailabilityAlert")}
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
                            <span>{t("auditUi.reviewAvailability")}</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4.5 w-4.5 shrink-0 text-emerald-300" />
                        <div>
                          <p className="font-bold text-emerald-200">
                            {t("auditUi.goalFitsCalendarAvailability")}
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
                      {t("auditUi.studentProjections")}
                    </h5>
                    <p className="text-[11px] leading-snug opacity-95">
                      {t("auditUi.toReachThisGoalYouWouldNeed")}
                    </p>
                    <ul className="text-xs list-disc list-inside space-y-1 font-medium pl-1">
                      <li>
                        {lang === "pt"
                          ? `${weeklyVIPsNeeded} alunos VIP semanais no valor hora recomendado de ${currency} ${recHourlyRate}`
                          : `${weeklyVIPsNeeded} weekly VIP students at the recommended rate of ${currency} ${recHourlyRate}`}
                      </li>
                      <li className="list-none italic opacity-70 text-[10px] pl-3">
                        — {t("auditUi.or")} —
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
              name: t("auditUi.currentPricing"),
              rate: currentAvgHourlyRate,
              mrr: currentMRR,
              hours: Math.round(currentMRR / (currentAvgHourlyRate || 1)),
              students: currentStudentsCount,
              occupancy: Math.round(
                (currentMRR /
                  (currentAvgHourlyRate || 1) /
                  (weeksPerMonth || 1) /
                  (availableWeeklySlots || 1)) *
                  100,
              ),
            },
            {
              name: t("auditUi.minSustainable"),
              rate: minHourlyRate,
              mrr: incomeGoal + expenses,
              hours: monthlyBillableHours,
              students: Math.round(monthlyBillableHours / weeksPerMonth),
              occupancy: Math.round((teachHoursPerWeek / (availableWeeklySlots || 1)) * 100),
            },
            {
              name: t("auditUi.recommended"),
              rate: recHourlyRate,
              mrr: grossNeeded,
              hours: monthlyBillableHours,
              students: Math.round(monthlyBillableHours / weeksPerMonth),
              occupancy: Math.round((teachHoursPerWeek / (availableWeeklySlots || 1)) * 100),
            },
          ];

          return (
            <div className="mt-6 rounded-xl border border-border bg-card p-5 md:p-6 shadow-sm space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                {t("auditUi.pricingScenariosComparison")}
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
                        {t("auditUi.hoursMonth")}:{" "}
                        <span className="text-foreground">{sc.hours}h</span>
                      </p>
                      <p>
                        {t("auditUi.estStudents")}:{" "}
                        <span className="text-foreground">{sc.students}</span>
                      </p>
                      <p>
                        {t("auditUi.occupancy")}:{" "}
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

      {/* REVENUE POTENTIAL & AI INSIGHTS OPPORTUNITIES */}
      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr] items-stretch">
        {/* REVENUE POTENTIAL CARD */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500 fill-amber-500" />
              <h3 className="font-display text-lg font-bold text-foreground">{t.potentialTitle}</h3>
            </div>
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
              {t.potentialSubtitle}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-semibold text-muted-foreground">{t.currentRev}</span>
              <span className="font-display font-bold text-foreground">{formatBRL(mrrData.totalMRR)}</span>
            </div>

            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-semibold text-muted-foreground">{t.maxRev}</span>
              <span className="font-display font-extrabold text-foreground">{formatBRL(Math.max(mrrData.totalMRR, 11250))}</span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-primary">{t.potentialGrowth}</span>
              <Badge className="bg-primary text-primary-foreground font-display font-extrabold text-sm py-0.5">
                +{formatBRL(Math.max(0, 11250 - mrrData.totalMRR))}/{t.month}
              </Badge>
            </div>
          </div>
        </div>

        {/* GROWTH OPPORTUNITIES SECTION */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] h-full flex flex-col">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-lilac" />
            <h3 className="font-display text-lg font-bold text-foreground">
              {t.opportunitiesTitle}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t.opportunitiesSubtitle}</p>

          <ul className="mt-5 space-y-3">
            {[t.opportunity1, t.opportunity2, t.opportunity3, t.opportunity4, t.opportunity5].map(
              (opp, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 rounded-xl bg-secondary/40 p-3 border border-border/60 hover:bg-secondary/70 transition-colors"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary font-bold text-xs">
                    {idx + 1}
                  </span>
                  <span className="text-xs font-medium text-foreground leading-relaxed">{opp}</span>
                </li>
              ),
            )}
          </ul>
        </div>
      </div>

      {/* SALES FUNNEL CARD */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)]">
        <h3 className="font-display text-lg font-bold text-foreground">{t.funnelTitle}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t.funnelSubtitle}</p>

        {/* Funnel Layout */}
        <div className="mt-6 flex flex-col items-center justify-center gap-4 max-w-xl mx-auto">
          {/* Stage 1 */}
          <div className="w-full flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl p-3.5 relative">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary hover:bg-primary">5</Badge>
              <span className="text-sm font-bold text-foreground">
                {t("auditUi.leads")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold">100%</span>
          </div>

          <div className="flex flex-col items-center gap-1 -my-2 text-primary font-bold text-xs">
            <span>↓</span>
            <span className="bg-secondary/85 px-2 py-0.5 rounded border border-border/50 text-[10px]">
              80% {t("auditUi.conv")}
            </span>
          </div>

          {/* Stage 2 */}
          <div className="w-5/6 flex items-center justify-between bg-primary/15 border border-primary/25 rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary hover:bg-primary">4</Badge>
              <span className="text-sm font-bold text-foreground">
                {t("auditUi.contacted")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold">80%</span>
          </div>

          <div className="flex flex-col items-center gap-1 -my-2 text-primary font-bold text-xs">
            <span>↓</span>
            <span className="bg-secondary/85 px-2 py-0.5 rounded border border-border/50 text-[10px]">
              50% {t("auditUi.conv")}
            </span>
          </div>

          {/* Stage 3 */}
          <div className="w-4/6 flex items-center justify-between bg-primary/20 border border-primary/30 rounded-xl p-3.5">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary hover:bg-primary">2</Badge>
              <span className="text-sm font-bold text-foreground">
                {t("auditUi.trial")}
              </span>
            </div>
            <span className="text-xs text-muted-foreground font-semibold">40%</span>
          </div>

          <div className="flex flex-col items-center gap-1 -my-2 text-primary font-bold text-xs">
            <span>↓</span>
            <span className="bg-secondary/85 px-2 py-0.5 rounded border border-border/50 text-[10px]">
              100% {t("auditUi.conv")}
            </span>
          </div>

          {/* Stage 4 */}
          <div className="w-3/6 flex items-center justify-between bg-gradient-primary rounded-xl p-3.5 text-primary-foreground shadow-sm">
            <div className="flex items-center gap-2">
              <Badge className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-bold">
                28
              </Badge>
              <span className="text-sm font-bold">
                {t("auditUi.activeStudents")}
              </span>
            </div>
            <span className="text-xs font-bold">40%</span>
          </div>
        </div>
      </section>

      {/* EDIT MONTHLY GOAL DIALOG */}
      <Dialog open={isEditGoalOpen} onOpenChange={setIsEditGoalOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              {t("auditUi.editMonthlyGoal")}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveGoalSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="monthly-goal-input" className="text-xs font-semibold text-foreground">
                {t("auditUi.monthlyRevenueTargetR")}
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
                {t("auditUi.setYourTargetGrossMonthlyRevenueIn")}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditGoalOpen(false)}
                className="rounded-xl"
              >
                {t("auditUi.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSavingGoal}
                className="rounded-xl bg-primary text-primary-foreground font-semibold"
              >
                {isSavingGoal ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {t("auditUi.saveGoal")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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

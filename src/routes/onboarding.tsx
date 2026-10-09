import { fmt } from "@/lib/i18n";
import { getUserItem, setUserItem, removeUserItem } from "@/lib/user-storage";
import {
  resolveInitialPreferredName,
  toProfileFullName,
  stripNameFromAnswers,
  profileNameState,
} from "@/lib/onboarding-name";
import { useState, useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import {
  convertOnboardingToWorkingAvailability,
  saveTeacherWorkingAvailability,
} from "@/lib/availability-engine";
import { parseMoneyBRL, saveMonthlyGoal } from "@/lib/growth-engine";
import { toast } from "sonner";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Plus,
  Trash2,
  HelpCircle,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Calendar as CalendarIcon,
  CreditCard,
  FileText,
  Users,
  Briefcase,
  Globe,
  TrendingUp,
  ShieldCheck,
  ChevronRight,
  Pencil,
  Loader2,
} from "lucide-react";

import {
  OnboardingData,
  OnboardingPackage,
  DayAvailability,
  OnboardingRestBlock,
  OnboardingTimeOff,
} from "@/types/onboarding";
import { saveTeacherRestBlocks } from "@/lib/availability-engine";
import { createTeacherTimeOffBatch } from "@/lib/time-off-engine";
import { PackageFormModal, PackageFormData } from "@/components/bloom/PackageFormModal";
import { formatReaisToBRL } from "@/lib/finance-engine";
import {
  formatOnboardingLanguage,
  formatOnboardingPaymentMethod,
  formatOnboardingStudentRange,
  formatOnboardingManagementTool,
  formatOnboardingLessonType,
  formatOnboardingContractPreference,
  formatOnboardingFrequency,
  formatWeekdayName,
} from "@/lib/i18n";

export const Route = createFileRoute("/onboarding")({
  component: OnboardingPage,
});

const DEFAULT_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const LANGUAGE_OPTIONS = [
  "English",
  "Spanish",
  "French",
  "Italian",
  "German",
  "Japanese",
  "Korean",
  "Portuguese",
  "Other",
];

const MANAGEMENT_OPTIONS = [
  "none",
  "excel",
  "sheets",
  "calendar",
  "notion",
  "trello",
  "another_platform",
  "other",
];

const STUDENT_RANGE_OPTIONS = [
  "0",
  "1-5",
  "6-10",
  "11-20",
  "21-40",
  "40+",
];

const LESSON_TYPE_OPTIONS = [
  "Individual",
  "Pair",
  "Group",
];

const PAYMENT_METHOD_OPTIONS = [
  "PIX",
  "Bank transfer",
  "Credit card",
  "Debit card",
  "Cash",
  "Invoice (Boleto)",
  "Other",
];

const INITIAL_DATA: OnboardingData = {
  languages: ["English"],
  otherLanguage: "",
  managementTool: "none",
  managementTools: ["none"],
  otherPlatformText: "",
  otherManagementText: "",
  studentRange: "1-5",
  workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  sameAvailabilityAllDays: true,
  unifiedAvailability: { startTime: "09:00", endTime: "18:00" },
  customAvailability: {
    Monday: { startTime: "09:00", endTime: "18:00" },
    Tuesday: { startTime: "09:00", endTime: "18:00" },
    Wednesday: { startTime: "09:00", endTime: "18:00" },
    Thursday: { startTime: "09:00", endTime: "18:00" },
    Friday: { startTime: "09:00", endTime: "18:00" },
  },
  restBlocks: [],
  timeOff: [],
  lessonTypes: ["Individual"],
  packages: [],
  monthlyGoal: "",
  monthlyExpense: "",
  knowsHourlyRate: null,
  hourlyRate: "",
  paymentMethods: ["PIX", "Credit card"],
  contractsPreference: "YES",
};

export function normalizeOnboardingData(raw: any): OnboardingData {
  const base = { ...INITIAL_DATA };
  if (!raw) return base;

  let tools: string[] = [];
  if (Array.isArray(raw.managementTools)) {
    tools = raw.managementTools;
  } else if (Array.isArray(raw.management_tools)) {
    tools = raw.management_tools;
  } else if (typeof raw.managementTool === "string" && raw.managementTool.trim() !== "") {
    tools = [raw.managementTool.trim()];
  } else if (typeof raw.management_tool === "string" && raw.management_tool.trim() !== "") {
    tools = [raw.management_tool.trim()];
  }

  if (tools.length === 0) {
    tools = ["none"];
  }

  // Rule 2: "none" is exclusive. If selected with other tools, filter out "none"
  if (tools.includes("none") && tools.length > 1) {
    tools = tools.filter((t) => t !== "none");
  }

  const languages = Array.isArray(raw.languages) ? raw.languages : base.languages;
  const otherLanguage = raw.otherLanguage ?? raw.other_language ?? base.otherLanguage;
  const studentRange = raw.studentRange ?? raw.student_range ?? base.studentRange;
  const workingDays = Array.isArray(raw.workingDays)
    ? raw.workingDays
    : Array.isArray(raw.working_days)
      ? raw.working_days
      : base.workingDays;

  const sameAvailabilityAllDays =
    raw.sameAvailabilityAllDays ?? raw.same_availability_all_days ?? base.sameAvailabilityAllDays;
  const unifiedAvailability =
    raw.unifiedAvailability ?? raw.unified_availability ?? base.unifiedAvailability;
  const customAvailability =
    raw.customAvailability ?? raw.custom_availability ?? base.customAvailability;

  const lessonTypes = Array.isArray(raw.lessonTypes)
    ? raw.lessonTypes
    : Array.isArray(raw.lesson_types)
      ? raw.lesson_types
      : base.lessonTypes;

  const packages = Array.isArray(raw.packages) ? raw.packages : base.packages;

  const monthlyGoal = raw.monthlyGoal ?? raw.monthly_goal ?? base.monthlyGoal;
  const monthlyExpense = raw.monthlyExpense ?? raw.monthly_expense ?? base.monthlyExpense;
  const knowsHourlyRate = raw.knowsHourlyRate ?? raw.knows_hourly_rate ?? base.knowsHourlyRate;
  const hourlyRate = raw.hourlyRate ?? raw.hourly_rate ?? base.hourlyRate;

  const paymentMethods = Array.isArray(raw.paymentMethods)
    ? raw.paymentMethods
    : Array.isArray(raw.payment_methods)
      ? raw.payment_methods
      : base.paymentMethods;

  const contractsPreference =
    raw.contractsPreference ?? raw.contracts_preference ?? base.contractsPreference;

  return {
    ...base,
    ...raw,
    languages,
    otherLanguage,
    studentRange,
    workingDays,
    sameAvailabilityAllDays,
    unifiedAvailability,
    customAvailability,
    lessonTypes,
    packages,
    monthlyGoal,
    monthlyExpense,
    knowsHourlyRate,
    hourlyRate,
    paymentMethods,
    contractsPreference,
    managementTools: tools,
    managementTool: tools[0] || "none",
    restBlocks: Array.isArray(raw.restBlocks)
      ? raw.restBlocks
      : Array.isArray(raw.rest_blocks)
        ? raw.rest_blocks
        : [],
    timeOff: Array.isArray(raw.timeOff)
      ? raw.timeOff
      : Array.isArray(raw.time_off)
        ? raw.time_off
        : [],
    otherPlatformText: raw.otherPlatformText || raw.other_platform_text || "",
    otherManagementText: raw.otherManagementText || raw.other_management_text || "",
  };
}

export function OnboardingPage() {
  const { user, session, loading: authLoading, signOut, updateProfileState } = useAuth();
  const { lang, t } = useLanguage();
  const navigate = useNavigate();

  // Draft/step are restored per user id inside the hydration effect below.
  const [currentStep, setCurrentStep] = useState<number>(0); // 0 = Welcome Introduction
  const [data, setData] = useState<OnboardingData>(INITIAL_DATA);

  const [showHourlySkipModal, setShowHourlySkipModal] = useState(false);
  const [showSkipWarningModal, setShowSkipWarningModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccessView, setIsSuccessView] = useState(false);

  const isPt = lang === "pt";

  // Redirect to login if user session is invalid
  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth" });
    }
  }, [user, authLoading, navigate]);

  // Fetch saved onboarding answers ONCE per teacher. The Supabase session
  // object is replaced on every token refresh (e.g. when the tab regains
  // focus), so we key on the stable user id and never re-hydrate after the
  // first load. Local edits (dirty form) always win over server data.
  const hydrationUserId = user?.id || session?.user?.id || null;
  const hydratedForRef = useRef<string | null>(null);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    const userId = hydrationUserId;
    if (!userId) return;
    if (hydratedForRef.current === userId) return;
    hydratedForRef.current = userId;

    // Restore only this user's local draft (scoped by user id).
    let hasLocalStep = false;
    try {
      const savedDraft = getUserItem("bloom.onboarding.draft", userId);
      setData(savedDraft ? normalizeOnboardingData(JSON.parse(savedDraft)) : INITIAL_DATA);
      const savedStep = getUserItem("bloom.onboarding.step", userId);
      const parsed = savedStep ? parseInt(savedStep, 10) : NaN;
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 8) {
        setCurrentStep(parsed);
        hasLocalStep = true;
      } else {
        setCurrentStep(0);
      }
    } catch (e) {
      console.warn("Could not restore draft onboarding state", e);
    }

    let isMounted = true;
    async function loadSavedOnboarding() {
      try {
        const { data: record } = await supabase
          .from("onboarding")
          .select("answers")
          .eq("teacher_id", userId)
          .maybeSingle();

        if (!isMounted || isDirtyRef.current) return;
        if (record?.answers) {
          const { status, current_step, updated_at, ...savedAnswers } = stripNameFromAnswers(
            record.answers
          );
          if (savedAnswers && Object.keys(savedAnswers).length > 0) {
            setData((prev) => normalizeOnboardingData({ ...prev, ...savedAnswers }));
          }
          if (typeof current_step === "number" && current_step >= 0 && current_step <= 8) {
            if (!hasLocalStep) {
              setCurrentStep(current_step);
            }
          }
        }
      } catch (err) {
        console.warn("[Onboarding] Error restoring remote answers:", err);
      }
    }

    // Prefill the name only from this user's profiles.full_name (never from e-mail).
    async function loadProfileName() {
      try {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", userId)
          .maybeSingle();
        if (!isMounted) return;
        const email = user?.email ?? session?.user?.email;
        setData((prev) => {
          const next = resolveInitialPreferredName(prev.preferredName, prof?.full_name, email);
          return next === (prev.preferredName ?? "") ? prev : { ...prev, preferredName: next };
        });
      } catch (err) {
        console.warn("[Onboarding] Error loading profile name:", err);
      }
    }

    loadSavedOnboarding().then(loadProfileName);
    return () => {
      isMounted = false;
    };
  }, [hydrationUserId]);

  // Save progress automatically to localStorage
  useEffect(() => {
    try {
      const uid = hydrationUserId;
      if (!uid || hydratedForRef.current !== uid) return;
      setUserItem("bloom.onboarding.draft", JSON.stringify(data), uid);
      setUserItem("bloom.onboarding.step", String(currentStep), uid);
    } catch (e) {
      console.warn("Draft auto-save error:", e);
    }
  }, [data, currentStep, hydrationUserId]);

  // Auto-redirect to dashboard when final success screen is rendered
  useEffect(() => {
    if (!isSuccessView) return;
    const timer = setTimeout(() => {
      navigate({ to: "/" });
    }, 2600);
    return () => clearTimeout(timer);
  }, [isSuccessView, navigate]);

  const savePartialProgress = async (status: "in_progress" | "skipped", stepNum: number) => {
    const userId = user?.id || session?.user?.id;
    if (!userId) return;
    // The name lives only in public.profiles.full_name — never in onboarding answers.
    const answersWithoutName = stripNameFromAnswers(data);
    try {
      await supabase.from("onboarding").upsert(
        {
          teacher_id: userId,
          answers: {
            ...answersWithoutName,
            management_tool: data.managementTools?.[0] || data.managementTool || "none",
            management_tools: data.managementTools || ["none"],
            other_platform_text: data.otherPlatformText || "",
            other_management_text: data.otherManagementText || "",
            status,
            current_step: stepNum,
            updated_at: new Date().toISOString(),
          },
        },
        { onConflict: "teacher_id" }
      );
    } catch (e) {
      console.warn("[Onboarding] Partial progress save error:", e);
    }
  };

  const updateData = <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
    isDirtyRef.current = true;
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const handleNext = () => {
    if (currentStep === 5 && data.knowsHourlyRate === false) {
      setShowHourlySkipModal(true);
      return;
    }
    if (currentStep < 8) {
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      savePartialProgress("in_progress", nextStep);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const handleSkipTrigger = () => {
    setShowSkipWarningModal(true);
  };

  const handleConfirmSkip = async () => {
    setShowSkipWarningModal(false);
    await savePartialProgress("skipped", currentStep);
    updateProfileState({ onboarding_status: "skipped" });
    if (typeof window !== "undefined") {
      localStorage.setItem("bloom.onboarding.skipped", "true");
    }
    toast.info(
      t("onboardingUi.youCanResumeSetupAnytime")
    );
    navigate({ to: "/" });
  };

  // Final finish handler: Save configuration to database
  const handleCompleteOnboarding = async () => {
    setIsSubmitting(true);
    try {
      const userId = user?.id || session?.user?.id;
      if (!userId) throw new Error("No authenticated user session found");

      // 1. Update profiles table
      const finalLanguages =
        data.languages.includes("Other") && data.otherLanguage
          ? [...data.languages.filter((l) => l !== "Other"), data.otherLanguage]
          : data.languages;

      const preferredFullName = toProfileFullName(data.preferredName);
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          languages_taught: finalLanguages,
          full_name: preferredFullName,
        })
        .eq("id", userId);

      if (profileError) {
        throw new Error(profileError.message);
      }

      // 2. Insert into onboarding table (structured answers)
      const { error: onboardingError } = await supabase.from("onboarding").upsert(
        {
          teacher_id: userId,
          answers: {
            languages: finalLanguages,
            management_tool: data.managementTools?.[0] || data.managementTool || "none",
            management_tools: data.managementTools || ["none"],
            other_platform_text: data.otherPlatformText || "",
            other_management_text: data.otherManagementText || "",
            student_range: data.studentRange,
            working_days: data.workingDays,
            same_availability_all_days: data.sameAvailabilityAllDays,
            unified_availability: data.unifiedAvailability,
            custom_availability: data.customAvailability,
            rest_blocks: data.restBlocks || [],
            time_off: data.timeOff || [],
            lesson_types: data.lessonTypes,
            packages: data.packages,
            monthly_goal: data.monthlyGoal,
            monthly_expense: data.monthlyExpense,
            knows_hourly_rate: data.knowsHourlyRate,
            hourly_rate: data.hourlyRate,
            payment_methods: data.paymentMethods,
            contracts_preference: data.contractsPreference,
            status: "completed",
            completed_at: new Date().toISOString(),
          },
        },
        { onConflict: "teacher_id" }
      );

      if (onboardingError) {
        throw new Error(onboardingError.message);
      }

      // 3. Populate packages table in Supabase
      if (data.packages && data.packages.length > 0) {
        const pkgRows = data.packages.map((pkg) => ({
          teacher_id: userId,
          name: pkg.name,
          price: Number(pkg.price || 0), // STORED DIRECTLY IN REAIS (NOT CENTS)
          lessons: pkg.lessons,
          lesson_duration_minutes: pkg.duration,
          frequency: pkg.frequency,
          default_installment_count: pkg.billingModel === "installment_total" ? pkg.defaultInstallmentCount : null,
          billing_model: pkg.billingModel,
          billing_duration_type: pkg.billingModel === "monthly" ? pkg.billingDurationType : null,
          contract_duration_months: pkg.billingModel === "monthly" && pkg.billingDurationType === "fixed" ? pkg.contractMonths : null,
          method: "Pix",
        }));

        const { error: pkgError } = await supabase.from("packages").insert(pkgRows);
        if (pkgError) {
          console.warn("[Onboarding] Packages insert warning:", pkgError.message);
        }
      }

      // 4. Monthly revenue goal → business_goals (single operational source).
      // Empty or invalid input means "goal not defined yet"; nothing is invented.
      const goalValue = parseMoneyBRL(data.monthlyGoal);
      if (goalValue !== null && goalValue > 0) {
        const goalRes = await saveMonthlyGoal(userId, goalValue);
        if (!goalRes.success) {
          throw new Error(goalRes.error || "monthly goal save failed");
        }
      }

      // 5. Update settings table & initialize working_availability from onboarding schedule
      const { error: settingsError } = await supabase.from("settings").upsert(
        {
          teacher_id: userId,
          currency: "BRL",
          default_class_duration: 60,
          notification_preferences: {
            payment_methods: data.paymentMethods,
            contracts: data.contractsPreference,
          },
        },
        { onConflict: "teacher_id" }
      );

      if (settingsError) {
        console.warn("[Onboarding] Settings update warning:", settingsError.message);
      }

      // Working availability → settings.working_availability, exactly as chosen now.
      const availRes = await saveTeacherWorkingAvailability(
        userId,
        convertOnboardingToWorkingAvailability(data)
      );
      if (!availRes.success) {
        throw new Error(availRes.error || "working availability save failed");
      }

      // 5b. Recurring pauses → settings.rest_blocks (existing source of truth)
      const validRestBlocks = (data.restBlocks || []).filter(
        (b) => b.day && b.startTime && b.endTime && b.startTime < b.endTime
      );
      if (validRestBlocks.length > 0) {
        const restRes = await saveTeacherRestBlocks(
          userId,
          validRestBlocks.map((b) => ({
            id: b.id,
            day: b.day,
            startTime: b.startTime,
            endTime: b.endTime,
            label: b.label || undefined,
          }))
        );
        if (!restRes.success) {
          console.warn("[Onboarding] Rest blocks save warning:", restRes.error);
        }
      }

      // 5c. Vacations / days off → teacher_time_off (existing source of truth)
      const validTimeOff = (data.timeOff || []).filter(
        (p) => p.startDate && p.endDate && p.endDate >= p.startDate
      );
      if (validTimeOff.length > 0) {
        const offRes = await createTeacherTimeOffBatch(
          userId,
          validTimeOff.map((p) => ({
            startDate: p.startDate,
            endDate: p.endDate,
            type: "Férias" as const,
            title: p.title?.trim() || undefined,
          }))
        );
        if (!offRes.success) {
          console.warn("[Onboarding] Time off save warning:", offRes.error);
        }
      }

      // 6. Update local and AuthProvider state
      updateProfileState({
        onboarding_completed: true,
        onboarding_status: "completed",
        languages_taught: finalLanguages,
        ...profileNameState(preferredFullName),
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("bloom.onboarding.completed", "true");
        removeUserItem("bloom.onboarding.draft", user?.id ?? null);
        localStorage.removeItem("bloom.onboarding.skipped");
        removeUserItem("bloom.onboarding.step", user?.id ?? null);
      }

      setIsSuccessView(true);
    } catch (err: any) {
      console.error("[Onboarding] Finalization error:", err);
      toast.error(
        t("onboardingUi.couldNotSaveYourSetup")
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#163020]">
        <div className="h-16 w-16 rounded-2xl bg-[#F4EBE1] flex items-center justify-center shadow-lg animate-pulse">
          <span className="font-outfit font-extrabold text-[#163020] text-3xl">B</span>
        </div>
      </div>
    );
  }

  const totalSteps = 7;
  const isWelcomeStep = currentStep === 0;
  const isSummaryStep = currentStep === 8;
  const progressPercent = Math.min(100, Math.round((currentStep / totalSteps) * 100));

  return (
    <div className="relative min-h-screen w-full bg-[#FAF7F2] font-figtree text-slate-900 flex flex-col select-none">
      {/* Top Header / Progress Bar */}
      {!isSuccessView && (
        <header className="sticky top-0 z-30 bg-[#FAF7F2]/90 backdrop-blur-md border-b border-stone-200/70 px-4 sm:px-8 py-4">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            {/* Logo & Step indicator */}
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-[#163020] flex items-center justify-center text-[#F4EBE1] font-outfit font-black text-lg shadow-sm">
                B
              </div>
              {isWelcomeStep && (
                <span className="text-xs sm:text-sm font-semibold text-emerald-800 font-outfit bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                  {t("onboardingUi.welcome")}
                </span>
              )}
              {!isWelcomeStep && !isSummaryStep && (
                <span className="text-xs sm:text-sm font-semibold text-stone-500 font-outfit">
                  {fmt(t("onboardingUi.stepOf"), currentStep, totalSteps)}
                </span>
              )}
              {isSummaryStep && (
                <span className="text-xs sm:text-sm font-semibold text-emerald-800 font-outfit bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                  {t("onboardingUi.bloomSummary")}
                </span>
              )}
            </div>

            {/* Skip Step Button (Available on steps 1-7) */}
            {!isWelcomeStep && !isSummaryStep && (
              <button
                type="button"
                onClick={handleSkipTrigger}
                className="text-xs sm:text-sm font-semibold text-stone-500 hover:text-stone-800 px-3 py-1.5 rounded-lg hover:bg-stone-200/50 transition-colors cursor-pointer"
              >
                {t("onboardingUi.skip")}
              </button>
            )}
          </div>

          {/* Progress Line */}
          {!isWelcomeStep && !isSummaryStep && (
            <div className="max-w-xl mx-auto mt-3 h-1.5 w-full bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-700 transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </header>
      )}

      {/* Main Form Container */}
      <main className="flex-1 max-w-xl w-full mx-auto px-4 py-6 sm:py-10 flex flex-col justify-between">
        {isSuccessView ? (
          <div className="space-y-8 text-center max-w-lg mx-auto py-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="h-16 w-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center text-emerald-800 shadow-inner">
              <CheckCircle2 className="h-8 w-8 text-emerald-800" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold font-outfit text-[#163020]">
                {t("onboardingUi.allSetYourBloomHas")}
              </h2>
              <p className="text-base text-stone-600 font-medium leading-relaxed">
                {t("onboardingUi.weVeTailoredYourExperience")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="w-full flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-extrabold text-base shadow-lg transition-all cursor-pointer"
            >
              <span>{t("onboardingUi.enterBloom")}</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
              {currentStep === 0 && (
                <Step0Welcome
                  onStart={() => {
                    setCurrentStep(1);
                    savePartialProgress("in_progress", 1);
                  }}
                  isPt={isPt}
                />
              )}

              {currentStep === 1 && (
                <Step1AboutYou
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 2 && (
                <Step2YourBusiness
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 3 && (
                <Step3YourSchedule
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 4 && (
                <Step4PlansPackages
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 5 && (
                <Step5Finances
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 6 && (
                <Step6Payments
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 7 && (
                <Step7Contracts
                  data={data}
                  updateData={updateData}
                  isPt={isPt}
                />
              )}

              {currentStep === 8 && (
                <StepFinalSummary
                  data={data}
                  isPt={isPt}
                />
              )}
            </div>

            {/* Bottom Navigation CTAs */}
            {!isWelcomeStep && (
              <div className="mt-8 pt-6 border-t border-stone-200/60 flex items-center justify-between gap-4">
                {currentStep > 1 && !isSummaryStep ? (
                  <button
                    type="button"
                    onClick={handleBack}
                    className="h-12 px-5 flex items-center gap-2 rounded-2xl border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 font-semibold text-sm shadow-sm transition-all cursor-pointer"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{t("onboardingUi.back")}</span>
                  </button>
                ) : (
                  <div />
                )}

                {!isSummaryStep ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="h-12 px-8 flex items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] active:scale-[0.98] font-bold text-sm sm:text-base shadow-md transition-all cursor-pointer ml-auto"
                  >
                    <span>{t("onboardingUi.continue")}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCompleteOnboarding}
                    disabled={isSubmitting}
                    className="w-full h-14 flex items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] active:scale-[0.98] font-extrabold text-base sm:text-lg shadow-lg transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        {t("onboardingUi.preparingYourBloom")}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {t("onboardingUi.prepareMyBloom")}
                      </span>
                    )}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Confirmation Modal for Skipping Entire Onboarding */}
      {showSkipWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 text-center">
            <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center">
              <HelpCircle className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold font-outfit text-stone-900">
                {t("onboardingUi.areYouSureYouWant")}
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                {t("onboardingUi.bloomUsesThisInformationTo")}
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSkipWarningModal(false)}
                className="w-full h-12 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-sm shadow-sm transition-colors cursor-pointer"
              >
                {t("onboardingUi.continuePersonalizing")}
              </button>
              <button
                type="button"
                onClick={handleConfirmSkip}
                className="w-full h-11 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 font-bold text-xs text-stone-600 transition-colors cursor-pointer"
              >
                {t("onboardingUi.skipForNow")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Skipping Hourly Rate in Step 5 */}
      {showHourlySkipModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 text-center">
            <div className="h-14 w-14 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
              <HelpCircle className="h-7 w-7" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold font-outfit text-stone-900">
                {t("onboardingUi.skipHourlyRate")}
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                {t("onboardingUi.yourHourlyRateHelpsBloom")}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowHourlySkipModal(false)}
                className="w-full h-11 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 font-bold text-sm text-stone-700 transition-colors cursor-pointer"
              >
                {t("onboardingUi.goBack")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowHourlySkipModal(false);
                  setCurrentStep(6);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="w-full h-11 rounded-xl bg-[#163020] hover:bg-[#1a3825] font-bold text-sm text-[#F4EBE1] transition-colors cursor-pointer"
              >
                {t("onboardingUi.skipForNow")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   STEP 0 — WELCOME INTRODUCTION
   ========================================================================= */
function Step0Welcome({ onStart, isPt }: { onStart: () => void; isPt: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-8 text-center max-w-lg mx-auto py-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="h-16 w-16 mx-auto rounded-3xl bg-[#163020] flex items-center justify-center text-[#F4EBE1] font-outfit font-black text-2xl shadow-md">
        B
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.welcomeToBloom")}
        </h1>
        <p className="text-base text-stone-700 font-medium leading-relaxed">
          {t("onboardingUi.beforeStartingWeDLove")}
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-5 space-y-3 shadow-sm text-left">
        <p className="text-sm text-stone-600 leading-relaxed font-medium">
          {t("onboardingUi.theseQuickQuestionsWillHelp")}
        </p>
        <p className="text-sm text-stone-600 leading-relaxed font-medium pt-2 border-t border-stone-100">
          {t("onboardingUi.theMoreWeKnowAbout")}
        </p>
      </div>

      <div className="space-y-4 pt-2">
        <p className="text-xs text-stone-500 font-semibold">
          {t("onboardingUi.donTWorryYouCan")}
        </p>

        <button
          type="button"
          onClick={onStart}
          className="w-full flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-base shadow-md transition-all cursor-pointer"
        >
          <span>{t("onboardingUi.customizeMyBloom")}</span>
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

/* =========================================================================
   STEP 1 — ABOUT YOU
   ========================================================================= */
function Step1AboutYou({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  const toggleLanguage = (langId: string) => {
    let next: string[];
    if (data.languages.includes(langId)) {
      next = data.languages.filter((l) => l !== langId);
    } else {
      next = [...data.languages, langId];
    }
    updateData("languages", next);
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step1AboutYou")}
        </span>
      </div>

      {/* Preferred name (saved to profiles.full_name) */}
      <div className="space-y-2">
        <label
          htmlFor="onboarding-preferred-name"
          className="block text-lg sm:text-xl font-extrabold font-outfit text-stone-900"
        >
          {t("onboardingUi.whatWouldYouLikeTo")}
        </label>
        <input
          id="onboarding-preferred-name"
          type="text"
          autoComplete="given-name"
          maxLength={80}
          value={data.preferredName ?? ""}
          onChange={(e) => updateData("preferredName", e.target.value)}
          placeholder={t("onboardingUi.eGDeBora")}
          className="w-full h-12 rounded-xl border border-stone-300 bg-white px-4 text-base text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.whatLanguageSDoYou")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.selectAllLanguagesYouTeach")}
        </p>
      </div>

      {/* Languages Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {LANGUAGE_OPTIONS.map((langId) => {
          const selected = data.languages.includes(langId);
          return (
            <button
              key={langId}
              type="button"
              onClick={() => toggleLanguage(langId)}
              className={`flex items-center justify-between p-3.5 rounded-2xl border text-sm font-semibold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
              }`}
            >
              <span>{formatOnboardingLanguage(langId, lang)}</span>
              <div
                className={`h-5 w-5 rounded-md flex items-center justify-center text-xs transition-colors ${
                  selected ? "bg-emerald-500 text-white" : "border border-stone-300"
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* If "Other" is checked */}
      {data.languages.includes("Other") && (
        <div className="pt-1">
          <label className="block text-xs font-bold text-stone-700 mb-1.5">
            {t("onboardingUi.specifyOtherLanguage")}
          </label>
          <input
            type="text"
            value={data.otherLanguage || ""}
            onChange={(e) => updateData("otherLanguage", e.target.value)}
            placeholder={t("onboardingUi.eGMandarinRussian")}
            className="w-full h-11 px-4 rounded-xl border border-stone-300 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-sm"
          />
        </div>
      )}

      {/* Second Question: Management Tools Multi-Selection */}
      <div className="space-y-4 pt-4 border-t border-stone-200/70">
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-outfit text-stone-900">
            {t("onboarding.managementToolTitle")}
          </h3>
          <p className="text-xs text-stone-500">
            {t("onboarding.managementToolSubtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MANAGEMENT_OPTIONS.map((toolId) => {
            const currentTools = data.managementTools || [];
            const selected = currentTools.includes(toolId);

            const toggleTool = (idToToggle: string) => {
              let nextTools: string[];
              if (idToToggle === "none") {
                // Rule 2: "Não uso nenhum sistema" is exclusive
                nextTools = ["none"];
              } else {
                if (currentTools.includes(idToToggle)) {
                  nextTools = currentTools.filter((tItem) => tItem !== idToToggle);
                  if (nextTools.length === 0) {
                    nextTools = ["none"];
                  }
                } else {
                  // Add toolId and deselect "none"
                  nextTools = [...currentTools.filter((tItem) => tItem !== "none"), idToToggle];
                }
              }

              updateData("managementTools", nextTools);
              updateData("managementTool", nextTools[0] || "none");
            };

            return (
              <button
                key={toolId}
                type="button"
                onClick={() => toggleTool(toolId)}
                className={`flex items-center justify-between p-3.5 rounded-2xl border text-sm font-semibold transition-all text-left cursor-pointer ${
                  selected
                    ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                    : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                }`}
              >
                <span className="text-xs sm:text-sm">{formatOnboardingManagementTool(toolId, lang)}</span>
                <div
                  className={`h-5 w-5 rounded-md flex items-center justify-center text-xs transition-colors shrink-0 ${
                    selected ? "bg-emerald-500 text-white" : "border border-stone-300"
                  }`}
                >
                  {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Conditional Field 1: "Outra plataforma" (another_platform) */}
        {(data.managementTools || []).includes("another_platform") && (
          <div className="pt-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="block text-xs font-bold text-stone-700 font-outfit">
              {t("onboarding.otherPlatformLabel")}
            </label>
            <input
              type="text"
              value={data.otherPlatformText || ""}
              onChange={(e) => updateData("otherPlatformText", e.target.value)}
              placeholder={t("onboarding.otherPlatformPlaceholder")}
              className="w-full h-11 px-4 rounded-xl border border-stone-300 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-sm shadow-xs"
            />
          </div>
        )}

        {/* Conditional Field 2: "Outro" (other) */}
        {(data.managementTools || []).includes("other") && (
          <div className="pt-2 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
            <label className="block text-xs font-bold text-stone-700 font-outfit">
              {t("onboarding.otherManagementLabel")}
            </label>
            <textarea
              rows={3}
              value={data.otherManagementText || ""}
              onChange={(e) => updateData("otherManagementText", e.target.value)}
              placeholder={t("onboarding.otherManagementPlaceholder")}
              className="w-full p-3.5 rounded-xl border border-stone-300 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-sm shadow-xs resize-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   STEP 2 — YOUR BUSINESS
   ========================================================================= */
function Step2YourBusiness({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step2YourBusiness")}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.howManyActiveStudentsDo")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.thisConfiguresYourDashboardVolume")}
        </p>
      </div>

      {/* Options List */}
      <div className="space-y-3">
        {STUDENT_RANGE_OPTIONS.map((rangeId) => {
          const selected = data.studentRange === rangeId;
          return (
            <button
              key={rangeId}
              type="button"
              onClick={() => updateData("studentRange", rangeId)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border text-base font-semibold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-md scale-[1.01]"
                  : "bg-white text-stone-800 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className={`h-5 w-5 ${selected ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{formatOnboardingStudentRange(rangeId, lang)}</span>
              </div>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  selected ? "border-emerald-400 bg-emerald-500" : "border-stone-300"
                }`}
              >
                {selected && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   STEP 3 — YOUR SCHEDULE
   ========================================================================= */
function Step3YourSchedule({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  const toggleDay = (day: string) => {
    let next: string[];
    if (data.workingDays.includes(day)) {
      next = data.workingDays.filter((d) => d !== day);
    } else {
      next = [...data.workingDays, day];
    }
    updateData("workingDays", next);
  };

  const handleUnifiedChange = (field: "startTime" | "endTime", val: string) => {
    const nextUni = { ...data.unifiedAvailability, [field]: val };
    updateData("unifiedAvailability", nextUni);

    // Copy to all custom availability days as well
    const nextCustom = { ...data.customAvailability };
    data.workingDays.forEach((day) => {
      nextCustom[day] = nextUni;
    });
    updateData("customAvailability", nextCustom);
  };

  const handleCustomDayChange = (day: string, field: "startTime" | "endTime", val: string) => {
    const nextCustom = {
      ...data.customAvailability,
      [day]: {
        ...(data.customAvailability[day] || { startTime: "09:00", endTime: "18:00" }),
        [field]: val,
      },
    };
    updateData("customAvailability", nextCustom);
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step3YourSchedule")}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.selectYourWorkingDays")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.checkTheDaysYouUsually")}
        </p>
      </div>

      {/* Days Selection — Uniform 7-column grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DEFAULT_DAYS.map((day) => {
          const selected = data.workingDays.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              title={formatWeekdayName(day, lang, false)}
              className={`flex flex-col items-center justify-center h-13 sm:h-14 rounded-2xl border text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm scale-[1.02]"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <span>{formatWeekdayName(day, lang, true)}</span>
            </button>
          );
        })}
      </div>

      {/* Same availability question */}
      {data.workingDays.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-stone-200/70">
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-bold font-outfit text-stone-900">
              {t("onboardingUi.doYouUsuallyHaveThe")}
            </h3>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => updateData("sameAvailabilityAllDays", true)}
                className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                  data.sameAvailabilityAllDays
                    ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                    : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                }`}
              >
                {t("onboardingUi.yes")}
              </button>
              <button
                type="button"
                onClick={() => updateData("sameAvailabilityAllDays", false)}
                className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                  !data.sameAvailabilityAllDays
                    ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                    : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
                }`}
              >
                {t("onboardingUi.no")}
              </button>
            </div>
          </div>

          {/* Unified availability editor */}
          {data.sameAvailabilityAllDays ? (
            <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-2">
              <span className="text-xs font-bold text-stone-500 uppercase">
                {t("onboardingUi.standardTimeForAllDays")}
              </span>
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={data.unifiedAvailability.startTime}
                  onChange={(e) => handleUnifiedChange("startTime", e.target.value)}
                  className="h-11 px-3 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
                <span className="text-sm font-bold text-stone-400">→</span>
                <input
                  type="time"
                  value={data.unifiedAvailability.endTime}
                  onChange={(e) => handleUnifiedChange("endTime", e.target.value)}
                  className="h-11 px-3 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>
          ) : (
            /* Custom availability editor per selected day */
            <div className="space-y-3">
              <span className="text-xs font-bold text-stone-500 uppercase">
                {t("onboardingUi.configureEachDaySeparately")}
              </span>
              {data.workingDays.map((day) => {
                const avail = data.customAvailability[day] || { startTime: "09:00", endTime: "18:00" };
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-stone-200"
                  >
                    <span className="text-sm font-bold text-stone-800">
                      {formatWeekdayName(day, lang, false)}
                    </span>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={avail.startTime}
                        onChange={(e) => handleCustomDayChange(day, "startTime", e.target.value)}
                        className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                      <span className="text-xs font-bold text-stone-400">–</span>
                      <input
                        type="time"
                        value={avail.endTime}
                        onChange={(e) => handleCustomDayChange(day, "endTime", e.target.value)}
                        className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Optional section: recurring pauses (rest_blocks) ---- */}
      <RestBlocksSection data={data} updateData={updateData} isPt={isPt} />

      {/* ---- Optional section: vacations & days off (teacher_time_off) ---- */}
      <TimeOffSection data={data} updateData={updateData} isPt={isPt} />
    </div>
  );
}

const OPTIONAL_SECTION_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function OptionalBadge({ isPt }: { isPt: boolean }) {
  const { t } = useLanguage();
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-stone-100 text-stone-500 border border-stone-200">
      {t("onboardingUi.optional")}
    </span>
  );
}

function RestBlocksSection({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  const blocks = data.restBlocks || [];

  const addBlock = () => {
    const day = data.workingDays[0] || "Monday";
    const next: OnboardingRestBlock[] = [
      ...blocks,
      {
        id: `rest-${Date.now()}`,
        day,
        startTime: "12:00",
        endTime: "13:00",
        label: t("onboardingUi.break"),
      },
    ];
    updateData("restBlocks", next);
  };

  const updateBlock = (id: string, field: keyof OnboardingRestBlock, value: string) => {
    updateData(
      "restBlocks",
      blocks.map((b) => (b.id === id ? { ...b, [field]: value } : b))
    );
  };

  const removeBlock = (id: string) => {
    updateData("restBlocks", blocks.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-4 pt-6 border-t border-stone-200/70">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold font-outfit text-stone-900">
              {t("onboardingUi.recurringBreaks")}
            </h3>
            <OptionalBadge isPt={isPt} />
          </div>
          <p className="text-sm text-stone-500">
            {t("onboardingUi.fixedWeeklyBreaksLikeLunch")}
          </p>
        </div>
      </div>

      {blocks.length > 0 && (
        <div className="space-y-3">
          {blocks.map((b) => {
            const invalid = b.startTime >= b.endTime;
            return (
              <div
                key={b.id}
                className="p-3.5 bg-white rounded-2xl border border-stone-200 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={b.day}
                    onChange={(e) => updateBlock(b.id, "day", e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700 cursor-pointer"
                  >
                    {DEFAULT_DAYS.map((d) => (
                      <option key={d} value={d}>
                        {formatWeekdayName(d, lang, false)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={b.startTime}
                    onChange={(e) => updateBlock(b.id, "startTime", e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <span className="text-xs font-bold text-stone-400">–</span>
                  <input
                    type="time"
                    value={b.endTime}
                    onChange={(e) => updateBlock(b.id, "endTime", e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <input
                    type="text"
                    value={b.label || ""}
                    onChange={(e) => updateBlock(b.id, "label", e.target.value)}
                    placeholder={t("onboardingUi.nameOptional")}
                    className="h-10 px-3 flex-1 min-w-[130px] rounded-xl border border-stone-300 bg-stone-50 font-medium text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => removeBlock(b.id)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-stone-200 text-stone-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
                    aria-label={t("onboardingUi.removeBreak")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {invalid && (
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t("onboardingUi.endTimeMustBeAfter")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addBlock}
        className="w-full h-12 rounded-2xl border border-dashed border-stone-300 text-sm font-bold text-stone-600 hover:border-emerald-700 hover:text-emerald-800 hover:bg-emerald-50/50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        {t("onboardingUi.addBreak")}
      </button>
    </div>
  );
}

function TimeOffSection({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { t } = useLanguage();
  const periods = data.timeOff || [];

  const addPeriod = () => {
    const today = new Date().toISOString().slice(0, 10);
    const next: OnboardingTimeOff[] = [
      ...periods,
      { id: `off-${Date.now()}`, startDate: today, endDate: today, title: "" },
    ];
    updateData("timeOff", next);
  };

  const updatePeriod = (id: string, field: keyof OnboardingTimeOff, value: string) => {
    updateData(
      "timeOff",
      periods.map((p) => {
        if (p.id !== id) return p;
        const updated = { ...p, [field]: value };
        if (field === "startDate" && updated.endDate < updated.startDate) {
          updated.endDate = updated.startDate;
        }
        return updated;
      })
    );
  };

  const removePeriod = (id: string) => {
    updateData("timeOff", periods.filter((p) => p.id !== id));
  };

  return (
    <div className="space-y-4 pt-6 border-t border-stone-200/70">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="text-base sm:text-lg font-bold font-outfit text-stone-900">
            {t("onboardingUi.vacationsDaysOff")}
          </h3>
          <OptionalBadge isPt={isPt} />
        </div>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.periodsWhenYouWonT")}
        </p>
      </div>

      {periods.length > 0 && (
        <div className="space-y-3">
          {periods.map((p) => {
            const invalid = p.endDate < p.startDate;
            return (
              <div
                key={p.id}
                className="p-3.5 bg-white rounded-2xl border border-stone-200 space-y-2"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={p.startDate}
                    onChange={(e) => updatePeriod(p.id, "startDate", e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <span className="text-xs font-bold text-stone-400">–</span>
                  <input
                    type="date"
                    value={p.endDate}
                    min={p.startDate}
                    onChange={(e) => updatePeriod(p.id, "endDate", e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-stone-300 bg-stone-50 font-bold text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <input
                    type="text"
                    value={p.title || ""}
                    onChange={(e) => updatePeriod(p.id, "title", e.target.value)}
                    placeholder={t("onboardingUi.nameEGJulyVacation")}
                    className="h-10 px-3 flex-1 min-w-[150px] rounded-xl border border-stone-300 bg-stone-50 font-medium text-stone-800 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                  <button
                    type="button"
                    onClick={() => removePeriod(p.id)}
                    className="h-10 w-10 flex items-center justify-center rounded-xl border border-stone-200 text-stone-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors cursor-pointer"
                    aria-label={t("onboardingUi.removePeriod")}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {invalid && (
                  <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {t("onboardingUi.endDateCanTBe")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={addPeriod}
        className="w-full h-12 rounded-2xl border border-dashed border-stone-300 text-sm font-bold text-stone-600 hover:border-emerald-700 hover:text-emerald-800 hover:bg-emerald-50/50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
      >
        <Plus className="w-4 h-4" />
        {t("onboardingUi.addPeriod")}
      </button>
    </div>
  );
}

/* =========================================================================
   STEP 4 — PLANS & PACKAGES
   ========================================================================= */
function Step4PlansPackages({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPkg, setEditingPkg] = useState<OnboardingPackage | null>(null);

  const toggleLessonType = (typeId: string) => {
    let next: string[];
    if (data.lessonTypes.includes(typeId)) {
      next = data.lessonTypes.filter((tItem) => tItem !== typeId);
    } else {
      next = [...data.lessonTypes, typeId];
    }
    updateData("lessonTypes", next);
  };

  const handleOpenCreate = () => {
    setEditingPkg(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (pkg: OnboardingPackage) => {
    setEditingPkg(pkg);
    setIsModalOpen(true);
  };

  const handleRemovePackage = (pkgId: string) => {
    updateData(
      "packages",
      data.packages.filter((p) => p.id !== pkgId)
    );
  };

  const handleSavePackageModal = (formData: PackageFormData) => {
    if (formData.id) {
      // Edit existing package (prevents duplicate creation!)
      const updated = data.packages.map((p) =>
        p.id === formData.id
          ? {
              ...p,
              name: formData.name,
              price: formData.price,
              frequency: formData.frequency,
              duration: formData.duration,
              lessons: formData.lessons,
              method: formData.method,
              defaultInstallmentCount: formData.defaultInstallmentCount,
              billingModel: formData.billingModel,
              billingDurationType: formData.billingDurationType,
              contractMonths: formData.contractMonths,
            }
          : p
      );
      updateData("packages", updated);
    } else {
      // Create new package
      const newPkg: OnboardingPackage = {
        id: `pkg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: formData.name,
        price: formData.price,
        frequency: formData.frequency,
        duration: formData.duration,
        lessons: formData.lessons,
        method: formData.method,
        defaultInstallmentCount: formData.defaultInstallmentCount,
        billingModel: formData.billingModel,
        billingDurationType: formData.billingDurationType,
        contractMonths: formData.contractMonths,
      };
      updateData("packages", [...data.packages, newPkg]);
    }
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step4PlansPackages")}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.whatTypeOfLessonsDo")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.selectAllLessonModalities")}
        </p>
      </div>

      {/* Lesson Types */}
      <div className="grid grid-cols-3 gap-3">
        {LESSON_TYPE_OPTIONS.map((typeId) => {
          const selected = data.lessonTypes.includes(typeId);
          return (
            <button
              key={typeId}
              type="button"
              onClick={() => toggleLessonType(typeId)}
              className={`p-3.5 rounded-2xl border text-center font-bold text-sm transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
              }`}
            >
              {formatOnboardingLessonType(typeId, lang)}
            </button>
          );
        })}
      </div>

      {/* Packages Builder */}
      <div className="space-y-5 pt-4 border-t border-stone-200/70">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-lg font-bold font-outfit text-stone-900">
              {t("onboarding.packagesStepTitle")}
            </h3>
            <p className="text-xs text-stone-500">
              {t("onboarding.packagesStepSubtitle")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="h-10 px-4 rounded-xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-xs shadow-sm transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span>{t("onboardingUi.createPackage")}</span>
          </button>
        </div>

        {/* Active Packages List Catalog */}
        <div className="space-y-3">
          {data.packages.length === 0 ? (
            <div className="p-6 text-center rounded-2xl border border-dashed border-stone-300 bg-stone-50/50 space-y-2">
              <p className="text-sm font-medium text-stone-600">
                {t("onboardingUi.noPackagesCreatedYet")}
              </p>
              <p className="text-xs text-stone-400">
                {t("onboardingUi.youCanCreatePackagesNow")}
              </p>
            </div>
          ) : (
            data.packages.map((pkg) => {
              const freqLabel = formatOnboardingFrequency(pkg.frequency, lang);
              const methodLabel = formatOnboardingPaymentMethod(pkg.method, lang);

              return (
                <div
                  key={pkg.id}
                  className="flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-xs hover:border-stone-300 transition-all"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900 text-base">{pkg.name}</span>
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                        {freqLabel}
                      </span>
                    </div>
                    <div className="text-xs text-stone-500 font-semibold flex items-center gap-2 flex-wrap">
                      <span>{pkg.lessons} {t("onboardingUi.lessons")}</span>
                      <span>•</span>
                      <span>{formatReaisToBRL(pkg.price)}</span>
                      <span>•</span>
                      <span>{pkg.duration} min</span>
                      {pkg.frequency === "total" && pkg.defaultInstallmentCount && pkg.defaultInstallmentCount > 1 && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-700">
                            {fmt(t("onboardingUi.upToX"), pkg.defaultInstallmentCount)}
                          </span>
                        </>
                      )}
                      <span>•</span>
                      <span className="bg-stone-100 px-2 py-0.5 rounded text-[11px] text-stone-600 font-bold">
                        {methodLabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(pkg)}
                      className="p-2 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                      title={t("onboardingUi.editPackage")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePackage(pkg.id)}
                      className="p-2 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                      title={t("onboardingUi.deletePackage")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Package Creation & Edition Shared Modal */}
      <PackageFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePackageModal}
        initialData={editingPkg}
      />
    </div>
  );
}

/* =========================================================================
   STEP 5 — FINANCES
   ========================================================================= */
function Step5Finances({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step5Finances")}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.whatIsYourMonthlyIncome")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.setAGoalToTrack")}
        </p>
      </div>

      {/* Monthly Goal Input */}
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-extrabold text-stone-400 text-lg">
          R$
        </span>
        <input
          type="text"
          value={data.monthlyGoal}
          onChange={(e) => updateData("monthlyGoal", e.target.value)}
          placeholder="12.000"
          className="w-full h-14 pl-12 pr-4 rounded-2xl border border-stone-300 bg-white text-stone-900 font-extrabold text-xl focus:outline-none focus:ring-2 focus:ring-emerald-700 shadow-sm"
        />
      </div>

      {/* Monthly Expense Input */}
      <div className="space-y-2 pt-4 border-t border-stone-200/70">
        <label className="block text-sm font-bold text-stone-800 font-outfit">
          {t("onboardingUi.approximatelyHowMuchDoYou")}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-stone-400 text-sm">
            R$
          </span>
          <input
            type="text"
            value={data.monthlyExpense}
            onChange={(e) => updateData("monthlyExpense", e.target.value)}
            placeholder={t("onboardingUi.optionalAmountPh")}
            className="w-full h-12 pl-12 pr-4 rounded-2xl border border-stone-300 bg-white text-stone-800 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <p className="text-xs text-stone-500 font-medium">
          {t("onboardingUi.donTWorryIfYou")}
        </p>
      </div>

      {/* Hourly Rate Question */}
      <div className="space-y-4 pt-4 border-t border-stone-200/70">
        <label className="block text-sm font-bold text-stone-800 font-outfit">
          {t("onboardingUi.doYouKnowYourHourly")}
        </label>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => updateData("knowsHourlyRate", true)}
            className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
              data.knowsHourlyRate === true
                ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
            }`}
          >
            {t("onboardingUi.yes")}
          </button>
          <button
            type="button"
            onClick={() => updateData("knowsHourlyRate", false)}
            className={`flex-1 py-3 px-4 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
              data.knowsHourlyRate === false
                ? "bg-[#163020] text-[#F4EBE1] border-[#163020]"
                : "bg-white text-stone-700 border-stone-300 hover:bg-stone-50"
            }`}
          >
            {t("onboardingUi.no")}
          </button>
        </div>

        {data.knowsHourlyRate === true && (
          <div className="relative pt-2">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-stone-400 text-sm">
              R$ / hora
            </span>
            <input
              type="text"
              value={data.hourlyRate}
              onChange={(e) => updateData("hourlyRate", e.target.value)}
              placeholder="120"
              className="w-full h-12 pl-24 pr-4 rounded-2xl border border-stone-300 bg-white text-stone-800 font-bold text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   STEP 6 — PAYMENTS
   ========================================================================= */
function Step6Payments({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  const togglePaymentMethod = (methodId: string) => {
    let next: string[];
    if (data.paymentMethods.includes(methodId)) {
      next = data.paymentMethods.filter((m) => m !== methodId);
    } else {
      next = [...data.paymentMethods, methodId];
    }
    updateData("paymentMethods", next);
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step6Payments")}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.howDoYourStudentsUsually")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.weWillAutomaticallyCreatePayment")}
        </p>
      </div>

      {/* Payment Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PAYMENT_METHOD_OPTIONS.map((methodId) => {
          const selected = data.paymentMethods.includes(methodId);
          return (
            <button
              key={methodId}
              type="button"
              onClick={() => togglePaymentMethod(methodId)}
              className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-bold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <CreditCard className={`h-4 w-4 ${selected ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{formatOnboardingPaymentMethod(methodId, lang)}</span>
              </div>
              <div
                className={`h-5 w-5 rounded-md flex items-center justify-center text-xs transition-colors ${
                  selected ? "bg-emerald-500 text-white" : "border border-stone-300"
                }`}
              >
                {selected && <Check className="h-3.5 w-3.5 stroke-[3]" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   STEP 7 — CONTRACTS
   ========================================================================= */
function Step7Contracts({
  data,
  updateData,
  isPt,
}: {
  data: OnboardingData;
  updateData: <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => void;
  isPt: boolean;
}) {
  const { lang, t } = useLanguage();
  const options: Array<"YES" | "NO" | "Planning to start"> = [
    "YES",
    "NO",
    "Planning to start",
  ];

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {t("onboardingUi.step7Contracts")}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.doYouUseLessonContracts")}
        </h2>
        <p className="text-sm text-stone-500">
          {t("onboardingUi.bloomIncludesReadyMadeTemplates")}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {options.map((optKey) => {
          const selected = data.contractsPreference === optKey;
          return (
            <button
              key={optKey}
              type="button"
              onClick={() => updateData("contractsPreference", optKey)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border text-base font-bold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-md scale-[1.01]"
                  : "bg-white text-stone-800 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className={`h-5 w-5 ${selected ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{formatOnboardingContractPreference(optKey, lang)}</span>
              </div>
              <div
                className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                  selected ? "border-emerald-400 bg-emerald-500" : "border-stone-300"
                }`}
              >
                {selected && <div className="h-2 w-2 rounded-full bg-white" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================================
   FINAL SUMMARY SCREEN
   ========================================================================= */
function StepFinalSummary({ data, isPt }: { data: OnboardingData; isPt: boolean }) {
  const { lang, t } = useLanguage();

  const formattedLanguages = (data.languages || [])
    .map((l) => {
      if (l === "Other" && data.otherLanguage) {
        const otherLabel = formatOnboardingLanguage("Other", lang);
        return `${otherLabel} (${data.otherLanguage})`;
      }
      return formatOnboardingLanguage(l, lang);
    })
    .join(", ") || (t("onboardingUi.notSpecified"));

  const formattedStudents = formatOnboardingStudentRange(data.studentRange, lang);

  const formattedDays = (data.workingDays || [])
    .map((d) => formatWeekdayName(d, lang, true))
    .join(", ") || "-";

  const packagesCount = data.packages ? data.packages.length : 0;
  const formattedPackages = fmt(t("onboardingUi.packageS"), packagesCount);

  const formattedGoal = `R$ ${data.monthlyGoal || "0"}`;

  const formattedTools = (data.managementTools || [])
    .map((toolId) => {
      const label = formatOnboardingManagementTool(toolId, lang);
      if (toolId === "another_platform" && data.otherPlatformText) {
        return `${label} (${data.otherPlatformText})`;
      }
      if (toolId === "other" && data.otherManagementText) {
        return `${label} (${data.otherManagementText})`;
      }
      return label;
    })
    .join(", ") || "-";

  const formattedPaymentMethods = (data.paymentMethods || [])
    .map((method) => formatOnboardingPaymentMethod(method, lang))
    .join(", ") || "-";

  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center space-y-2">
        <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h2 className="text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {t("onboardingUi.everythingIsSet")}
        </h2>
        <p className="text-sm text-stone-600 max-w-sm mx-auto">
          {t("onboardingUi.hereIsASummaryOf")}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        {/* Languages */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.languages")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedLanguages}
          </p>
        </div>

        {/* Students */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.activeStudents")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedStudents}
          </p>
        </div>

        {/* Working Days */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.workingDays")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedDays}
          </p>
        </div>

        {/* Packages */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.packagesCreated")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedPackages}
          </p>
        </div>

        {/* Monthly Goal */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.monthlyGoal")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedGoal}
          </p>
        </div>

        {/* Management Tools */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.managementTools")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedTools}
          </p>
        </div>

        {/* Payment Methods */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-emerald-700" />
            {t("onboardingUi.paymentMethods")}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {formattedPaymentMethods}
          </p>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/lib/supabase";
import { initializeAvailabilityFromOnboarding } from "@/lib/availability-engine";
import { toast } from "sonner";
import {
  Sparkles,
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
} from "lucide-react";

import { OnboardingData, OnboardingPackage, DayAvailability } from "@/types/onboarding";

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

const DAY_LABELS: Record<string, { en: string; pt: string }> = {
  Monday: { en: "Monday", pt: "Segunda-feira" },
  Tuesday: { en: "Tuesday", pt: "Terça-feira" },
  Wednesday: { en: "Wednesday", pt: "Quarta-feira" },
  Thursday: { en: "Thursday", pt: "Quinta-feira" },
  Friday: { en: "Friday", pt: "Sexta-feira" },
  Saturday: { en: "Saturday", pt: "Sábado" },
  Sunday: { en: "Sunday", pt: "Domingo" },
};

const LANGUAGE_OPTIONS = [
  { id: "English", label: { en: "English", pt: "Inglês" } },
  { id: "Spanish", label: { en: "Spanish", pt: "Espanhol" } },
  { id: "French", label: { en: "French", pt: "Francês" } },
  { id: "Italian", label: { en: "Italian", pt: "Italiano" } },
  { id: "German", label: { en: "German", pt: "Alemão" } },
  { id: "Japanese", label: { en: "Japanese", pt: "Japonês" } },
  { id: "Korean", label: { en: "Korean", pt: "Coreano" } },
  { id: "Portuguese", label: { en: "Portuguese", pt: "Português" } },
  { id: "Other", label: { en: "Other", pt: "Outro" } },
];

const MANAGEMENT_OPTIONS = [
  { id: "none", label: { en: "I don't use any system", pt: "Não uso nenhum sistema" } },
  { id: "excel", label: { en: "Excel", pt: "Excel" } },
  { id: "sheets", label: { en: "Google Sheets", pt: "Google Sheets" } },
  { id: "calendar", label: { en: "Google Calendar", pt: "Google Calendar" } },
  { id: "notion", label: { en: "Notion", pt: "Notion" } },
  { id: "trello", label: { en: "Trello", pt: "Trello" } },
  { id: "another_platform", label: { en: "Another platform", pt: "Outra plataforma" } },
  { id: "other", label: { en: "Other", pt: "Outro" } },
];

const STUDENT_RANGE_OPTIONS = [
  { id: "0", label: { en: "I don't have students yet", pt: "Ainda não tenho alunos" } },
  { id: "1-5", label: { en: "1–5 students", pt: "1–5 alunos" } },
  { id: "6-10", label: { en: "6–10 students", pt: "6–10 alunos" } },
  { id: "11-20", label: { en: "11–20 students", pt: "11–20 alunos" } },
  { id: "21-40", label: { en: "21–40 students", pt: "21–40 alunos" } },
  { id: "40+", label: { en: "40+ students", pt: "40+ alunos" } },
];

const LESSON_TYPE_OPTIONS = [
  { id: "Individual", label: { en: "Individual", pt: "Individual" } },
  { id: "Pair", label: { en: "Pair", pt: "Em dupla" } },
  { id: "Group", label: { en: "Group", pt: "Em grupo" } },
];

const PACKAGE_TEMPLATES: OnboardingPackage[] = [
  { id: "tpl-1", name: "Mensal Básico", lessons: 4, price: 350, duration: 60, frequency: "Monthly" },
  { id: "tpl-2", name: "Mensal VIP", lessons: 8, price: 650, duration: 60, frequency: "Monthly" },
  { id: "tpl-3", name: "Curso Completo", lessons: 24, price: 2400, duration: 60, frequency: "total", defaultInstallmentCount: 6 },
];

const PAYMENT_METHOD_OPTIONS = [
  { id: "PIX", label: { en: "PIX", pt: "PIX" } },
  { id: "Bank transfer", label: { en: "Bank transfer", pt: "Transferência Bancária" } },
  { id: "Credit card", label: { en: "Credit card", pt: "Cartão de Crédito" } },
  { id: "Debit card", label: { en: "Debit card", pt: "Cartão de Débito" } },
  { id: "Cash", label: { en: "Cash", pt: "Dinheiro / Espécie" } },
  { id: "Invoice (Boleto)", label: { en: "Invoice (Boleto)", pt: "Boleto Bancário" } },
  { id: "Other", label: { en: "Other", pt: "Outro" } },
];

const INITIAL_DATA: OnboardingData = {
  languages: ["English"],
  otherLanguage: "",
  managementTool: "none",
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
  lessonTypes: ["Individual"],
  packages: [
    { id: "pkg-1", name: "Mensal Básico", lessons: 4, price: 350, duration: 60, frequency: "Monthly" },
    { id: "pkg-2", name: "Curso Completo", lessons: 24, price: 2400, duration: 60, frequency: "total", defaultInstallmentCount: 6 },
  ],
  monthlyGoal: "12000",
  monthlyExpense: "",
  knowsHourlyRate: null,
  hourlyRate: "",
  paymentMethods: ["PIX", "Credit card"],
  contractsPreference: "YES",
};

export function OnboardingPage() {
  const { user, session, loading: authLoading, signOut, updateProfileState } = useAuth();
  const { lang } = useLanguage();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const savedStep = localStorage.getItem("bloom.onboarding.step");
      if (savedStep) {
        const parsed = parseInt(savedStep, 10);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 8) return parsed;
      }
    }
    return 0; // 0 = Welcome Introduction
  });

  const [data, setData] = useState<OnboardingData>(() => {
    try {
      const savedDraft = localStorage.getItem("bloom.onboarding.draft");
      if (savedDraft) {
        return JSON.parse(savedDraft);
      }
    } catch (e) {
      console.warn("Could not restore draft onboarding state", e);
    }
    return INITIAL_DATA;
  });

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

  // Fetch saved onboarding answers from Supabase on mount if available
  useEffect(() => {
    const userId = user?.id || session?.user?.id;
    if (!userId) return;

    let isMounted = true;
    async function loadSavedOnboarding() {
      try {
        const { data: record } = await supabase
          .from("onboarding")
          .select("answers")
          .eq("teacher_id", userId)
          .maybeSingle();

        if (record?.answers && isMounted) {
          const { status, current_step, updated_at, ...savedAnswers } = record.answers;
          if (savedAnswers && Object.keys(savedAnswers).length > 0) {
            setData((prev) => ({ ...prev, ...savedAnswers }));
          }
          if (typeof current_step === "number" && current_step >= 0 && current_step <= 8) {
            const localStep = localStorage.getItem("bloom.onboarding.step");
            if (!localStep) {
              setCurrentStep(current_step);
            }
          }
        }
      } catch (err) {
        console.warn("[Onboarding] Error restoring remote answers:", err);
      }
    }

    loadSavedOnboarding();
    return () => {
      isMounted = false;
    };
  }, [user, session]);

  // Save progress automatically to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("bloom.onboarding.draft", JSON.stringify(data));
      localStorage.setItem("bloom.onboarding.step", String(currentStep));
    } catch (e) {
      console.warn("Draft auto-save error:", e);
    }
  }, [data, currentStep]);

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
    try {
      await supabase.from("onboarding").upsert(
        {
          teacher_id: userId,
          answers: {
            ...data,
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
      isPt
        ? "Você pode retomar a personalização a qualquer momento."
        : "You can resume setup anytime from your dashboard."
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

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          onboarding_completed: true,
          languages_taught: finalLanguages,
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
            management_tool: data.managementTool,
            student_range: data.studentRange,
            working_days: data.workingDays,
            same_availability_all_days: data.sameAvailabilityAllDays,
            unified_availability: data.unifiedAvailability,
            custom_availability: data.customAvailability,
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
          lessons: pkg.lessons || 4,
          duration: pkg.duration || 60,
          frequency: pkg.frequency || "Monthly",
          default_installment_count: pkg.defaultInstallmentCount || 1,
          method: "Pix",
        }));

        const { error: pkgError } = await supabase.from("packages").insert(pkgRows);
        if (pkgError) {
          console.warn("[Onboarding] Packages insert warning:", pkgError.message);
        }
      }

      // 4. Populate business_goals table for monthly revenue goal
      if (data.monthlyGoal) {
        const goalValue = parseFloat(data.monthlyGoal.replace(/[^0-9.]/g, "")) || 12000;
        const { error: goalError } = await supabase.from("business_goals").insert({
          teacher_id: userId,
          title: isPt ? "Meta de Faturamento Mensal" : "Monthly Revenue Goal",
          target_value: goalValue,
          current_value: 0,
          metric_name: "monthly_revenue",
        });
        if (goalError) {
          console.warn("[Onboarding] Business goals insert warning:", goalError.message);
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

      // Initialize working availability from onboarding answers (safe: preserves existing if set)
      const availRes = await initializeAvailabilityFromOnboarding(userId, data);
      if (!availRes.success) {
        console.warn("[Onboarding] Working availability initialization warning:", availRes.error);
      }

      // 6. Update local and AuthProvider state
      updateProfileState({ onboarding_completed: true, onboarding_status: "completed" });
      if (typeof window !== "undefined") {
        localStorage.setItem("bloom.onboarding.completed", "true");
        localStorage.removeItem("bloom.onboarding.draft");
        localStorage.removeItem("bloom.onboarding.skipped");
        localStorage.removeItem("bloom.onboarding.step");
      }

      setIsSuccessView(true);
    } catch (err: any) {
      console.error("[Onboarding] Finalization error:", err);
      toast.error(
        isPt
          ? "Não conseguimos salvar suas informações. Tente novamente."
          : "Could not save your setup. Please try again."
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
                  {isPt ? "Boas-vindas" : "Welcome"}
                </span>
              )}
              {!isWelcomeStep && !isSummaryStep && (
                <span className="text-xs sm:text-sm font-semibold text-stone-500 font-outfit">
                  {isPt ? `Passo ${currentStep} de ${totalSteps}` : `Step ${currentStep} of ${totalSteps}`}
                </span>
              )}
              {isSummaryStep && (
                <span className="text-xs sm:text-sm font-semibold text-emerald-800 font-outfit bg-emerald-100/70 px-2.5 py-0.5 rounded-full">
                  {isPt ? "Resumo do Bloom" : "Bloom Summary"}
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
                {isPt ? "Pular" : "Skip"}
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
              <Sparkles className="h-8 w-8 text-emerald-800" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-extrabold font-outfit text-[#163020]">
                {isPt ? "Pronto! Sua Bloom começou a florescer. 🌱" : "All set! Your Bloom has started to flourish. 🌱"}
              </h2>
              <p className="text-base text-stone-600 font-medium leading-relaxed">
                {isPt
                  ? "Preparamos sua experiência com base nas informações que você compartilhou."
                  : "We've tailored your experience based on the details you shared."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate({ to: "/" })}
              className="w-full flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-extrabold text-base shadow-lg transition-all cursor-pointer"
            >
              <span>{isPt ? "Entrar na Bloom" : "Enter Bloom"}</span>
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
                    <span>{isPt ? "Voltar" : "Back"}</span>
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
                    <span>{isPt ? "Continuar" : "Continue"}</span>
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
                        <Sparkles className="h-5 w-5 animate-spin" />
                        {isPt ? "Preparando seu Bloom..." : "Preparing your Bloom..."}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        {isPt ? "Preparar meu Bloom" : "Prepare my Bloom"}
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
                {isPt ? "Quer mesmo pular esta etapa?" : "Are you sure you want to skip?"}
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                {isPt
                  ? "A Bloom usa essas informações para personalizar sua agenda, seus serviços, metas e outras áreas da plataforma. Você pode configurar tudo depois, mas algumas partes da Bloom poderão aparecer vazias ou menos personalizadas até que essas informações sejam preenchidas."
                  : "Bloom uses this information to customize your schedule, services, goals, and other platform areas. You can configure everything later, but some features may appear empty or unpersonalized until completed."}
              </p>
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSkipWarningModal(false)}
                className="w-full h-12 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-sm shadow-sm transition-colors cursor-pointer"
              >
                {isPt ? "Continuar personalizando" : "Continue personalizing"}
              </button>
              <button
                type="button"
                onClick={handleConfirmSkip}
                className="w-full h-11 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 font-bold text-xs text-stone-600 transition-colors cursor-pointer"
              >
                {isPt ? "Pular por enquanto" : "Skip for now"}
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
                {isPt ? "Pular hora-aula?" : "Skip hourly rate?"}
              </h3>
              <p className="text-sm text-stone-600 leading-relaxed">
                {isPt
                  ? "Sua hora-aula ajuda o Bloom a gerar relatórios e insights financeiros mais precisos. Você pode pular isso agora, mas adicionar essa informação vai melhorar sua experiência."
                  : "Your hourly rate helps Bloom generate more accurate reports and financial insights. You can skip this now, but adding it will improve your experience."}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowHourlySkipModal(false)}
                className="w-full h-11 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 font-bold text-sm text-stone-700 transition-colors cursor-pointer"
              >
                {isPt ? "Voltar" : "Go back"}
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
                {isPt ? "Pular por enquanto" : "Skip for now"}
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
  return (
    <div className="space-y-8 text-center max-w-lg mx-auto py-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="h-16 w-16 mx-auto rounded-3xl bg-[#163020] flex items-center justify-center text-[#F4EBE1] font-outfit font-black text-2xl shadow-md">
        B
      </div>

      <div className="space-y-3">
        <h1 className="text-3xl sm:text-4xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Boas-vindas à Bloom 🌱" : "Welcome to Bloom 🌱"}
        </h1>
        <p className="text-base text-stone-700 font-medium leading-relaxed">
          {isPt
            ? "Antes de começar, queremos conhecer um pouquinho sobre você e sobre a forma como trabalha."
            : "Before starting, we'd love to learn a bit about you and how you work."}
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-white/80 p-5 space-y-3 shadow-sm text-left">
        <p className="text-sm text-stone-600 leading-relaxed font-medium">
          {isPt
            ? "São algumas perguntas rápidas que vão nos ajudar a preparar a Bloom para a sua rotina — seus idiomas, horários, serviços e objetivos."
            : "These quick questions will help prepare Bloom for your daily routine — your languages, schedule, services, and goals."}
        </p>
        <p className="text-sm text-stone-600 leading-relaxed font-medium pt-2 border-t border-stone-100">
          {isPt
            ? "Quanto mais conhecermos o seu trabalho, menos configurações você terá que fazer depois."
            : "The more we know about your work, the fewer settings you'll need to adjust later."}
        </p>
      </div>

      <div className="space-y-4 pt-2">
        <p className="text-xs text-stone-500 font-semibold">
          {isPt
            ? "Não se preocupe: essas informações poderão ser alteradas depois."
            : "Don't worry: you can edit these details anytime in your settings."}
        </p>

        <button
          type="button"
          onClick={onStart}
          className="w-full flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-base shadow-md transition-all cursor-pointer"
        >
          <span>{isPt ? "Personalizar minha Bloom" : "Customize my Bloom"}</span>
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
          {isPt ? "Passo 1 — Sobre você" : "Step 1 — About you"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Quais idiomas você ensina?" : "What language(s) do you teach?"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt
            ? "Selecione todos os idiomas que você ensina nas suas aulas."
            : "Select all languages you teach."}
        </p>
      </div>

      {/* Languages Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {LANGUAGE_OPTIONS.map((opt) => {
          const selected = data.languages.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleLanguage(opt.id)}
              className={`flex items-center justify-between p-3.5 rounded-2xl border text-sm font-semibold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
              }`}
            >
              <span>{isPt ? opt.label.pt : opt.label.en}</span>
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
            {isPt ? "Especifique o outro idioma:" : "Specify other language:"}
          </label>
          <input
            type="text"
            value={data.otherLanguage || ""}
            onChange={(e) => updateData("otherLanguage", e.target.value)}
            placeholder={isPt ? "ex: Mandarim, Alemão Suíço" : "e.g. Mandarin, Russian"}
            className="w-full h-11 px-4 rounded-xl border border-stone-300 bg-white text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-sm"
          />
        </div>
      )}

      {/* Second Question */}
      <div className="space-y-4 pt-4 border-t border-stone-200/70">
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-outfit text-stone-900">
            {isPt
              ? "Como você gerencia seu negócio de aulas atualmente?"
              : "How do you currently manage your teaching business?"}
          </h3>
          <p className="text-xs text-stone-500">
            {isPt ? "Usado para personalizar suas integrações e analytics." : "Used for analytics and setup customization."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {MANAGEMENT_OPTIONS.map((opt) => {
            const selected = data.managementTool === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => updateData("managementTool", opt.id)}
                className={`flex items-center gap-3 p-3.5 rounded-2xl border text-sm font-semibold transition-all text-left cursor-pointer ${
                  selected
                    ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                    : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50/50"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                    selected ? "border-emerald-400 bg-emerald-500" : "border-stone-400"
                  }`}
                >
                  {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-xs sm:text-sm">{isPt ? opt.label.pt : opt.label.en}</span>
              </button>
            );
          })}
        </div>
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
  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {isPt ? "Passo 2 — Seu Negócio" : "Step 2 — Your Business"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Quantos alunos ativos você tem atualmente?" : "How many active students do you currently have?"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt
            ? "Essa informação ajusta o volume do seu painel e relatórios."
            : "This configures your dashboard volume and metrics."}
        </p>
      </div>

      {/* Options List */}
      <div className="space-y-3">
        {STUDENT_RANGE_OPTIONS.map((opt) => {
          const selected = data.studentRange === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateData("studentRange", opt.id)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border text-base font-semibold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-md scale-[1.01]"
                  : "bg-white text-stone-800 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Users className={`h-5 w-5 ${selected ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{isPt ? opt.label.pt : opt.label.en}</span>
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
          {isPt ? "Passo 3 — Sua Agenda" : "Step 3 — Your Schedule"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Quais dias da semana você trabalha?" : "Select your working days"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt ? "Marque os dias em que você costuma dar aulas." : "Check the days you usually teach."}
        </p>
      </div>

      {/* Days Selection — Uniform 7-column grid */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {[
          { id: "Monday", short: "Seg", fullPt: "Segunda-feira", fullEn: "Monday" },
          { id: "Tuesday", short: "Ter", fullPt: "Terça-feira", fullEn: "Tuesday" },
          { id: "Wednesday", short: "Qua", fullPt: "Quarta-feira", fullEn: "Wednesday" },
          { id: "Thursday", short: "Qui", fullPt: "Quinta-feira", fullEn: "Thursday" },
          { id: "Friday", short: "Sex", fullPt: "Sexta-feira", fullEn: "Friday" },
          { id: "Saturday", short: "Sáb", fullPt: "Sábado", fullEn: "Saturday" },
          { id: "Sunday", short: "Dom", fullPt: "Domingo", fullEn: "Sunday" },
        ].map((w) => {
          const selected = data.workingDays.includes(w.id);
          return (
            <button
              key={w.id}
              type="button"
              onClick={() => toggleDay(w.id)}
              title={isPt ? w.fullPt : w.fullEn}
              className={`flex flex-col items-center justify-center h-13 sm:h-14 rounded-2xl border text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm scale-[1.02]"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <span>{w.short}</span>
            </button>
          );
        })}
      </div>

      {/* Same availability question */}
      {data.workingDays.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-stone-200/70">
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-bold font-outfit text-stone-900">
              {isPt
                ? "Você costuma ter a mesma disponibilidade em todos os dias selecionados?"
                : "Do you usually have the same availability on all selected days?"}
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
                {isPt ? "SIM" : "YES"}
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
                {isPt ? "NÃO" : "NO"}
              </button>
            </div>
          </div>

          {/* Unified availability editor */}
          {data.sameAvailabilityAllDays ? (
            <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-2">
              <span className="text-xs font-bold text-stone-500 uppercase">
                {isPt ? "Horário padrão para todos os dias" : "Standard time for all days"}
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
                {isPt ? "Configurar cada dia individualmente:" : "Configure each day separately:"}
              </span>
              {data.workingDays.map((day) => {
                const avail = data.customAvailability[day] || { startTime: "09:00", endTime: "18:00" };
                return (
                  <div
                    key={day}
                    className="flex items-center justify-between p-3.5 bg-white rounded-2xl border border-stone-200"
                  >
                    <span className="text-sm font-bold text-stone-800">
                      {isPt ? DAY_LABELS[day].pt : DAY_LABELS[day].en}
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
  const [pkgName, setPkgName] = useState("");
  const [pkgLessons, setPkgLessons] = useState<number>(4);
  const [pkgPrice, setPkgPrice] = useState<string>("");
  const [pkgFreq, setPkgFreq] = useState<"Monthly" | "total">("Monthly");
  const [pkgInstallments, setPkgInstallments] = useState<number>(6);

  const toggleLessonType = (typeId: string) => {
    let next: string[];
    if (data.lessonTypes.includes(typeId)) {
      next = data.lessonTypes.filter((t) => t !== typeId);
    } else {
      next = [...data.lessonTypes, typeId];
    }
    updateData("lessonTypes", next);
  };

  const handleAddTemplate = (tpl: OnboardingPackage) => {
    if (data.packages.some((p) => p.name === tpl.name)) return;
    updateData("packages", [...data.packages, { ...tpl, id: `pkg-${Date.now()}` }]);
  };

  const handleAddCustomPackage = () => {
    if (!pkgName.trim()) return;
    const priceNum = parseFloat(pkgPrice.replace(/[^0-9.]/g, "")) || 0;
    const newPkg: OnboardingPackage = {
      id: `pkg-${Date.now()}`,
      name: pkgName.trim(),
      lessons: pkgLessons || 1,
      price: priceNum,
      duration: 60,
      frequency: pkgFreq,
      defaultInstallmentCount: pkgFreq === "total" ? (pkgInstallments || 1) : 1,
    };
    updateData("packages", [...data.packages, newPkg]);
    setPkgName("");
    setPkgPrice("");
  };

  const handleRemovePackage = (pkgId: string) => {
    updateData(
      "packages",
      data.packages.filter((p) => p.id !== pkgId)
    );
  };

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {isPt ? "Passo 4 — Planos e Pacotes" : "Step 4 — Plans & Packages"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Que tipo de aulas você oferece?" : "What type of lessons do you offer?"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt ? "Selecione todas as modalidades que aceita." : "Select all lesson modalities."}
        </p>
      </div>

      {/* Lesson Types */}
      <div className="grid grid-cols-3 gap-3">
        {LESSON_TYPE_OPTIONS.map((opt) => {
          const selected = data.lessonTypes.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => toggleLessonType(opt.id)}
              className={`p-3.5 rounded-2xl border text-center font-bold text-sm transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300"
              }`}
            >
              {isPt ? opt.label.pt : opt.label.en}
            </button>
          );
        })}
      </div>

      {/* Packages Builder */}
      <div className="space-y-5 pt-4 border-t border-stone-200/70">
        <div className="space-y-1">
          <h3 className="text-lg font-bold font-outfit text-stone-900">
            {isPt ? "Crie seus pacotes de aulas" : "Create your lesson packages"}
          </h3>
          <p className="text-xs text-stone-500">
            {isPt
              ? "Esses pacotes irão popular o catálogo de pacotes do seu Bloom."
              : "These will immediately populate your Packages catalog."}
          </p>
        </div>

        {/* Quick add templates */}
        <div className="space-y-2">
          <span className="text-xs font-bold text-stone-500 uppercase">
            {isPt ? "Sugestões de pacotes rápidos:" : "Quick package templates:"}
          </span>
          <div className="flex flex-wrap gap-2">
            {PACKAGE_TEMPLATES.map((tpl) => {
              const exists = data.packages.some((p) => p.name === tpl.name);
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleAddTemplate(tpl)}
                  disabled={exists}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    exists
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300 opacity-80 cursor-default"
                      : "bg-white text-stone-700 border-stone-300 hover:bg-stone-100"
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>
                    {tpl.name} ({tpl.lessons} {isPt ? "aulas" : "lessons"} • R$ {tpl.price}{tpl.frequency === "total" ? (isPt ? " total" : " total") : "/mês"})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Packages List */}
        <div className="space-y-2.5">
          {data.packages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex items-center justify-between p-4 bg-white rounded-2xl border border-stone-200 shadow-sm"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-900 text-base">{pkg.name}</span>
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                    {pkg.frequency === "total" ? (isPt ? "Valor Total" : "Total Value") : (isPt ? "Mensalidade" : "Monthly")}
                  </span>
                </div>
                <div className="text-xs text-stone-500 font-semibold">
                  {pkg.lessons} {isPt ? "aulas" : "lessons"} • R$ {pkg.price.toLocaleString("pt-BR")}
                  {pkg.frequency === "total" ? (
                    pkg.defaultInstallmentCount && pkg.defaultInstallmentCount > 1
                      ? ` (${isPt ? "sugestão de até" : "suggested up to"} ${pkg.defaultInstallmentCount}x)`
                      : ` (${isPt ? "valor total" : "total value"})`
                  ) : (
                    isPt ? " /mês" : " /mo"
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemovePackage(pkg.id)}
                className="p-2 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {/* Add Custom Package form */}
        <div className="p-4 bg-stone-100/70 rounded-2xl border border-stone-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 uppercase">
              {isPt ? "Adicionar pacote personalizado:" : "Add custom package:"}
            </span>
            {/* Frequency Selector Toggle */}
            <div className="flex gap-1.5 bg-white p-1 rounded-xl border border-stone-200 text-xs">
              <button
                type="button"
                onClick={() => setPkgFreq("Monthly")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  pkgFreq === "Monthly"
                    ? "bg-[#163020] text-white shadow-xs"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {isPt ? "Mensalidade" : "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => setPkgFreq("total")}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  pkgFreq === "total"
                    ? "bg-[#163020] text-white shadow-xs"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {isPt ? "Valor Total" : "Total Course"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <input
              type="text"
              placeholder={isPt ? "Nome (ex: Mensal Básico)" : "Name (e.g. Monthly Basic)"}
              value={pkgName}
              onChange={(e) => setPkgName(e.target.value)}
              className="h-10 px-3 rounded-xl border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <input
              type="number"
              placeholder={isPt ? "Nº de aulas" : "No. of lessons"}
              value={pkgLessons}
              onChange={(e) => setPkgLessons(parseInt(e.target.value) || 0)}
              className="h-10 px-3 rounded-xl border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <input
              type="text"
              placeholder={pkgFreq === "total" ? (isPt ? "Valor total (R$ 2.400)" : "Total value (2400)") : (isPt ? "Preço mensal (R$ 350)" : "Monthly price (350)")}
              value={pkgPrice}
              onChange={(e) => setPkgPrice(e.target.value)}
              className="h-10 px-3 rounded-xl border border-stone-300 bg-white text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
          </div>

          {pkgFreq === "total" && (
            <div className="flex items-center gap-3 pt-1">
              <label className="text-xs font-semibold text-stone-600">
                {isPt ? "Sugestão de parcelamento padrão:" : "Suggested default installments:"}
              </label>
              <input
                type="number"
                min={1}
                max={24}
                value={pkgInstallments}
                onChange={(e) => setPkgInstallments(parseInt(e.target.value) || 1)}
                className="w-20 h-9 px-2 rounded-xl border border-stone-300 bg-white text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 text-center"
              />
              <span className="text-xs text-stone-400 font-medium">
                {isPt ? "parcelas (definido por aluno)" : "installments (chosen per student)"}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleAddCustomPackage}
            className="w-full h-10 rounded-xl bg-[#163020] text-[#F4EBE1] font-bold text-xs hover:bg-[#1a3825] transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span>{isPt ? "Adicionar Pacote" : "Add Package"}</span>
          </button>
        </div>
      </div>
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
  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {isPt ? "Passo 5 — Finanças" : "Step 5 — Finances"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Qual é a sua meta de faturamento mensal?" : "What is your monthly income goal?"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt
            ? "Defina uma meta para acompanhar seu progresso no painel."
            : "Set a goal to track progress on your dashboard."}
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
          {isPt
            ? "Aproximadamente quanto você gasta por mês para manter seu negócio?"
            : "Approximately how much do you spend each month running your business?"}
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-stone-400 text-sm">
            R$
          </span>
          <input
            type="text"
            value={data.monthlyExpense}
            onChange={(e) => updateData("monthlyExpense", e.target.value)}
            placeholder="500 (opcional)"
            className="w-full h-12 pl-12 pr-4 rounded-2xl border border-stone-300 bg-white text-stone-800 font-semibold text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <p className="text-xs text-stone-500 font-medium">
          {isPt
            ? "Não se preocupe se não tiver certeza. Você pode alterar essa informação a qualquer momento."
            : "Don't worry if you're not sure. You can change this information at any time."}
        </p>
      </div>

      {/* Hourly Rate Question */}
      <div className="space-y-4 pt-4 border-t border-stone-200/70">
        <label className="block text-sm font-bold text-stone-800 font-outfit">
          {isPt ? "Você sabe qual é o valor da sua hora-aula?" : "Do you know your hourly lesson rate?"}
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
            {isPt ? "SIM" : "YES"}
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
            {isPt ? "NÃO" : "NO"}
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
          {isPt ? "Passo 6 — Pagamentos" : "Step 6 — Payments"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Como seus alunos costumam te pagar?" : "How do your students usually pay you?"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt
            ? "Criaremos automaticamente as tags e formas de pagamento selecionadas."
            : "We will automatically create payment tags for selected options."}
        </p>
      </div>

      {/* Payment Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PAYMENT_METHOD_OPTIONS.map((opt) => {
          const selected = data.paymentMethods.includes(opt.id);
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => togglePaymentMethod(opt.id)}
              className={`flex items-center justify-between p-4 rounded-2xl border text-sm font-bold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
                  : "bg-white text-stone-700 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <CreditCard className={`h-4 w-4 ${selected ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{isPt ? opt.label.pt : opt.label.en}</span>
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
  const options: Array<{ id: "YES" | "NO" | "Planning to start"; label: { en: string; pt: string } }> = [
    { id: "YES", label: { en: "YES", pt: "SIM" } },
    { id: "NO", label: { en: "NO", pt: "NÃO" } },
    { id: "Planning to start", label: { en: "Planning to start", pt: "Planejo começar" } },
  ];

  return (
    <div className="space-y-8">
      {/* Title */}
      <div className="space-y-2">
        <span className="text-xs font-bold text-emerald-800 tracking-wider uppercase font-outfit">
          {isPt ? "Passo 7 — Contratos" : "Step 7 — Contracts"}
        </span>
        <h2 className="text-2xl sm:text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Você utiliza contratos de aulas?" : "Do you use lesson contracts?"}
        </h2>
        <p className="text-sm text-stone-500">
          {isPt
            ? "O Bloom possui modelos prontos e gestão de contratos."
            : "Bloom includes ready-made templates and contract tracking."}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-3">
        {options.map((opt) => {
          const selected = data.contractsPreference === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => updateData("contractsPreference", opt.id)}
              className={`w-full flex items-center justify-between p-4 rounded-2xl border text-base font-bold transition-all cursor-pointer ${
                selected
                  ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-md scale-[1.01]"
                  : "bg-white text-stone-800 border-stone-200 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className={`h-5 w-5 ${selected ? "text-emerald-400" : "text-stone-400"}`} />
                <span>{isPt ? opt.label.pt : opt.label.en}</span>
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
  return (
    <div className="space-y-6">
      {/* Title */}
      <div className="text-center space-y-2">
        <div className="h-12 w-12 rounded-2xl bg-emerald-100 text-emerald-800 mx-auto flex items-center justify-center">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-3xl font-extrabold font-outfit text-stone-900 tracking-tight">
          {isPt ? "Tudo pronto!" : "Everything is set!"}
        </h2>
        <p className="text-sm text-stone-600 max-w-sm mx-auto">
          {isPt
            ? "Veja o resumo de como seu Bloom foi configurado. Você pode alterar qualquer informação depois em Configurações."
            : "Here is a summary of your Bloom setup. You can modify any setting later in Settings."}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
        {/* Languages */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-emerald-700" />
            {isPt ? "Idiomas" : "Languages"}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {data.languages.join(", ") || (isPt ? "Não especificado" : "Not specified")}
          </p>
        </div>

        {/* Students */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-emerald-700" />
            {isPt ? "Alunos Ativos" : "Active Students"}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {STUDENT_RANGE_OPTIONS.find((s) => s.id === data.studentRange)?.label[isPt ? "pt" : "en"] ||
              data.studentRange}
          </p>
        </div>

        {/* Working Days */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-emerald-700" />
            {isPt ? "Dias de Trabalho" : "Working Days"}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {data.workingDays.map((d) => (isPt ? DAY_LABELS[d]?.pt?.substring(0, 3) : d.substring(0, 3))).join(", ") ||
              "-"}
          </p>
        </div>

        {/* Packages */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-emerald-700" />
            {isPt ? "Pacotes Criados" : "Packages Created"}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {data.packages.length} {isPt ? "pacote(s)" : "package(s)"}
          </p>
        </div>

        {/* Monthly Goal */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-700" />
            {isPt ? "Meta Mensal" : "Monthly Goal"}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            R$ {data.monthlyGoal || "0"}
          </p>
        </div>

        {/* Payment Methods */}
        <div className="p-4 bg-white rounded-2xl border border-stone-200 space-y-1">
          <span className="text-xs font-bold text-stone-400 uppercase font-outfit flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5 text-emerald-700" />
            {isPt ? "Formas de Pagamento" : "Payment Methods"}
          </span>
          <p className="font-bold text-stone-800 text-sm">
            {data.paymentMethods.join(", ") || "-"}
          </p>
        </div>
      </div>
    </div>
  );
}

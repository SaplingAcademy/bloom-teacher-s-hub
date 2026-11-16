import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BloomLogo } from "@/components/bloom/Logo";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { onboardingGate } from "@/lib/onboarding-status";
import { cn } from "@/lib/utils";
import {
  DIAGNOSTIC_STEPS, DiagnosticError, TEXT_MAX, acceptDiagnosticConsent, completeDiagnostic, fetchMyDiagnostic, isVisible,
  missingInStep, saveDiagnosticStep, stepOf, stepPayload, type Answers, type Question,
} from "@/lib/teacher-diagnostic";

const TOTAL = DIAGNOSTIC_STEPS.length;

/** Questions of a step currently shown (conditionals appear only when their condition holds). */
const visibleIn = (step: number, answers: Answers) => (DIAGNOSTIC_STEPS[step - 1]?.questions ?? []).filter((q) => isVisible(q, answers));
const keysOf = (question: Question) => (question.type === "multi" ? [question.id, question.otherKey] : [question.id]);

/**
 * Diagnóstico Inicial (/diagnostico): welcome + mandatory consent, then the 5 steps shown one
 * question at a time. Moving between questions of a step is local state only; the step is saved
 * once on its last "Continue" (same RPC and payload as before) and resumed from the saved step.
 * The platform stays closed until the database marks it completed; load or save failures show an
 * error with retry and never grant access. No Bloom feature content is shown.
 */
export function DiagnosticFlow() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, loading: authLoading, profile, error: authError, signOut, updateProfileState } = useAuth();
  const gate = onboardingGate({ loading: authLoading, error: authError, profile });
  const state = useQuery({ queryKey: ["teacher-diagnostic", user?.id], enabled: Boolean(user), retry: false, staleTime: Infinity, queryFn: fetchMyDiagnostic });
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0); // 0 = welcome/consent
  const [index, setIndex] = useState(0); // question within the step (local only)
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { if (!authLoading && !user) void navigate({ to: "/auth", replace: true }); }, [authLoading, user, navigate]);
  // Accounts that do not need the diagnosis (exempt, completed, super_admin) continue normally.
  useEffect(() => {
    if (state.data && !state.data.required) {
      updateProfileState({ diagnostic_required: false });
      void navigate({ to: profile?.onboarding_completed || profile?.onboarding_status === "skipped" ? "/" : "/onboarding", replace: true });
    }
  }, [state.data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Resume: saved answers and step (only once, from the database), first question of the step.
  useEffect(() => {
    if (!state.data?.required || hydrated) return;
    setAnswers(state.data.answers ?? {});
    setStep(state.data.consent_accepted_at ? state.data.current_step : 0);
    setIndex(0);
    setHydrated(true);
  }, [state.data, hydrated]);

  const questions = step > 0 ? visibleIn(step, answers) : [];
  const safeIndex = Math.min(index, Math.max(0, questions.length - 1));
  const question = questions[safeIndex];
  const stepMissing = step > 0 ? missingInStep(answers, step) : [];
  const questionMissing = question ? stepMissing.filter((key) => keysOf(question).includes(key)) : [];
  const set = (id: string, value: Answers[string]) => { setAnswers((current) => ({ ...current, [id]: value })); setSaveError(null); };
  const leave = () => void signOut();
  const goTo = (nextStep: number, nextIndex: number) => { setStep(nextStep); setIndex(nextIndex); setShowErrors(false); window.scrollTo?.({ top: 0 }); };

  const errorText = (error: unknown) => {
    if (error instanceof DiagnosticError && error.code === "diagnostic_closed") return t("diagnostic.closedError");
    if (error instanceof DiagnosticError && error.code === "diagnostic_incomplete") return t("diagnostic.completeError");
    return t("diagnostic.saveError");
  };

  const start = async () => {
    if (!consent) { setConsentError(true); return; }
    setBusy(true); setSaveError(null);
    try { await acceptDiagnosticConsent(); goTo(state.data?.current_step ?? 1, 0); }
    catch (error) { setSaveError(errorText(error)); }
    finally { setBusy(false); }
  };

  const next = async () => {
    if (questionMissing.length > 0) { setShowErrors(true); return; }
    // Next question of the same step: local only, nothing is written.
    if (safeIndex < questions.length - 1) { goTo(step, safeIndex + 1); return; }
    if (stepMissing.length > 0) { setIndex(Math.max(0, questions.findIndex((q) => keysOf(q).some((k) => stepMissing.includes(k))))); setShowErrors(true); return; }
    setBusy(true); setSaveError(null);
    try {
      if (step < TOTAL) {
        await saveDiagnosticStep(step + 1, stepPayload(answers, step));
        goTo(step + 1, 0);
      } else {
        await completeDiagnostic(stepPayload(answers, step));
        updateProfileState({ diagnostic_required: false });
        void navigate({ to: profile?.onboarding_completed || profile?.onboarding_status === "skipped" ? "/" : "/onboarding", replace: true });
      }
    } catch (error) {
      if (error instanceof DiagnosticError && error.code === "diagnostic_incomplete" && error.field) {
        const target = stepOf(error.field);
        if (target > 0) {
          const targetIndex = visibleIn(target, answers).findIndex((q) => keysOf(q).includes(error.field!));
          setStep(target); setIndex(Math.max(0, targetIndex)); setShowErrors(true);
        }
      }
      setSaveError(errorText(error));
    } finally { setBusy(false); }
  };

  const back = () => {
    setSaveError(null);
    if (safeIndex > 0) { goTo(step, safeIndex - 1); return; }
    if (step > 1) goTo(step - 1, Math.max(0, visibleIn(step - 1, answers).length - 1));
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <BloomLogo />
          {user && <Button variant="ghost" size="sm" onClick={leave} disabled={busy}>{t("diagnostic.leave")}</Button>}
        </div>
        {children}
      </div>
    </div>
  );

  if (authLoading || !user || (state.isPending && !state.isError) || (state.data?.required && !hydrated) || (state.data && !state.data.required)) {
    return shell(<div className="flex items-center justify-center gap-2 py-20 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{t("diagnostic.loading")}</div>);
  }
  if (state.isError || gate === "error") {
    return shell(
      <div role="alert" className="space-y-4 rounded-2xl border border-destructive/25 bg-card p-6 text-center" data-testid="diagnostic-load-error">
        <p className="text-sm text-destructive">{t("diagnostic.loadError")}</p>
        <Button variant="outline" onClick={() => void state.refetch()}>{t("diagnostic.retry")}</Button>
      </div>,
    );
  }

  if (step === 0) {
    return shell(
      <section className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8" data-testid="diagnostic-intro">
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">{t("diagnostic.title")}</p>
          <h1 className="font-display text-2xl font-semibold leading-tight sm:text-3xl">{t("diagnostic.welcomeTitle")}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{t("diagnostic.welcomeBody")}</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          <li className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5 text-sm" data-testid="diagnostic-estimated-time">
            <Clock className="h-4 w-4 shrink-0 text-primary" aria-hidden />{t("diagnostic.estimatedTime")}
          </li>
          <li className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
            <Save className="h-4 w-4 shrink-0 text-primary" aria-hidden />{t("diagnostic.savedInfo")}
          </li>
        </ul>
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm leading-relaxed text-muted-foreground">{t("diagnostic.intro")}</p>
          <div className="flex items-start gap-3">
            <Checkbox id="diagnostic-consent" checked={consent} onCheckedChange={(value) => { setConsent(value === true); setConsentError(false); }} aria-invalid={consentError} />
            <label htmlFor="diagnostic-consent" className="cursor-pointer text-sm leading-snug">{t("diagnostic.consentLabel")}</label>
          </div>
          {consentError && <p role="alert" className="text-sm text-destructive">{t("diagnostic.consentRequired")}</p>}
        </div>
        {saveError && <p role="alert" className="text-sm text-destructive" data-testid="diagnostic-save-error">{saveError}</p>}
        <div className="flex justify-end">
          <Button size="lg" className="w-full sm:w-auto" onClick={() => void start()} disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{saveError ? t("diagnostic.retry") : t("diagnostic.startDiagnostic")}</Button>
        </div>
      </section>,
    );
  }

  const current = DIAGNOSTIC_STEPS[step - 1];
  // Overall progress across every visible question of the 5 steps.
  const counts = DIAGNOSTIC_STEPS.map((_, i) => visibleIn(i + 1, answers).length);
  const overallTotal = counts.reduce((sum, n) => sum + n, 0);
  const overallDone = counts.slice(0, step - 1).reduce((sum, n) => sum + n, 0) + safeIndex;
  const percent = Math.round((overallDone / Math.max(1, overallTotal)) * 100);
  const isLast = step === TOTAL && safeIndex === questions.length - 1;
  const stepLabel = t("diagnostic.stepLabel").replace("{step}", String(step)).replace("{total}", String(TOTAL));
  return shell(
    <section className="space-y-6" data-testid="diagnostic-step" data-step={step} data-question-index={safeIndex}>
      <header className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm"><span className="font-semibold text-primary">{stepLabel}</span><span className="text-muted-foreground"> · {t(`diagnostic.steps.${current.key}`)}</span></p>
          <span className="text-xs tabular-nums text-muted-foreground">{percent}%</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={stepLabel} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
        </div>
      </header>
      {question && (
        <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-8" key={question.id}>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground" data-testid="diagnostic-question-counter">
            {t("diagnostic.questionCounter").replace("{current}", String(safeIndex + 1)).replace("{total}", String(questions.length))}
          </p>
          <QuestionField question={question} answers={answers} onChange={set} disabled={busy} featured
            error={showErrors ? (questionMissing.includes(question.id) ? "required" : questionMissing.length > 0 ? "other" : null) : null} />
        </div>
      )}
      {saveError && <p role="alert" className="text-sm text-destructive" data-testid="diagnostic-save-error">{saveError}</p>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="lg" onClick={back} disabled={busy || (step === 1 && safeIndex === 0)}>{t("diagnostic.back")}</Button>
        <Button size="lg" onClick={() => void next()} disabled={busy} data-testid="diagnostic-next">
          {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? t("diagnostic.saving") : saveError ? t("diagnostic.retry") : isLast ? t("diagnostic.finish") : t("diagnostic.continue")}
        </Button>
      </div>
    </section>,
  );
}

function QuestionField({ question, answers, onChange, error, disabled, featured = false }: {
  question: Question; answers: Answers; onChange: (id: string, value: Answers[string]) => void; error: "required" | "other" | null; disabled: boolean; featured?: boolean;
}) {
  // One question per screen: the question is the heading and the answers get a comfortable size.
  const legendClass = featured ? "mb-3 font-display text-lg font-semibold leading-snug sm:text-xl" : "mb-1 text-sm font-medium";
  const { t } = useLanguage();
  const id = `diagnostic-${question.id}`;
  const label = t(`diagnostic.q.${question.id}.label`);
  const value = answers[question.id];
  const option = (o: string) => t(`diagnostic.q.${question.id}.options.${o}`);
  const errorNode = error && <p role="alert" className="text-xs text-destructive">{t(error === "other" ? "diagnostic.otherRequired" : "diagnostic.required")}</p>;
  const choice = (selected: boolean) => cn("rounded-xl border text-left text-sm", featured ? "min-h-12 px-4 py-3" : "px-3 py-2", " transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
    selected ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border bg-background hover:bg-muted");

  if (question.type === "single" || question.type === "multi") {
    const selected = question.type === "multi" ? (Array.isArray(value) ? value : []) : [];
    return (
      <fieldset className="space-y-2" data-question={question.id} aria-invalid={Boolean(error)}>
        <legend className={legendClass}>{label}</legend>
        {question.type === "multi" && <p className="text-xs text-muted-foreground">{t("diagnostic.multiHint")}</p>}
        <div role={question.type === "single" ? "radiogroup" : "group"} aria-label={label} className="grid gap-2 sm:grid-cols-2">
          {question.options.map((o) => {
            const isOn = question.type === "single" ? value === o : selected.includes(o);
            return (
              <button key={o} type="button" disabled={disabled} className={choice(isOn)} data-option={o}
                role={question.type === "single" ? "radio" : "checkbox"} aria-checked={isOn}
                onClick={() => onChange(question.id, question.type === "single" ? o : isOn ? selected.filter((v) => v !== o) : [...selected, o])}>
                {option(o)}
              </button>
            );
          })}
        </div>
        {question.type === "multi" && selected.includes("other") && (
          <Input aria-label={`${label} — ${option("other")}`} placeholder={t("diagnostic.otherPlaceholder")} maxLength={TEXT_MAX} disabled={disabled}
            value={String(answers[question.otherKey] ?? "")} onChange={(e) => onChange(question.otherKey, e.target.value)} data-other={question.otherKey} />
        )}
        {errorNode}
      </fieldset>
    );
  }
  if (question.type === "scale") {
    return (
      <fieldset className="space-y-2" data-question={question.id} aria-invalid={Boolean(error)}>
        <legend className={legendClass}>{label}</legend>
        <div role="radiogroup" aria-label={label} className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
          {Array.from({ length: 11 }, (_, n) => (
            <button key={n} type="button" role="radio" aria-checked={value === n} disabled={disabled} data-option={n}
              className={cn(choice(value === n), "px-0 text-center tabular-nums")} onClick={() => onChange(question.id, n)}>{n}</button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground"><span>0 · {t("diagnostic.scaleLow")}</span><span>10 · {t("diagnostic.scaleHigh")}</span></div>
        {errorNode}
      </fieldset>
    );
  }
  return (
    <div className="space-y-1.5" data-question={question.id}>
      <label htmlFor={id} className={featured ? "block font-display text-lg font-semibold leading-snug sm:text-xl" : "text-sm font-medium"}>{label}</label>
      {question.short
        ? <Input id={id} maxLength={TEXT_MAX} disabled={disabled} aria-invalid={Boolean(error)} value={String(value ?? "")} onChange={(e) => onChange(question.id, e.target.value)} />
        : <Textarea id={id} rows={2} maxLength={TEXT_MAX} disabled={disabled} aria-invalid={Boolean(error)} value={String(value ?? "")} onChange={(e) => onChange(question.id, e.target.value)} />}
      <p className="text-[11px] text-muted-foreground">{t("diagnostic.textHint")}</p>
      {errorNode}
    </div>
  );
}

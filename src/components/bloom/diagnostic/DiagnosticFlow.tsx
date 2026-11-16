import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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

/**
 * Diagnóstico Inicial (/diagnostico): consent, then 5 steps saved on "Continue" and resumed from
 * the saved step. The platform stays closed until the database marks it completed; load or save
 * failures show an error with retry and never grant access. No Bloom feature content is shown.
 */
export function DiagnosticFlow() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { user, loading: authLoading, profile, error: authError, signOut, updateProfileState } = useAuth();
  const gate = onboardingGate({ loading: authLoading, error: authError, profile });
  const state = useQuery({ queryKey: ["teacher-diagnostic", user?.id], enabled: Boolean(user), retry: false, staleTime: Infinity, queryFn: fetchMyDiagnostic });
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0); // 0 = intro/consent
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
  // Resume: saved answers and step (only once, from the database).
  useEffect(() => {
    if (!state.data?.required || hydrated) return;
    setAnswers(state.data.answers ?? {});
    setStep(state.data.consent_accepted_at ? state.data.current_step : 0);
    setHydrated(true);
  }, [state.data, hydrated]);

  const missing = step > 0 ? missingInStep(answers, step) : [];
  const set = (id: string, value: Answers[string]) => { setAnswers((current) => ({ ...current, [id]: value })); setSaveError(null); };
  const leave = () => void signOut();

  const errorText = (error: unknown) => {
    if (error instanceof DiagnosticError && error.code === "diagnostic_closed") return t("diagnostic.closedError");
    if (error instanceof DiagnosticError && error.code === "diagnostic_incomplete") return t("diagnostic.completeError");
    return t("diagnostic.saveError");
  };

  const start = async () => {
    if (!consent) { setConsentError(true); return; }
    setBusy(true); setSaveError(null);
    try { await acceptDiagnosticConsent(); setStep(state.data?.current_step ?? 1); }
    catch (error) { setSaveError(errorText(error)); }
    finally { setBusy(false); }
  };

  const next = async () => {
    if (missing.length > 0) { setShowErrors(true); return; }
    setBusy(true); setSaveError(null);
    try {
      if (step < TOTAL) {
        await saveDiagnosticStep(step + 1, stepPayload(answers, step));
        setShowErrors(false);
        setStep(step + 1);
        window.scrollTo?.({ top: 0 });
      } else {
        await completeDiagnostic(stepPayload(answers, step));
        updateProfileState({ diagnostic_required: false });
        void navigate({ to: profile?.onboarding_completed || profile?.onboarding_status === "skipped" ? "/" : "/onboarding", replace: true });
      }
    } catch (error) {
      if (error instanceof DiagnosticError && error.code === "diagnostic_incomplete" && error.field) {
        const target = stepOf(error.field);
        if (target > 0) { setStep(target); setShowErrors(true); }
      }
      setSaveError(errorText(error));
    } finally { setBusy(false); }
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
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">{t("diagnostic.eyebrow")}</p>
          <h1 className="font-display text-2xl font-semibold">{t("diagnostic.title")}</h1>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("diagnostic.intro")}</p>
        <div className="flex items-start gap-3">
          <Checkbox id="diagnostic-consent" checked={consent} onCheckedChange={(value) => { setConsent(value === true); setConsentError(false); }} aria-invalid={consentError} />
          <label htmlFor="diagnostic-consent" className="cursor-pointer text-sm leading-snug">{t("diagnostic.consentLabel")}</label>
        </div>
        {consentError && <p role="alert" className="text-sm text-destructive">{t("diagnostic.consentRequired")}</p>}
        {saveError && <p role="alert" className="text-sm text-destructive" data-testid="diagnostic-save-error">{saveError}</p>}
        <div className="flex justify-end">
          <Button onClick={() => void start()} disabled={busy}>{busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}{saveError ? t("diagnostic.retry") : t("diagnostic.start")}</Button>
        </div>
      </section>,
    );
  }

  const current = DIAGNOSTIC_STEPS[step - 1];
  return shell(
    <section className="space-y-6" data-testid="diagnostic-step" data-step={step}>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("diagnostic.progress").replace("{step}", String(step)).replace("{total}", String(TOTAL))}</span>
          <span>{Math.round(((step - 1) / TOTAL) * 100)}%</span>
        </div>
        <div role="progressbar" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step} aria-label={t("diagnostic.progress").replace("{step}", String(step)).replace("{total}", String(TOTAL))}
          className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(step / TOTAL) * 100}%` }} />
        </div>
        <h1 className="pt-2 font-display text-xl font-semibold sm:text-2xl">{t(`diagnostic.steps.${current.key}`)}</h1>
      </div>
      <div className="space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        {current.questions.filter((q) => isVisible(q, answers)).map((question) => (
          <QuestionField key={question.id} question={question} answers={answers} onChange={set} disabled={busy}
            error={showErrors ? (missing.includes(question.id) ? "required" : question.type === "multi" && missing.includes(question.otherKey) ? "other" : null) : null} />
        ))}
      </div>
      {showErrors && missing.length > 0 && <p role="alert" className="text-sm text-destructive">{t("diagnostic.stepIncomplete")}</p>}
      {saveError && <p role="alert" className="text-sm text-destructive" data-testid="diagnostic-save-error">{saveError}</p>}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => { setStep(step - 1); setShowErrors(false); setSaveError(null); }} disabled={busy || step === 1}>{t("diagnostic.back")}</Button>
        <Button onClick={() => void next()} disabled={busy} data-testid="diagnostic-next">
          {busy && <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />}
          {busy ? t("diagnostic.saving") : saveError ? t("diagnostic.retry") : step === TOTAL ? t("diagnostic.finish") : t("diagnostic.continue")}
        </Button>
      </div>
    </section>,
  );
}

function QuestionField({ question, answers, onChange, error, disabled }: {
  question: Question; answers: Answers; onChange: (id: string, value: Answers[string]) => void; error: "required" | "other" | null; disabled: boolean;
}) {
  const { t } = useLanguage();
  const id = `diagnostic-${question.id}`;
  const label = t(`diagnostic.q.${question.id}.label`);
  const value = answers[question.id];
  const option = (o: string) => t(`diagnostic.q.${question.id}.options.${o}`);
  const errorNode = error && <p role="alert" className="text-xs text-destructive">{t(error === "other" ? "diagnostic.otherRequired" : "diagnostic.required")}</p>;
  const choice = (selected: boolean) => cn("rounded-xl border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
    selected ? "border-primary bg-primary/10 font-medium text-foreground" : "border-border bg-background hover:bg-muted");

  if (question.type === "single" || question.type === "multi") {
    const selected = question.type === "multi" ? (Array.isArray(value) ? value : []) : [];
    return (
      <fieldset className="space-y-2" data-question={question.id} aria-invalid={Boolean(error)}>
        <legend className="mb-1 text-sm font-medium">{label}</legend>
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
        <legend className="mb-1 text-sm font-medium">{label}</legend>
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
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      {question.short
        ? <Input id={id} maxLength={TEXT_MAX} disabled={disabled} aria-invalid={Boolean(error)} value={String(value ?? "")} onChange={(e) => onChange(question.id, e.target.value)} />
        : <Textarea id={id} rows={2} maxLength={TEXT_MAX} disabled={disabled} aria-invalid={Boolean(error)} value={String(value ?? "")} onChange={(e) => onChange(question.id, e.target.value)} />}
      <p className="text-[11px] text-muted-foreground">{t("diagnostic.textHint")}</p>
      {errorNode}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { readStageEvidence, recordConfirmedStep } from "@/lib/lead-stage-confirmation-data";
import { confirmedChoices, missingPriorSteps, type ConfirmationChoice, type PriorStep } from "@/lib/lead-stage-confirmation";
import type { Lead } from "@/lib/automation-engine";
import { useLanguage } from "./use-language";
interface Request { lead: Lead; target: string; steps: PriorStep[] }
export function useLeadStageConfirmation(owner: string | undefined, onRecorded: (lead?: Lead) => void) {
  const { t } = useLanguage();
  const [request, setRequest] = useState<Request | null>(null), [checking, setChecking] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null), [started, setStarted] = useState(false);
  const resolver = useRef<((lead: Lead | null) => void) | null>(null), lock = useRef(false), submitLock = useRef(false), currentOwner = useRef(owner), callback = useRef(onRecorded);
  currentOwner.current = owner; callback.current = onRecorded;
  useEffect(() => () => { resolver.current?.(null); resolver.current = null; }, [owner]);
  const confirmBefore = async (lead: Lead, target: string): Promise<Lead | null> => {
    if (!owner || lock.current || resolver.current) return null;
    lock.current = true; setChecking(true); setError(null); setStarted(false);
    try {
      const fresh = await readStageEvidence(owner, lead.id);
      if (currentOwner.current !== owner) return null;
      const steps = missingPriorSteps(fresh.lead.stage, target, fresh.evidence);
      if (!steps.length) return fresh.lead;
      setRequest({ lead: fresh.lead, target, steps });
      return await new Promise<Lead | null>((resolve) => { resolver.current = resolve; });
    } catch { setError(t("leadStageConfirmation.loadError")); return null; }
    finally { lock.current = false; setChecking(false); }
  };
  const cancel = () => { if (saving || started) return; setRequest(null); resolver.current?.(null); resolver.current = null; setError(null); };
  const submit = async (choices: Partial<Record<PriorStep, ConfirmationChoice>>) => {
    if (!owner || !request || submitLock.current) return;
    let confirmed: { step: PriorStep; occurredAt: string }[];
    try { confirmed = confirmedChoices(request.steps, choices); } catch (e) { setError(t(`leadStageConfirmation.${(e as Error).message}`)); return; }
    submitLock.current = true; setSaving(true); setError(null);
    try {
      // Nothing is written while answering individual questions; Cancel before confirmation is side-effect free.
      if (confirmed.length) setStarted(true);
      for (const entry of confirmed) {
        if (currentOwner.current !== owner) throw new Error("authentication_changed");
        await recordConfirmedStep(owner, request.lead.id, entry.step, entry.occurredAt, t(`leadStageConfirmation.facts.${entry.step}`));
        callback.current();
      }
      const fresh = await readStageEvidence(owner, request.lead.id);
      if (currentOwner.current !== owner) throw new Error("authentication_changed");
      callback.current(fresh.lead);
      setRequest(null); resolver.current?.(fresh.lead); resolver.current = null;
    } catch {
      setError(t("leadStageConfirmation.saveError"));
      // A confirmed contact can already be persisted even if a later confirmation fails.
      try { const fresh = await readStageEvidence(owner, request.lead.id); if (currentOwner.current === owner) callback.current(fresh.lead); } catch { /* Preserve the error and explicit retry. */ }
    }
    finally { submitLock.current = false; setSaving(false); }
  };
  return { request, checking, saving, error, started, confirmBefore, cancel, submit };
}
import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/** Inline save feedback (no toasts): idle → saving → saved (auto-resets) | error (kept until next attempt). */
export function useSaveFeedback(resetMs = 2500) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const start = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setErrorMessage(null);
    setStatus("saving");
  }, []);
  const succeed = useCallback(() => {
    setStatus("saved");
    timer.current = setTimeout(() => setStatus("idle"), resetMs);
  }, [resetMs]);
  const fail = useCallback((message: string) => {
    setErrorMessage(message);
    setStatus("error");
  }, []);
  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  return { status, errorMessage, isSaving: status === "saving", start, succeed, fail, reset };
}

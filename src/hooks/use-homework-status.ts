import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHomeworkStatuses, saveHomeworkStatus, HOMEWORK_STATUS_CHANGED, type HomeworkStatus, type HomeworkStatuses } from "@/lib/homework-status";
import { useLanguage } from "@/hooks/use-language";

/** Mount/focus reads and successful status mutations always read the same event-linked rows. */
export function useHomeworkStatus(teacherId: string | undefined, eventIds: string[], onLoaded?: (statuses: HomeworkStatuses) => void) {
  const { t } = useLanguage();
  const [statuses, setStatuses] = useState<HomeworkStatuses>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onLoadedRef = useRef(onLoaded);
  onLoadedRef.current = onLoaded;
  const eventKey = JSON.stringify([...new Set(eventIds.filter(Boolean))].sort());
  const scope = `${teacherId || ""}:${eventKey}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const busy = useRef(false);

  useEffect(() => {
    let active = true;
    let latest = 0;
    setStatuses({});
    const ids: string[] = JSON.parse(eventKey);
    const load = async () => {
      const request = ++latest;
      setLoading(true);
      try {
        const values = teacherId ? await fetchHomeworkStatuses(teacherId, ids) : {};
        if (!active || request !== latest) return;
        setStatuses(values);
        setError(null);
        onLoadedRef.current?.(values);
      } catch (err) {
        console.error("[Homework status] Load failed", err);
        if (active && request === latest) setError(t("calendarUi.homeworkStatusLoadError"));
      } finally {
        if (active && request === latest) setLoading(false);
      }
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ teacherId: string; eventId: string }>).detail;
      if (detail?.teacherId === teacherId && ids.includes(detail.eventId)) void load();
    };
    const focused = () => { void load(); };
    void load();
    window.addEventListener(HOMEWORK_STATUS_CHANGED, changed);
    window.addEventListener("focus", focused);
    return () => {
      active = false;
      window.removeEventListener(HOMEWORK_STATUS_CHANGED, changed);
      window.removeEventListener("focus", focused);
    };
  }, [teacherId, eventKey, t]);

  const save = useCallback(async (eventId: string, status: HomeworkStatus) => {
    if (busy.current || !teacherId) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const posted = await saveHomeworkStatus(teacherId, eventId, status);
      if (scopeRef.current !== scope) return;
      setStatuses((current) => ({ ...current, [eventId]: posted }));
      onLoadedRef.current?.({ [eventId]: posted });
    } catch (err) {
      console.error("[Homework status] Save failed", err);
      if (scopeRef.current === scope) setError(t("calendarUi.homeworkStatusSaveError"));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [teacherId, scope, t]);

  return { statuses, loading, saving, error, save };
}
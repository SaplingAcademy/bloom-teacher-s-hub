import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEFAULT_UNUSUAL_HOUR_PREFERENCES,
  fetchUnusualHourPreferences,
  saveUnusualHourPreference,
  unusualHourGroup,
  type UnusualHourGroup,
} from "@/lib/unusual-hour-reminders";

export const unusualHourPreferencesKey = (teacherId: string | undefined) => ["unusual-hour-preferences", teacherId] as const;

/** Teacher's reminder preferences (account-wide, from settings). Failures fall back to "on". */
export function useUnusualHourPreferences(teacherId: string | undefined) {
  return useQuery({
    queryKey: unusualHourPreferencesKey(teacherId),
    queryFn: () => fetchUnusualHourPreferences(teacherId!),
    enabled: Boolean(teacherId),
  });
}

/**
 * Wellbeing reminder before saving a new lesson or a time change at an unusual hour.
 * `confirm(startTime)` resolves true to proceed (no reminder needed, or "Confirmar horário")
 * and false for "Alterar horário" / closing. It never blocks scheduling rules; "Não mostrar
 * novamente" is saved only when the teacher confirms, and only for that group.
 */
export function useUnusualHourReminder(teacherId: string | undefined) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { data: preferences } = useUnusualHourPreferences(teacherId);
  const [group, setGroup] = useState<UnusualHourGroup | null>(null);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const answer = useRef<((confirmed: boolean) => void) | null>(null);
  useEffect(() => () => { answer.current?.(false); }, []);

  const confirm = (startTime: string): Promise<boolean> => {
    const target = unusualHourGroup(startTime);
    const prefs = preferences ?? DEFAULT_UNUSUAL_HOUR_PREFERENCES;
    if (!target || !prefs[target]) return Promise.resolve(true);
    if (answer.current) return Promise.resolve(false); // one reminder per attempt
    setDontShowAgain(false);
    setGroup(target);
    return new Promise<boolean>((resolve) => { answer.current = resolve; });
  };

  const respond = (confirmed: boolean) => {
    const resolve = answer.current;
    if (!resolve) return;
    answer.current = null;
    const answeredGroup = group;
    const persist = confirmed && dontShowAgain && answeredGroup && teacherId;
    setGroup(null);
    resolve(confirmed);
    if (persist) {
      void saveUnusualHourPreference(teacherId, answeredGroup, false)
        .then((saved) => queryClient.setQueryData(unusualHourPreferencesKey(teacherId), saved))
        .catch((error) => {
          console.warn("[UnusualHourReminder] preference not saved:", error);
          toast.warning(t("unusualHours.saveError"));
        });
    }
  };

  const isEarly = group === "early_morning";
  const dialog = (
    <AlertDialog open={group !== null} onOpenChange={(open) => { if (!open) respond(false); }}>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <span aria-hidden="true">{isEarly ? "☀️" : "🌙"}</span>
            {t(isEarly ? "unusualHours.earlyTitle" : "unusualHours.lateTitle")}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-foreground/80">
            {t(isEarly ? "unusualHours.earlyBody" : "unusualHours.lateBody")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
          <Checkbox
            checked={dontShowAgain}
            onCheckedChange={(value) => setDontShowAgain(value === true)}
            aria-label={t("unusualHours.dontShowAgain")}
          />
          <span>{t("unusualHours.dontShowAgain")}</span>
        </label>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => respond(false)}>{t("unusualHours.changeTime")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => respond(true)}>{t("unusualHours.confirmTime")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, dialog };
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PanelCard } from "@/components/bloom/PanelCard";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useLanguage } from "@/hooks/use-language";
import { unusualHourPreferencesKey, useUnusualHourPreferences } from "@/hooks/use-unusual-hour-reminder";
import { saveUnusualHourPreference, type UnusualHourGroup } from "@/lib/unusual-hour-reminders";

/** Discreet per-group switches to re-enable (or disable) the unusual-hour reminders. */
export function WellbeingRemindersSettings({ teacherId }: { teacherId: string | undefined }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const { data: preferences, isError, isLoading } = useUnusualHourPreferences(teacherId);
  const [saving, setSaving] = useState<UnusualHourGroup | null>(null);

  const toggle = async (group: UnusualHourGroup, enabled: boolean) => {
    if (!teacherId) return;
    setSaving(group);
    try {
      const saved = await saveUnusualHourPreference(teacherId, group, enabled);
      queryClient.setQueryData(unusualHourPreferencesKey(teacherId), saved);
    } catch (error) {
      console.warn("[WellbeingReminders] save failed:", error);
      toast.error(t("unusualHours.settingsSaveError"));
    } finally {
      setSaving(null);
    }
  };

  const rows: { group: UnusualHourGroup; label: string }[] = [
    { group: "early_morning", label: t("unusualHours.earlyLabel") },
    { group: "late_night", label: t("unusualHours.lateLabel") },
  ];

  return (
    <PanelCard title={t("unusualHours.settingsTitle")} description={t("unusualHours.settingsDescription")}>
      {isError ? (
        <p role="alert" className="text-xs text-destructive">{t("unusualHours.loadError")}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(({ group, label }) => (
            <div key={group} className="flex items-center justify-between gap-3">
              <Label htmlFor={`wellbeing-${group}`} className="text-sm font-normal text-muted-foreground">{label}</Label>
              <Switch
                id={`wellbeing-${group}`}
                checked={preferences ? preferences[group] : true}
                disabled={isLoading || saving !== null || !teacherId}
                onCheckedChange={(value) => void toggle(group, value)}
              />
            </div>
          ))}
        </div>
      )}
    </PanelCard>
  );
}

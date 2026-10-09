import { useEffect, useState } from "react";
import { Pencil, Plus, X, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { reportUserError } from "@/lib/user-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const DEFAULT_LESSON_COUNT_PRESETS = [20, 30, 40];
const METADATA_KEY = "lesson_count_presets";

export type LessonCountSelection = number | "custom";

function readPresets(meta: Record<string, unknown> | undefined): number[] {
  const raw = meta?.[METADATA_KEY];
  if (!Array.isArray(raw)) return DEFAULT_LESSON_COUNT_PRESETS;
  return raw.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= 200);
}

interface Props {
  selected: LessonCountSelection;
  onSelect: (value: LessonCountSelection) => void;
  customQuantity: number;
  onCustomQuantityChange: (n: number) => void;
  inputId: string;
  customLabel: string;
}

/** Lesson-count presets, stored per teacher in their account metadata (syncs across devices). */
export function LessonCountPresetPicker({ selected, onSelect, customQuantity, onCustomQuantityChange, inputId, customLabel }: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [presets, setPresets] = useState<number[]>(DEFAULT_LESSON_COUNT_PRESETS);
  const [editing, setEditing] = useState(false);
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const list = readPresets(data.user?.user_metadata);
      setPresets(list);
      if (typeof selected === "number" && !list.includes(selected)) onSelect(list[0] ?? "custom");
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const persist = async (next: number[]) => {
    const prev = presets;
    setPresets(next);
    if (typeof selected === "number" && !next.includes(selected)) onSelect(next[0] ?? "custom");
    const { error } = await supabase.auth.updateUser({ data: { [METADATA_KEY]: next } });
    if (error) {
      setPresets(prev);
      toast.error(reportUserError(error, t("lessonPresets.saveError")));
    }
  };

  const addPreset = () => {
    const n = parseInt(newValue, 10);
    if (!Number.isInteger(n) || n < 1 || n > 200 || presets.includes(n)) return;
    setNewValue("");
    persist([...presets, n].sort((a, b) => a - b));
  };

  const cardCls = (active: boolean) =>
    `p-3 rounded-xl border text-left transition-all text-xs flex flex-col justify-between ${
      active
        ? "border-primary bg-primary/5 text-primary font-semibold shadow-xs"
        : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
    }`;
  const label = (n: number) => t("lessonPresets.lessons").replace("{0}", String(n));

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {presets.map((n) => (
          <div key={n} className="relative">
            <button type="button" onClick={() => onSelect(n)} className={`${cardCls(selected === n)} w-full`}>
              <span className="text-sm font-bold text-foreground">{label(n)}</span>
            </button>
            {editing && (
              <button
                type="button"
                aria-label={t("lessonPresets.remove")}
                onClick={() => persist(presets.filter((p) => p !== n))}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => onSelect("custom")} className={cardCls(selected === "custom")}>
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{t("lessonPresets.custom")}</span>
          <span className="text-sm font-bold text-foreground mt-1">{t("lessonPresets.specify")}</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {editing && (
          <>
            <Input
              type="number"
              min={1}
              max={200}
              value={newValue}
              placeholder={t("lessonPresets.addPlaceholder")}
              onChange={(e) => setNewValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPreset(); } }}
              className="h-8 w-32 text-xs"
            />
            <button type="button" onClick={addPreset} className="h-8 px-3 rounded-lg border border-border text-xs font-semibold text-foreground hover:bg-secondary/40 flex items-center gap-1">
              <Plus className="h-3.5 w-3.5" /> {t("lessonPresets.add")}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="h-8 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          {editing ? t("lessonPresets.done") : t("lessonPresets.edit")}
        </button>
      </div>

      {selected === "custom" && (
        <div className="pt-2">
          <Label htmlFor={inputId} className="text-xs text-muted-foreground mb-1 block">{customLabel}</Label>
          <Input
            id={inputId}
            type="number"
            min={1}
            max={200}
            value={customQuantity}
            onChange={(e) => onCustomQuantityChange(Math.max(1, parseInt(e.target.value) || 1))}
            className="h-10 text-sm font-semibold max-w-xs"
          />
        </div>
      )}
    </div>
  );
}

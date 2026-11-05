import { useLanguage } from "@/hooks/use-language";
import type { Progress } from "@/lib/workspace-projects";

export function ProgressBar({ progress, color, compact }: { progress: Progress; color: string; compact?: boolean }) {
  const { t } = useLanguage();
  const label = t("workspace.project.progressLabel").replace("{done}", String(progress.done)).replace("{total}", String(progress.total));
  return (
    <div className="space-y-1.5">
      {!compact && <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><span className="font-medium text-foreground">{progress.percent}%</span></div>}
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label={label} className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress.percent}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

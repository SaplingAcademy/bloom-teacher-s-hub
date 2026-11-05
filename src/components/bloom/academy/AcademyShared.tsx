import type { ReactNode } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { youtubeEmbedUrl } from "@/lib/academy-learning";

export function YoutubePlayer({ youtubeId, title }: { youtubeId: string; title: string }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border bg-muted">
      <iframe
        key={youtubeId}
        src={youtubeEmbedUrl(youtubeId)}
        title={title}
        className="absolute inset-0 h-full w-full"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}

export function LearningLoading() {
  const { t } = useLanguage();
  return <LearningSkeleton label={t("academy.learn.loading")} />;
}

export function LearningError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">{t("academy.loadError")}</p>
      <Button variant="outline" onClick={onRetry}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t("academy.retry")}
      </Button>
    </div>
  );
}

export function LearningNotFound({ action }: { action: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <p className="text-sm text-muted-foreground">{t("academy.learn.notFound")}</p>
      {action}
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-medium text-foreground">{percent}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

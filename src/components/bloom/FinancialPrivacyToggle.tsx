import { Eye, EyeOff } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFinancialPrivacy } from "@/lib/financial-privacy";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export function FinancialPrivacyToggle({ className }: { className?: string }) {
  const { financialValuesHidden, toggle } = useFinancialPrivacy();
  const { t } = useLanguage();
  const label = financialValuesHidden ? t("privacy.showValues") : t("privacy.hideValues");
  const Icon = financialValuesHidden ? EyeOff : Eye;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={toggle}
            aria-label={label}
            aria-pressed={financialValuesHidden}
            className={cn(
              "grid h-10 w-10 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 cursor-pointer",
              className,
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

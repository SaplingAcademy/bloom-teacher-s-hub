import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, Gift } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useLanguage } from "@/hooks/use-language";
import { PLAN_QUERY_KEY } from "@/hooks/use-plan";
import { acknowledgePlanUpgrade, fetchPendingPlanUpgrade, planDisplayName, upgradeScenario, type PendingPlanUpgrade } from "@/lib/plan-upgrade";

/** Same teacher-scoped "plan" key family as usePlan, so invalidating the plan also refreshes this. */
export const PLAN_UPGRADE_QUERY_KEY = (teacherId: string | undefined) => [...PLAN_QUERY_KEY(teacherId), "upgrade"] as const;

/**
 * Celebrates a confirmed plan upgrade once per event. Checks on load, when the tab regains focus
 * and every few minutes, so a teacher who is already signed in also sees it. Closing acknowledges
 * the event in the database, so it never repeats on refresh, a new login or another device.
 */
export function PlanUpgradeCelebration({ teacherId }: { teacherId: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [shown, setShown] = useState<PendingPlanUpgrade | null>(null);
  const handled = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: PLAN_UPGRADE_QUERY_KEY(teacherId),
    queryFn: () => fetchPendingPlanUpgrade(teacherId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!data || handled.current === data.upgradedAt) return;
    handled.current = data.upgradedAt;
    setShown(data);
    // The plan changed: refresh the plan read so premium features unlock right away.
    void queryClient.invalidateQueries({ queryKey: PLAN_QUERY_KEY(teacherId), exact: true });
  }, [data, queryClient, teacherId]);

  const close = () => {
    if (!shown) return;
    const event = shown;
    setShown(null);
    void acknowledgePlanUpgrade(event.upgradedAt)
      .catch((err) => console.error("[plan-upgrade] acknowledge failed:", err))
      .finally(() => void queryClient.invalidateQueries({ queryKey: PLAN_UPGRADE_QUERY_KEY(teacherId) }));
  };

  const planName = shown ? planDisplayName(shown.plan, t) : "";
  // The message is chosen automatically from the recorded event (origin + facts), never manually.
  const scenario = shown ? upgradeScenario(shown) : "default";
  const Icon = scenario === "admin_gift" ? Gift : Crown;
  const fill = (key: string) => t(`planUpgrade.scenarios.${scenario}.${key}`).replace("{plan}", planName);

  return (
    <Dialog open={Boolean(shown)} onOpenChange={(open) => !open && close()}>
      <DialogContent
        data-testid="plan-upgrade-celebration"
        data-scenario={scenario}
        className="w-[calc(100%-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl border-[#C9A961]/40 bg-[#163020] p-0 text-[#F4EBE1] shadow-2xl"
      >
        <div className="flex flex-col items-center px-6 pb-6 pt-9 text-center sm:px-8">
          <div className="mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-[#C9A961]/50 bg-[#C9A961]/10">
            <Icon className="h-7 w-7 text-[#D9BC78]" aria-hidden="true" />
          </div>
          <span className="mb-3 rounded-full border border-[#C9A961]/50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#D9BC78]">
            {t("planUpgrade.badge")}
          </span>
          <DialogTitle className="font-outfit text-2xl font-extrabold leading-tight tracking-tight text-[#F4EBE1] sm:text-[1.7rem]">
            {fill("title")}
          </DialogTitle>
          <DialogDescription className="mt-3 max-w-sm text-sm leading-relaxed text-[#F4EBE1]/80">
            {fill("description")}
          </DialogDescription>
          <button
            type="button"
            onClick={close}
            className="mt-7 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#D9BC78] px-5 text-sm font-bold text-[#163020] transition-colors hover:bg-[#E4CA8C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F4EBE1] focus-visible:ring-offset-2 focus-visible:ring-offset-[#163020] sm:w-auto cursor-pointer"
          >
            {t("planUpgrade.explore")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

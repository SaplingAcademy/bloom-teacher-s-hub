import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  ExternalLink,
  CalendarCheck,
  FileText,
  CreditCard,
  Bell,
  RefreshCw,
} from "lucide-react";
import {
  PriorityItem,
  fetchTeacherDailyPriorities,
  saveManualPriorityCompletion,
  undoManualPriorityCompletion,
} from "@/lib/priority-engine";
import { Badge } from "@/components/ui/badge";

interface DailyPrioritiesCardProps {
  teacherId: string;
}

export function DailyPrioritiesCard({ teacherId }: DailyPrioritiesCardProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [activePriorities, setActivePriorities] = useState<PriorityItem[]>([]);
  const [completedPriorities, setCompletedPriorities] = useState<PriorityItem[]>([]);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [progressPercentage, setProgressPercentage] = useState(100);
  const [showCompletedDrawer, setShowCompletedDrawer] = useState(false);

  const loadPriorities = async () => {
    if (!teacherId) return;
    try {
      const res = await fetchTeacherDailyPriorities(teacherId);
      setActivePriorities(res.activePriorities);
      setCompletedPriorities(res.completedTodayPriorities);
      setCompletedCount(res.completedCount);
      setTotalCount(res.totalCount);
      setProgressPercentage(res.progressPercentage);
    } catch (err) {
      console.error("[DailyPrioritiesCard] Error loading priorities:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPriorities();
  }, [teacherId]);

  // Handle clicking on priority body -> Deep Link navigation
  const handleItemClick = (item: PriorityItem) => {
    if (item.deepLink) {
      navigate({
        to: item.deepLink.route as any,
        search: item.deepLink.params as any,
      });
    }
  };

  // Handle Checkbox interaction
  const handleToggleCheckbox = async (e: React.MouseEvent, item: PriorityItem) => {
    e.stopPropagation();

    if (item.completionType === "MANUAL_ACTION") {
      // Type B: Manual action completion
      const newStatus = !item.isManuallyCompleted;
      await saveManualPriorityCompletion(teacherId, item.id, newStatus);
      if (newStatus) {
        toast.success(t("today.toastManualCompleted"));
      }
      await loadPriorities();
    } else {
      // Type A: Source-Resolved
      toast.info(t("today.toastSourceTitle"), {
        description: t("today.toastSourceDesc"),
      });
      handleItemClick(item);
    }
  };

  // Handle Undo for manually completed items
  const handleUndo = async (e: React.MouseEvent, item: PriorityItem) => {
    e.stopPropagation();
    if (item.completionType === "MANUAL_ACTION") {
      await undoManualPriorityCompletion(teacherId, item.id);
      toast.success(t("today.toastRestored"));
      await loadPriorities();
    }
  };

  // Badge styling for priority types
  const getCategoryBadgeStyles = (type: PriorityItem["type"]) => {
    switch (type) {
      case "payment_due_today":
        return "bg-amber-100 text-amber-900 border-amber-200/80";
      case "attendance_pending":
        return "bg-sky-100 text-sky-900 border-sky-200/80";
      case "homework_pending":
        return "bg-emerald-100 text-emerald-900 border-emerald-200/80";
      case "payment_reminder_5d":
        return "bg-purple-100 text-purple-900 border-purple-200/80";
      case "renewal_30d":
        return "bg-rose-100 text-rose-900 border-rose-200/80";
      default:
        return "bg-stone-100 text-stone-800 border-stone-200";
    }
  };

  // Icon for priority types
  const getCategoryIcon = (type: PriorityItem["type"]) => {
    switch (type) {
      case "payment_due_today":
        return <CreditCard className="h-3.5 w-3.5 shrink-0" />;
      case "attendance_pending":
        return <CalendarCheck className="h-3.5 w-3.5 shrink-0" />;
      case "homework_pending":
        return <FileText className="h-3.5 w-3.5 shrink-0" />;
      case "payment_reminder_5d":
        return <Bell className="h-3.5 w-3.5 shrink-0" />;
      case "renewal_30d":
        return <RefreshCw className="h-3.5 w-3.5 shrink-0" />;
      default:
        return <Sparkles className="h-3.5 w-3.5 shrink-0" />;
    }
  };

  const is100Percent = totalCount === 0 || activePriorities.length === 0;

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 sm:p-6 shadow-sm font-figtree transition-all">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-outfit text-xl font-extrabold text-[#163020]">
              {t("today.prioritiesTitle")}
            </h2>
            {is100Percent && (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {t("today.allCaughtUp")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-stone-500 font-medium mt-0.5">
            {t("today.prioritiesSubtitle")}
          </p>
        </div>
      </div>

      {/* Progress Bar & Summary */}
      {totalCount > 0 ? (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-stone-600">
            <span>
              {t("today.completedProgress")
                .replace("{completed}", String(completedCount))
                .replace("{total}", String(totalCount))}
            </span>
            <span className="text-emerald-800 font-extrabold">
              {t("today.percentageCompleted").replace("{percent}", String(progressPercentage))}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden p-0.5 border border-stone-200/50">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-teal-500 transition-all duration-500 ease-out shadow-sm"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      ) : null}

      {/* Empty / 100% State Banner */}
      {is100Percent && (
        <div className="mt-5 p-5 rounded-2xl bg-emerald-50/60 border border-emerald-100 flex items-center gap-3.5 text-emerald-900 animate-in fade-in duration-300">
          <div className="h-10 w-10 rounded-xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center shrink-0 shadow-inner">
            <Sparkles className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-outfit font-extrabold text-sm text-emerald-950">
              {t("today.allCaughtUp")}
            </h4>
            <p className="text-xs text-emerald-700 font-medium leading-relaxed">
              {t("today.allCaughtUpSubtitle")}
            </p>
          </div>
        </div>
      )}

      {/* Active Priorities List */}
      {!is100Percent && (
        <ul className="mt-4 divide-y divide-stone-100">
          {activePriorities.map((item) => (
            <li
              key={item.id}
              onClick={() => handleItemClick(item)}
              className="group flex items-start gap-3.5 py-3.5 px-3 rounded-xl hover:bg-stone-50 transition-all cursor-pointer border border-transparent hover:border-stone-200/60 select-none"
            >
              {/* Checkbox */}
              <button
                type="button"
                onClick={(e) => handleToggleCheckbox(e, item)}
                className="mt-0.5 text-stone-400 hover:text-emerald-700 transition-colors shrink-0 cursor-pointer"
                title={
                  item.completionType === "MANUAL_ACTION"
                    ? t("today.markAsDone")
                    : t("today.completeAtSource")
                }
              >
                {item.isManuallyCompleted || item.isResolved ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 group-hover:scale-110 transition-transform" />
                )}
              </button>

              {/* Priority Details */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] py-0.5 px-2 font-bold rounded-md flex items-center gap-1.5 border ${getCategoryBadgeStyles(
                      item.type
                    )}`}
                  >
                    {getCategoryIcon(item.type)}
                    <span>{item.categoryLabel}</span>
                  </Badge>
                  {item.studentName && (
                    <span className="text-[11px] font-semibold text-stone-500">
                      {item.studentName}
                    </span>
                  )}
                </div>

                <h4 className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-emerald-950 transition-colors leading-snug">
                  {item.title}
                </h4>

                {item.subtitle && (
                  <p className="text-[11px] font-medium text-stone-500 leading-tight">
                    {item.subtitle}
                  </p>
                )}
              </div>

              {/* Deep Link Icon */}
              <div className="shrink-0 text-stone-400 group-hover:text-stone-700 transition-colors pt-1">
                <ExternalLink className="h-4 w-4" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Completed Today Section (Expandable Drawer) */}
      {completedPriorities.length > 0 && (
        <div className="mt-5 pt-4 border-t border-stone-100">
          <button
            type="button"
            onClick={() => setShowCompletedDrawer(!showCompletedDrawer)}
            className="flex items-center justify-between w-full text-xs font-bold text-stone-600 hover:text-stone-900 py-1.5 transition-colors cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {completedPriorities.length === 1
                ? t("today.viewCompletedToday").replace("{count}", "1")
                : t("today.viewCompletedTodayPlural").replace(
                    "{count}",
                    String(completedPriorities.length)
                  )}
            </span>
            {showCompletedDrawer ? (
              <ChevronUp className="h-4 w-4 text-stone-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-stone-400" />
            )}
          </button>

          {showCompletedDrawer && (
            <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider px-1">
                {t("today.completedToday")}
              </p>
              <ul className="divide-y divide-stone-100 bg-stone-50/60 rounded-xl border border-stone-200/60 px-3">
                {completedPriorities.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between py-2.5 text-xs text-stone-600 gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="line-through font-medium text-stone-500 truncate">
                          {item.title}
                        </span>
                        {item.completedAt && (
                          <span className="text-[10px] text-stone-400 font-mono">
                            {item.completedAt}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-stone-400">
                        {item.completionType === "SOURCE_RESOLVED" ? (
                          <span className="text-emerald-700 font-semibold">
                            {t("today.completedAtSourceTag")}
                          </span>
                        ) : (
                          <span>{t("today.completedManuallyTag")}</span>
                        )}
                      </p>
                    </div>

                    {/* Undo or View Source */}
                    <div>
                      {item.completionType === "MANUAL_ACTION" && item.isManuallyCompleted ? (
                        <button
                          type="button"
                          onClick={(e) => handleUndo(e, item)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-md transition-colors cursor-pointer border border-amber-200/60"
                          title={t("today.restoreTooltip")}
                        >
                          <RotateCcw className="h-3 w-3" />
                          {t("today.undo")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleItemClick(item)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-500 hover:text-stone-800 px-2 py-1 rounded-md hover:bg-stone-200/60 transition-colors cursor-pointer"
                        >
                          {t("today.viewSource")}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

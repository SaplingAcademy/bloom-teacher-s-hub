import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck,
  Search,
  Users,
  GraduationCap,
  Crown,
  Loader2,
  AlertTriangle,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { usePlan } from "@/hooks/use-plan";
import { PageHeader } from "@/components/bloom/PageHeader";
import { StatCard } from "@/components/bloom/StatCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ADMIN_TEACHERS_QUERY_KEY,
  canDowngradeToFree,
  computeAdminStats,
  fetchAdminTeachers,
  filterAdminTeachers,
  isAdminOnlyError,
  isDowngradeBlockedError,
  setTeacherPlan,
  type AdminPlanFilter,
  type AdminTeacher,
} from "@/lib/admin";
import { FREE_PLAN_ACTIVE_STUDENT_LIMIT, type SubscriptionPlan } from "@/lib/plans";

export const Route = createFileRoute("/_app/admin")({
  head: () => ({
    meta: [
      { title: "Administração · Bloom" },
      { name: "description", content: "Painel administrativo do Bloom: professores e planos." },
      { property: "og:title", content: "Administração · Bloom" },
      { property: "og:description", content: "Painel administrativo do Bloom: professores e planos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { t } = useLanguage();
  const { isSuperAdmin, isLoading: planLoading } = usePlan();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<AdminPlanFilter>("all");
  const [pendingChange, setPendingChange] = useState<{
    teacher: AdminTeacher;
    targetPlan: SubscriptionPlan;
  } | null>(null);

  const teachersQuery = useQuery({
    queryKey: ADMIN_TEACHERS_QUERY_KEY,
    enabled: isSuperAdmin,
    staleTime: 60_000,
    queryFn: fetchAdminTeachers,
  });

  const changePlanMutation = useMutation({
    mutationFn: ({ teacherId, plan }: { teacherId: string; plan: SubscriptionPlan }) =>
      setTeacherPlan(teacherId, plan),
    onSuccess: async () => {
      toast.success(t("admin.planUpdated"));
      setPendingChange(null);
      await queryClient.invalidateQueries({ queryKey: ADMIN_TEACHERS_QUERY_KEY });
    },
    onError: (error) => {
      if (isDowngradeBlockedError(error)) {
        toast.error(t("admin.downgradeBlockedToast"));
      } else if (isAdminOnlyError(error)) {
        toast.error(t("admin.accessDenied"));
      } else {
        toast.error(t("admin.planUpdateError"));
      }
    },
  });

  const teachers = teachersQuery.data ?? [];
  const stats = useMemo(() => computeAdminStats(teachers), [teachers]);
  const visibleTeachers = useMemo(
    () => filterAdminTeachers(teachers, search, planFilter),
    [teachers, search, planFilter],
  );

  if (planLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // The database re-verifies the role on every RPC; this gate only avoids
  // rendering privileged UI to non-admins.
  if (!isSuperAdmin) {
    return (
      <div className="mx-auto max-w-md py-24 text-center space-y-3">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="font-display text-xl font-bold">{t("admin.accessDenied")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.accessDeniedDescription")}</p>
      </div>
    );
  }

  const teacherName = (teacher: AdminTeacher) =>
    teacher.full_name?.trim() || teacher.email || t("admin.unnamedTeacher");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("admin.title")}
        description={t("admin.description")}
      />

      {/* Indicators */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("admin.statsTeachers")}
          value={String(stats.totalTeachers)}
          icon={Users}
        />
        <StatCard
          label={t("admin.statsFree")}
          value={String(stats.freeTeachers)}
          icon={GraduationCap}
        />
        <StatCard
          label={t("admin.statsPro")}
          value={String(stats.proTeachers)}
          icon={Crown}
        />
        <StatCard
          label={t("admin.statsActiveStudents")}
          value={String(stats.totalActiveStudents)}
          icon={ShieldCheck}
        />
      </div>

      {/* Search + plan filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={planFilter} onValueChange={(v) => setPlanFilter(v as AdminPlanFilter)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("admin.filterAll")}</SelectItem>
            <SelectItem value="free">{t("admin.filterFree")}</SelectItem>
            <SelectItem value="pro">{t("admin.filterPro")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content states */}
      {teachersQuery.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : teachersQuery.isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <p className="text-sm font-medium">{t("admin.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => teachersQuery.refetch()}>
            {t("common.tryAgain")}
          </Button>
        </div>
      ) : visibleTeachers.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <p className="text-sm text-muted-foreground">{t("admin.emptyResults")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ul className="divide-y divide-border">
            {visibleTeachers.map((teacher) => {
              const downgradeBlocked =
                teacher.plan === "pro" && !canDowngradeToFree(teacher);
              return (
                <li
                  key={teacher.teacher_id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-semibold">{teacherName(teacher)}</p>
                      <Badge variant={teacher.plan === "pro" ? "default" : "secondary"}>
                        {teacher.plan === "pro" ? t("admin.filterPro") : t("admin.filterFree")}
                      </Badge>
                    </div>
                    {teacher.email && (
                      <p className="truncate text-sm text-muted-foreground">{teacher.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {`${teacher.active_students} ${t("admin.activeStudentsCount")}`}
                      {teacher.created_at
                        ? ` · ${t("admin.memberSince")} ${new Date(teacher.created_at).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
                    {teacher.plan === "free" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPendingChange({ teacher, targetPlan: "pro" })
                        }
                      >
                        <ArrowUpCircle className="mr-1.5 h-4 w-4" />
                        {t("admin.upgradeToPro")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downgradeBlocked}
                        onClick={() =>
                          setPendingChange({ teacher, targetPlan: "free" })
                        }
                      >
                        <ArrowDownCircle className="mr-1.5 h-4 w-4" />
                        {t("admin.downgradeToFree")}
                      </Button>
                    )}
                    {downgradeBlocked && (
                      <p className="max-w-56 text-right text-xs text-muted-foreground">
                        {t("admin.downgradeBlockedHint")}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Plan change confirmation */}
      <Dialog open={pendingChange !== null} onOpenChange={(open) => !open && setPendingChange(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingChange?.targetPlan === "pro"
                ? t("admin.confirmUpgradeTitle")
                : t("admin.confirmDowngradeTitle")}
            </DialogTitle>
            <DialogDescription>
              {pendingChange?.targetPlan === "pro"
                ? `${t("admin.confirmUpgradeDescription")} ${pendingChange ? teacherName(pendingChange.teacher) : ""}`
                : `${t("admin.confirmDowngradeDescription")} ${pendingChange ? teacherName(pendingChange.teacher) : ""}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingChange(null)}
              disabled={changePlanMutation.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() =>
                pendingChange &&
                changePlanMutation.mutate({
                  teacherId: pendingChange.teacher.teacher_id,
                  plan: pendingChange.targetPlan,
                })
              }
              disabled={changePlanMutation.isPending}
            >
              {changePlanMutation.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              {t("admin.confirmPlanChange")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/lessons")({
  head: () => ({
    meta: [
      { title: "Lessons · Bloom" },
      { name: "description", content: "Plan, structure and deliver your lessons with AI help." },
    ],
  }),
  component: LessonsPage,
});

function LessonsPage() {
  const { t } = useLanguage();
  return (
    <ModulePlaceholder
      eyebrow={t("nav.workspace")}
      title={t("nav.lessons")}
      description={t("auditUi.planLessonsQuicklyReuseWhatWorksAnd")}
      icon={BookOpen}
      goal={t("auditUi.cutLessonPrepTimeDramaticallyWhileKeepingEvery")}
      planned={[
        t("auditUi.reusableLessonTemplatesAndCurricula"),
        t("auditUi.aiGeneratedActivitiesExercisesAndWarmUps"),
        t("auditUi.attachResourcesAndAssignHomework"),
        t("auditUi.levelAwareContentByCefrA1C2"),
        t("auditUi.deliverInClassModeWithNotesAndTimer"),
      ]}
    />
  );
}

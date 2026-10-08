import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/messages")({
  head: () => ({
    meta: [
      { title: "Messages · Bloom" },
      { name: "description", content: "Async student communication and announcements." },
    ],
  }),
  component: MessagesPage,
});

function MessagesPage() {
  const { t } = useLanguage();
  return (
    <ModulePlaceholder
      eyebrow={t("nav.workspace")}
      title={t("nav.messages")}
      description={t("auditUi.asyncCommunicationAndAnnouncementsWithStudentsFocusedNot")}
      icon={MessagesSquare}
      goal={t("auditUi.keepStudentCommunicationOrganizedAndProfessionalSeparateFrom")}
      planned={[
        t("auditUi.perStudentThreadsTiedToTheirProfile"),
        t("auditUi.announcementsToAGroupOrAllStudents"),
        t("auditUi.messageTemplatesForCommonReplies"),
        t("auditUi.shareResourcesAndHomeworkInAThread"),
        t("auditUi.laterWhatsappAndEmailIntegration"),
      ]}
    />
  );
}

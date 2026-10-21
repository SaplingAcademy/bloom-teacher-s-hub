import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/messages")({
  head: () => ({
    meta: [
      { title: "Messages · Bloom" },
      { name: "description", content: "Async student communication and announcements." },
      { property: "og:title", content: "Messages · Bloom" },
      { property: "og:description", content: "Async student communication and announcements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

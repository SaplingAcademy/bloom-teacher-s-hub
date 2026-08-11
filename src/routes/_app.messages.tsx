import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/messages")({
  head: () => ({
    meta: [
      { title: "Messages · Bloom" },
      { name: "description", content: "Async student communication and announcements." },
    ],
  }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Messages"
      description="Async communication and announcements with students — focused, not another chat app to babysit."
      icon={MessagesSquare}
      goal="Keep student communication organized and professional, separate from your personal WhatsApp."
      planned={[
        "Per-student threads tied to their profile",
        "Announcements to a group or all students",
        "Message templates for common replies",
        "Share resources and homework in a thread",
        "Later: WhatsApp and email integration",
      ]}
    />
  ),
});

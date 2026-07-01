import { createFileRoute } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/community")({
  head: () => ({ meta: [{ title: "Community · Bloom" }, { name: "description", content: "Where language teachers collaborate, share and grow together." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Community"
      title="Community Feed"
      description="A professional home for language teachers to ask questions, share ideas and build reputation."
      icon={Newspaper}
      goal="Strengthen the Bloom ecosystem — teachers who connect and learn together stay and grow."
      planned={[
        "Discussion feed with topics and reactions",
        "Q&A for teaching challenges",
        "Share teaching ideas and resources",
        "Reputation and badges for contributors",
        "Groups by language and specialty",
      ]}
    />
  ),
});
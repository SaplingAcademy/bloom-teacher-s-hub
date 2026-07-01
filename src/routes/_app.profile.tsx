import { createFileRoute } from "@tanstack/react-router";
import { UserCircle } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({ meta: [{ title: "Profile · Bloom" }, { name: "description", content: "Your public teacher profile and reputation." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Community"
      title="Profile"
      description="Your professional presence on Bloom — reputation, contributions and storefront."
      icon={UserCircle}
      goal="Build a professional reputation that attracts students and community standing."
      planned={[
        "Public teacher profile and bio",
        "Reputation, badges and contributions",
        "Your published resources and reviews",
        "Specialties, languages and levels",
        "Link to booking and marketplace store",
      ]}
    />
  ),
});
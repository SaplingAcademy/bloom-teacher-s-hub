import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings · Bloom" }, { name: "description", content: "Manage your Bloom workspace preferences." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Account"
      title="Settings"
      description="Your workspace, profile, billing and integrations — configured once, working everywhere."
      icon={Settings}
      goal="Make Bloom feel like yours and connect the tools you already use."
      planned={[
        "Profile, languages and teaching preferences",
        "Branding for invoices and booking pages",
        "Notifications and reminders",
        "Billing and subscription",
        "Integrations: Google, Zoom, payments",
      ]}
    />
  ),
});
import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/leads")({
  head: () => ({ meta: [{ title: "Leads · Bloom" }, { name: "description", content: "Turn inquiries into paying students with a simple pipeline." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Leads"
      description="A lightweight pipeline that turns WhatsApp and Instagram inquiries into booked students."
      icon={UserPlus}
      goal="Never lose a potential student — follow up at the right time and convert more inquiries."
      planned={[
        "Kanban pipeline: new, contacted, trial, won, lost",
        "Capture leads from a booking/contact form",
        "Follow-up reminders and templates",
        "Convert a lead into a student in one click",
        "Source tracking to see what actually works",
      ]}
    />
  ),
});
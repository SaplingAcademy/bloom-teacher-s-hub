import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/calendar")({
  head: () => ({ meta: [{ title: "Calendar · Bloom" }, { name: "description", content: "Schedule classes and share your availability." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Calendar"
      description="Scheduling built for teaching — recurring classes, availability and self-booking links."
      icon={CalendarDays}
      goal="Fill your week effortlessly and stop the back-and-forth over scheduling."
      planned={[
        "Day, week and month views tuned for classes",
        "Recurring lessons and group sessions",
        "Shareable booking link with your availability",
        "Reminders and video-call links",
        "Two-way sync with Google Calendar",
      ]}
    />
  ),
});
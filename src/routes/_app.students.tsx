import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/students")({
  head: () => ({ meta: [{ title: "Students · Bloom" }, { name: "description", content: "Manage your students, their progress and history in one place." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Students"
      description="A living profile for every student — progress, notes, attendance, payments and shared resources."
      icon={Users}
      goal="Know each student deeply and give them a personal experience without extra admin."
      planned={[
        "Rich student profiles with level, goals, tags and timeline",
        "Attendance, lesson history and progress tracking",
        "Notes and shared files per student",
        "Linked payments and package/credit balance",
        "Quick actions: schedule, message, invoice",
      ]}
    />
  ),
});
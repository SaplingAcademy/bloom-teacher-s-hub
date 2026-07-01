import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/lessons")({
  head: () => ({ meta: [{ title: "Lessons · Bloom" }, { name: "description", content: "Plan, structure and deliver your lessons with AI help." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Lessons"
      description="Plan lessons quickly, reuse what works, and let AI handle the first draft."
      icon={BookOpen}
      goal="Cut lesson-prep time dramatically while keeping every class high quality."
      planned={[
        "Reusable lesson templates and curricula",
        "AI-generated activities, exercises and warm-ups",
        "Attach resources and assign homework",
        "Level-aware content by CEFR (A1–C2)",
        "Deliver in-class mode with notes and timer",
      ]}
    />
  ),
});
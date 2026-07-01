import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/insights")({
  head: () => ({ meta: [{ title: "Insights · Bloom" }, { name: "description", content: "Understand the health of your teaching business." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Insights"
      description="Clear metrics on income, retention and growth — so you make decisions with confidence."
      icon={BarChart3}
      goal="Understand what's working in your business and where to focus to grow."
      planned={[
        "Revenue trends and projections",
        "Student retention and churn",
        "Lead conversion by source",
        "Hours taught and utilization",
        "AI summaries of what changed and why",
      ]}
    />
  ),
});
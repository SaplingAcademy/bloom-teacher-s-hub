import { createFileRoute } from "@tanstack/react-router";
import { Wallet } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/finance")({
  head: () => ({ meta: [{ title: "Finance · Bloom" }, { name: "description", content: "Track income, invoices and payments without spreadsheets." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Workspace"
      title="Finance"
      description="See your income clearly, send invoices, and know exactly who owes what."
      icon={Wallet}
      goal="Get paid on time and understand your earnings without touching a spreadsheet."
      planned={[
        "Invoices and receipts with your branding",
        "Class packages, credits and subscriptions",
        "Payment tracking and overdue reminders",
        "Income overview by student and month",
        "Online payments via card and local methods",
      ]}
    />
  ),
});
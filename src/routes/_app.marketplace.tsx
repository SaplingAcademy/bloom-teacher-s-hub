import { createFileRoute } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";

export const Route = createFileRoute("/_app/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace · Bloom" }, { name: "description", content: "Buy and sell high-quality teaching resources." }] }),
  component: () => (
    <ModulePlaceholder
      eyebrow="Community"
      title="Marketplace"
      description="A curated marketplace where teachers sell and discover great educational content."
      icon={Store}
      goal="Help teachers earn more by monetizing their best material — and save others prep time."
      planned={[
        "List worksheets, courses and lesson packs",
        "Secure payments and instant delivery",
        "Ratings, reviews and previews",
        "Seller storefront tied to your profile",
        "Revenue dashboard for your sales",
      ]}
    />
  ),
});
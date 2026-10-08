import { createFileRoute, redirect } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { ModulePlaceholder } from "@/components/bloom/ModulePlaceholder";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/_app/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace · Bloom" },
      { name: "description", content: "Buy and sell high-quality teaching resources." },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: MarketplacePage,
});

function MarketplacePage() {
  const { t } = useLanguage();
  return (
    <ModulePlaceholder
      eyebrow={t("nav.community")}
      title={t("nav.marketplace")}
      description={t("auditUi.marketplaceDescription")}
      icon={Store}
      goal={t("auditUi.marketplaceGoal")}
      planned={[
        t("auditUi.marketplaceListResources"),
        t("auditUi.marketplaceSecurePayments"),
        t("auditUi.marketplaceRatings"),
        t("auditUi.marketplaceStorefront"),
        t("auditUi.marketplaceRevenue"),
      ]}
    />
  );
}

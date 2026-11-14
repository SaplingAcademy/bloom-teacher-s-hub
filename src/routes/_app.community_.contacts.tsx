import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MyContactsPage } from "@/components/bloom/contacts/MyContactsPage";
import { parseContactsTab, type ContactsUrlTab } from "@/lib/notification-targets";

export const Route = createFileRoute("/_app/community_/contacts")({
  head: () => ({
    meta: [
      { title: "Meus Contatos · Bloom" },
      { name: "description", content: "Conecte-se com outros professores da Bloom." },
      { property: "og:title", content: "Meus Contatos · Bloom" },
      { property: "og:description", content: "Conecte-se com outros professores da Bloom." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: ContactsUrlTab } => {
    const tab = parseContactsTab(search.tab);
    return tab ? { tab } : {};
  },
  component: MyContactsRoute,
});

/** The URL (?tab=) selects the tab, so bell notifications can open the right list. */
function MyContactsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return <MyContactsPage tab={tab ?? "contacts"} onTabChange={(next) => navigate({ search: { tab: next }, replace: true })} />;
}

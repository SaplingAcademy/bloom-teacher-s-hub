import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseContactsTab, type ContactsUrlTab } from "@/lib/notification-targets";

/**
 * Old address of My Contacts. The page now lives as a tab inside Community; links, bookmarks and
 * older notifications are redirected there keeping the selected list (?tab=).
 */
export const Route = createFileRoute("/_app/community_/contacts")({
  validateSearch: (search: Record<string, unknown>): { tab?: ContactsUrlTab } => {
    const tab = parseContactsTab(search.tab);
    return tab ? { tab } : {};
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/community", search: { view: "contacts", ...(search.tab ? { tab: search.tab } : {}) }, replace: true });
  },
});

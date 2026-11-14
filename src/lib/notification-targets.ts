/** Tabs of /community/contacts as they appear in the URL (?tab=). */
export const CONTACTS_URL_TABS = ["contacts", "received", "sent"] as const;
export type ContactsUrlTab = (typeof CONTACTS_URL_TABS)[number];

export function parseContactsTab(value: unknown): ContactsUrlTab | undefined {
  return typeof value === "string" && (CONTACTS_URL_TABS as readonly string[]).includes(value) ? (value as ContactsUrlTab) : undefined;
}

export type NotificationTarget =
  | { to: "/community"; post: string }
  | { to: "/community/contacts"; tab: ContactsUrlTab };

/** Where clicking a bell notification leads; null keeps the current behavior (mark as read only). */
export function notificationTarget(n: { type: string | null; post_id: string | null }): NotificationTarget | null {
  if (n.type === "community_comment" && n.post_id) return { to: "/community", post: n.post_id };
  if (n.type === "contact_request") return { to: "/community/contacts", tab: "received" };
  if (n.type === "contact_accepted") return { to: "/community/contacts", tab: "contacts" };
  return null;
}

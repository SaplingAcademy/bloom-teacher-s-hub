import {
  PanelsTopLeft,
  Users,
  UserPlus,
  ClipboardCheck,
  CalendarDays,
  LibraryBig,
  Wallet,
  LayoutGrid,
  TrendingUp,
  MessageCircle,
  Newspaper,
  Store,
  UserCircle,
 
  Settings,
  ShieldCheck,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  description: string;
  badge?: string;
  disabled?: boolean;
  /** Active only on this exact path (not on deeper paths owned by another item). */
  exact?: boolean;
};

export type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

export const navSections: NavSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "today", label: "Overview", to: "/", icon: PanelsTopLeft, description: "Your launchpad for the day" },
      {
        id: "students",
        label: "Students",
        to: "/students",
        icon: Users,
        description: "Profiles, progress and history",
      },
      { id: "leads", label: "Leads", to: "/leads", icon: UserPlus, description: "Turn inquiries into students" },
      {
        id: "calendar",
        label: "Calendar",
        to: "/calendar",
        icon: CalendarDays,
        description: "Classes and availability",
      },
      {
        id: "resources",
        label: "Resources",
        to: "/resources",
        icon: LibraryBig,
        description: "Your teaching library",
      },
      {
        id: "finance",
        label: "Finance",
        to: "/finance",
        icon: Wallet,
        description: "Payments, invoices and income",
      },
      {
        id: "workspaceHub",
        label: "Workspace",
        to: "/workspace",
        icon: LayoutGrid,
        description: "Board and projects",
      },
      {
        id: "growth",
        label: "Growth",
        to: "/growth",
        icon: TrendingUp,
        description: "Scale and optimize your school",
      },
      {
        id: "academy",
        label: "Bloom Academy",
        to: "/academy",
        icon: GraduationCap,
        description: "Professional development",
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      {
        id: "community",
        label: "Feed",
        to: "/community",
        icon: Newspaper,
        description: "Ideas and discussion",
        // My Contacts is a tab inside Community (/community?view=contacts), not a menu entry.
        exact: true,
      },
      {
        id: "marketplace",
        label: "Marketplace",
        to: "/marketplace",
        icon: Store,
        description: "Buy and sell resources",
        badge: "Soon",
        disabled: true,
      },
    ],
  },
];

/** Utility links in the sidebar footer (above the account block). */
export const bottomNav: NavItem[] = [];

/**
 * Account entries: not sidebar rows anymore; opened from the teacher block in the sidebar footer
 * (SidebarAccountMenu). Same routes as before.
 */
export const accountNav: NavItem[] = [
  { id: "profile", label: "Profile", to: "/profile", icon: UserCircle, description: "Your teacher reputation" },
  { id: "settings", label: "Settings", to: "/settings", icon: Settings, description: "Workspace preferences" },
];

/** Rendered only for super_admin users (see AppSidebar); the database re-verifies the role. */
export const adminNavItem: NavItem = {
  id: "admin",
  label: "Administration",
  to: "/admin",
  icon: ShieldCheck,
  description: "Teachers and plans",
};

export const aiNav: NavItem = {
  id: "askBloomAi",
  label: "Ask Bloom AI",
  to: "/",
  icon: MessageCircle,
  description: "Your teaching assistant",
};

/**
 * Modules temporarily hidden from the menus (desktop sidebar/top panel and mobile). Their routes keep
 * working and they stay reachable through in-app shortcuts (e.g. Placement from /resources). To show
 * one again, move it back into its `navSections` entry and add its id to its `navGroups` column
 * ("placement" belongs to "management", after "leads").
 */
export const placementNav: NavItem = {
  id: "placement",
  label: "Placement",
  to: "/placement",
  icon: ClipboardCheck,
  description: "English placement tests",
};
export const hiddenNavItems: NavItem[] = [placementNav];

export const allNavItems: NavItem[] = [...navSections.flatMap((s) => s.items), ...bottomNav, ...accountNav, ...hiddenNavItems];

/**
 * Mega menu (top navigation panel): modules grouped in three columns. Every item of `navSections`
 * belongs to exactly one group (see getNavGroups), so no module is ever dropped.
 */
export const navGroups: { id: "management" | "business" | "resources"; itemIds: string[] }[] = [
  { id: "management", itemIds: ["today", "calendar", "students", "leads"] },
  { id: "business", itemIds: ["finance", "growth", "workspaceHub"] },
  { id: "resources", itemIds: ["resources", "community", "academy", "marketplace"] },
];

export type NavGroup = { id: string; items: NavItem[] };

/**
 * Resolves navGroups to NavItems from navSections (same routes, icons and flags). Items that are
 * not listed in any group are appended to the last group instead of disappearing.
 */
export function getNavGroups(sections: NavSection[] = navSections): NavGroup[] {
  const all = sections.flatMap((s) => s.items);
  const byId = new Map(all.map((item) => [item.id, item]));
  const groups = navGroups.map((g) => ({
    id: g.id,
    items: g.itemIds.map((id) => byId.get(id)).filter((item): item is NavItem => Boolean(item)),
  }));
  const listed = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
  const rest = all.filter((item) => !listed.has(item.id));
  if (rest.length) groups[groups.length - 1].items.push(...rest);
  return groups;
}

/** Same active rule the sidebar used: "/" only on the root, other sections by prefix. */
export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.disabled) return false;
  if (item.to === "/" || item.exact) return pathname === item.to || pathname === `${item.to}/`;
  return pathname.startsWith(item.to);
}

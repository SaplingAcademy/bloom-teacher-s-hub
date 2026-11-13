import {
  PanelsTopLeft,
  Users,
  UserPlus,
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
        description: "Board, projects and notebooks",
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

export const allNavItems: NavItem[] = [...navSections.flatMap((s) => s.items), ...bottomNav, ...accountNav];

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
  return item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
}

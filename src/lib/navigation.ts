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

/** Breakpoint (Tailwind) from which a primary item is shown in the horizontal bar. */
export type TopNavBreakpoint = "md" | "lg" | "xl";

/**
 * Horizontal top navigation: main sections ordered by frequency of use, each visible in the bar from
 * a breakpoint; below it the item moves into the "Mais" menu. Every other item of `navSections`
 * stays in "Mais", so no section is ever dropped (see getTopNav).
 */
export const topNavPrimary: { id: string; showFrom: TopNavBreakpoint }[] = [
  { id: "today", showFrom: "md" },
  { id: "calendar", showFrom: "md" },
  { id: "students", showFrom: "md" },
  { id: "leads", showFrom: "md" },
  { id: "finance", showFrom: "lg" },
  { id: "resources", showFrom: "lg" },
  { id: "community", showFrom: "xl" },
];

export type TopNav = {
  primary: { item: NavItem; showFrom: TopNavBreakpoint }[];
  /** Always in "Mais" (in their navSections order). */
  more: NavItem[];
};

/** Splits navSections into the bar's primary items and the "Mais" items; each item appears exactly once. */
export function getTopNav(sections: NavSection[] = navSections): TopNav {
  const all = sections.flatMap((s) => s.items);
  const byId = new Map(all.map((item) => [item.id, item]));
  const primary = topNavPrimary
    .filter((p) => byId.has(p.id))
    .map((p) => ({ item: byId.get(p.id)!, showFrom: p.showFrom }));
  const primaryIds = new Set(primary.map((p) => p.item.id));
  return { primary, more: all.filter((item) => !primaryIds.has(item.id)) };
}

/** Same active rule the sidebar used: "/" only on the root, other sections by prefix. */
export function isNavItemActive(item: NavItem, pathname: string) {
  if (item.disabled) return false;
  return item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
}

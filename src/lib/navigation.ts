import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarDays,
  BookOpen,
  FolderOpen,
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
      { id: "today", label: "Today", to: "/", icon: LayoutDashboard, description: "Your launchpad for the day" },
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
      { id: "lessons", label: "Lessons", to: "/lessons", icon: BookOpen, description: "Plan and deliver lessons" },
      {
        id: "resources",
        label: "Resources",
        to: "/resources",
        icon: FolderOpen,
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
      {
        id: "profile",
        label: "Profile",
        to: "/profile",
        icon: UserCircle,
        description: "Your teacher reputation",
      },
    ],
  },
];

export const bottomNav: NavItem[] = [
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

export const allNavItems: NavItem[] = [...navSections.flatMap((s) => s.items), ...bottomNav];

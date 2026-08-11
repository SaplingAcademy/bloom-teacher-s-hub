import {
  LayoutDashboard,
  Users,
  UserPlus,
  CalendarDays,
  BookOpen,
  FolderOpen,
  Wallet,
  MessagesSquare,
  TrendingUp,
  Sparkles,
  Newspaper,
  Store,
  UserCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  description: string;
  badge?: string;
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
      { label: "Today", to: "/", icon: LayoutDashboard, description: "Your launchpad for the day" },
      {
        label: "Students",
        to: "/students",
        icon: Users,
        description: "Profiles, progress and history",
      },
      { label: "Leads", to: "/leads", icon: UserPlus, description: "Turn inquiries into students" },
      {
        label: "Calendar",
        to: "/calendar",
        icon: CalendarDays,
        description: "Classes and availability",
      },
      { label: "Lessons", to: "/lessons", icon: BookOpen, description: "Plan and deliver lessons" },
      {
        label: "Resources",
        to: "/resources",
        icon: FolderOpen,
        description: "Your teaching library",
      },
      {
        label: "Finance",
        to: "/finance",
        icon: Wallet,
        description: "Payments, invoices and income",
      },
      {
        label: "Messages",
        to: "/messages",
        icon: MessagesSquare,
        description: "Student communication",
      },
      {
        label: "Growth",
        to: "/growth",
        icon: TrendingUp,
        description: "Scale and optimize your school",
      },
    ],
  },
  {
    id: "community",
    label: "Community",
    items: [
      {
        label: "Feed",
        to: "/community",
        icon: Newspaper,
        description: "Ideas and discussion",
        badge: "Soon",
      },
      {
        label: "Marketplace",
        to: "/marketplace",
        icon: Store,
        description: "Buy and sell resources",
        badge: "Soon",
      },
      {
        label: "Profile",
        to: "/profile",
        icon: UserCircle,
        description: "Your teacher reputation",
        badge: "Soon",
      },
    ],
  },
];

export const bottomNav: NavItem[] = [
  { label: "Settings", to: "/settings", icon: Settings, description: "Workspace preferences" },
];

export const aiNav: NavItem = {
  label: "Ask Bloom AI",
  to: "/",
  icon: Sparkles,
  description: "Your teaching assistant",
};

export const allNavItems: NavItem[] = [...navSections.flatMap((s) => s.items), ...bottomNav];

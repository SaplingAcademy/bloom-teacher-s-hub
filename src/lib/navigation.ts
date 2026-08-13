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
        id: "messages",
        label: "Messages",
        to: "/messages",
        icon: MessagesSquare,
        description: "Student communication",
      },
      {
        id: "growth",
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
        id: "community",
        label: "Feed",
        to: "/community",
        icon: Newspaper,
        description: "Ideas and discussion",
        badge: "Soon",
      },
      {
        id: "marketplace",
        label: "Marketplace",
        to: "/marketplace",
        icon: Store,
        description: "Buy and sell resources",
        badge: "Soon",
      },
      {
        id: "profile",
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
  { id: "settings", label: "Settings", to: "/settings", icon: Settings, description: "Workspace preferences" },
];

export const aiNav: NavItem = {
  id: "askBloomAi",
  label: "Ask Bloom AI",
  to: "/",
  icon: Sparkles,
  description: "Your teaching assistant",
};

export const allNavItems: NavItem[] = [...navSections.flatMap((s) => s.items), ...bottomNav];

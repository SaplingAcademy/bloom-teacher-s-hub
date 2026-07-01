import { Link, useRouterState } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeft, Sparkles } from "lucide-react";
import { navSections, bottomNav } from "@/lib/navigation";
import { BloomLogo, BloomMark } from "@/components/bloom/Logo";
import { cn } from "@/lib/utils";

type AppSidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
};

export function AppSidebar({ collapsed, onToggle, onNavigate }: AppSidebarProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        {collapsed ? (
          <BloomMark className="mx-auto text-sidebar-primary" />
        ) : (
          <BloomLogo />
        )}
        <button
          onClick={onToggle}
          className={cn(
            "hidden rounded-lg p-1.5 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground lg:block",
            collapsed && "absolute",
          )}
          aria-label="Toggle sidebar"
        >
          {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-2">
        {navSections.map((section) => (
          <div key={section.id}>
            {!collapsed && (
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                {section.label}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.to);
                return (
                  <li key={item.label}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                        collapsed && "justify-center",
                      )}
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0" />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.badge && (
                        <span className="rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-semibold text-lilac">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-1 px-3 pb-4">
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-xl bg-gradient-warm px-3 py-2.5 text-sm font-semibold text-accent-foreground shadow-[var(--shadow-sm)] transition-transform hover:-translate-y-0.5",
            collapsed && "justify-center",
          )}
          title="Ask Bloom AI"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span>Ask Bloom AI</span>}
        </button>
        {bottomNav.map((item) => {
          const active = isActive(item.to);
          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                collapsed && "justify-center",
              )}
            >
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
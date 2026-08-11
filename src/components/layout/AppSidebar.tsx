import { useState, useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Sparkles, Pin, PinOff } from "lucide-react";
import { navSections, bottomNav } from "@/lib/navigation";
import { BloomLogo, BloomMark } from "@/components/bloom/Logo";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type AppSidebarProps = {
  isMobile?: boolean;
  onNavigate?: () => void;
  isPinned?: boolean;
  onTogglePin?: () => void;
  onExpandChange?: (expanded: boolean) => void;
};

export function AppSidebar({
  isMobile = false,
  onNavigate,
  isPinned = false,
  onTogglePin,
  onExpandChange,
}: AppSidebarProps) {
  const { t } = useLanguage();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  // Distinct interaction states
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived expansion state: Mobile drawer OR Pinned OR Mouse Hovered OR Keyboard Focus-Within
  const isExpanded = isMobile || isPinned || isHovered || isFocusWithin;

  // Inform parent when expansion state changes
  useEffect(() => {
    if (onExpandChange) {
      onExpandChange(isExpanded);
    }
  }, [isExpanded, onExpandChange]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (leaveTimerRef.current) {
        clearTimeout(leaveTimerRef.current);
      }
    };
  }, []);

  // Desktop hover enter (Immediate expansion, cancel any pending collapse timer)
  const handleMouseEnter = () => {
    if (isMobile) return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setIsHovered(true);
  };

  // Desktop hover leave (300ms anti-flicker delay, then collapse automatically)
  const handleMouseLeave = () => {
    if (isMobile) return;
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
    }
    leaveTimerRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 300);
  };

  // Focus expansion ONLY for keyboard users (Tab navigation)
  const handleFocus = (e: React.FocusEvent) => {
    if (isMobile) return;
    const target = e.target as HTMLElement;
    // Only trigger focus expansion if focused via keyboard (:focus-visible)
    if (target && target.matches && target.matches(":focus-visible")) {
      setIsFocusWithin(true);
    }
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (isMobile) return;
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsFocusWithin(false);
    }
  };

  // Handle link clicks: Blur mouse clicks so focus doesn't lock sidebar open
  const handleLinkClick = (e: React.MouseEvent) => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsFocusWithin(false);
    if (onNavigate) onNavigate();
  };

  // Escape key collapses unpinned sidebar
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !isPinned && !isMobile) {
      setIsHovered(false);
      setIsFocusWithin(false);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={cn(
          "flex h-screen flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl transition-all duration-300 ease-in-out",
          // Width transition
          isExpanded ? "w-[240px]" : "w-[72px]"
        )}
      >
        {/* ── Header: Logo + Pin Button ───────────────────────────── */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-sidebar-border transition-all duration-200",
            !isExpanded ? "justify-center px-0" : "justify-between px-4"
          )}
        >
          {!isExpanded ? (
            <BloomMark className="text-sidebar-primary" />
          ) : (
            <div className="flex items-center justify-between w-full">
              <BloomLogo />

              {/* Pin / Unpin button (Desktop only) */}
              {!isMobile && onTogglePin && (
                <button
                  onClick={onTogglePin}
                  className="rounded-lg p-1.5 text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground cursor-pointer"
                  title={isPinned ? t("common.close") : t("common.edit")}
                  aria-label={isPinned ? "Desafixar menu" : "Fixar menu"}
                >
                  {isPinned ? (
                    <PinOff className="h-4 w-4 text-emerald-500 fill-emerald-500/20" />
                  ) : (
                    <Pin className="h-4 w-4" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Navigation Items ───────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto sidebar-nav px-3 py-4 space-y-5">
          {navSections.map((section) => (
            <div key={section.id}>
              {/* Section Header */}
              {isExpanded && (
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40 transition-opacity duration-200">
                  {section.id === "workspace" ? t("nav.workspace", section.label) : t("nav.communitySection", section.label)}
                </p>
              )}

              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.to);
                  const itemLabel = t(`nav.${item.id}`, item.label);
                  const badgeLabel = item.badge ? t("nav.soon", item.badge) : null;

                  const linkContent = (
                    <Link
                      to={item.to}
                      onClick={handleLinkClick}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                        !isExpanded ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm font-semibold"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-colors",
                          active
                            ? "text-sidebar-accent-foreground"
                            : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                        )}
                      />

                      {isExpanded && (
                        <span className="flex-1 truncate transition-opacity duration-200">
                          {itemLabel}
                        </span>
                      )}

                      {isExpanded && badgeLabel && (
                        <span className="rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-semibold text-lilac">
                          {badgeLabel}
                        </span>
                      )}
                    </Link>
                  );

                  return (
                    <li key={item.id}>
                      {!isExpanded ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={10}>
                            <p className="text-xs font-semibold">{itemLabel}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        linkContent
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ── Bottom Section: Ask Bloom AI + Utility Links ────────── */}
        <div className="shrink-0 border-t border-sidebar-border px-3 py-3 space-y-1.5">
          {/* Ask Bloom AI CTA */}
          {!isExpanded ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="flex w-full items-center justify-center rounded-xl bg-gradient-warm py-2.5 text-accent-foreground shadow-sm hover:opacity-90 cursor-pointer"
                  title={t("nav.askBloomAi")}
                >
                  <Sparkles className="h-[18px] w-[18px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={10}>
                <p className="text-xs font-semibold">{t("nav.askBloomAi")}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <button
              className="flex w-full items-center gap-2.5 rounded-xl bg-gradient-warm px-3 py-2.5 text-sm font-semibold text-accent-foreground shadow-sm hover:opacity-90 transition-all cursor-pointer"
              title={t("nav.askBloomAi")}
            >
              <Sparkles className="h-[18px] w-[18px] shrink-0" />
              <span>{t("nav.askBloomAi")}</span>
            </button>
          )}

          {/* Bottom Utility Nav */}
          {bottomNav.map((item) => {
            const active = isActive(item.to);
            const itemLabel = t(`nav.${item.id}`, item.label);
            const navLink = (
              <Link
                key={item.id}
                to={item.to}
                onClick={handleLinkClick}
                className={cn(
                  "group flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-150 cursor-pointer",
                  !isExpanded ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                  )}
                />
                {isExpanded && <span className="truncate">{itemLabel}</span>}
              </Link>
            );

            return !isExpanded ? (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p className="text-xs font-semibold">{itemLabel}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              navLink
            );
          })}
        </div>
      </aside>
    </TooltipProvider>
  );
}

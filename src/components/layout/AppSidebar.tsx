import { useState, useEffect, useRef } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Pin, PinOff } from "lucide-react";
import { navSections, bottomNav, adminNavItem } from "@/lib/navigation";
import { usePlan } from "@/hooks/use-plan";
import { ACADEMY_PUBLISHED } from "@/lib/academy-access";
import { BloomMark } from "@/components/bloom/Logo";
import { Button } from "@/components/ui/button";
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
  const { isSuperAdmin } = usePlan();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string) => (to === "/" ? pathname === "/" : pathname.startsWith(to));

  // Distinct interaction states
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Derived expansion state: Mobile drawer OR Pinned OR Mouse Hovered OR Keyboard Focus-Within
  const isExpanded = isMobile || isPinned || isHovered || isFocusWithin;

  // Text stays mounted in a reserved track; expansion never changes row geometry.
  const textClasses = cn(
    "min-w-0 transition-[opacity,visibility] duration-200 motion-reduce:transition-none",
    isExpanded ? "visible opacity-100" : "invisible opacity-0"
  );
  const rowClasses = "group grid h-10 grid-cols-[47px_minmax(0,1fr)] items-center rounded-xl pr-3 text-sm font-medium transition-colors duration-150";

  // Inform parent when expansion state changes
  useEffect(() => {
    if (onExpandChange) {
      onExpandChange(isExpanded);
    }
  }, [isExpanded, onExpandChange]);

  // Tooltips are fully controlled: at most one open, only while collapsed.
  // Mixing `open={false}` with `undefined` let Radix keep stale internal
  // "open" state that resurfaced when the sidebar collapsed again.
  const [openTooltipId, setOpenTooltipId] = useState<string | null>(null);

  useEffect(() => {
    setOpenTooltipId(null);
  }, [isExpanded]);

  const tooltipProps = (id: string) => ({
    open: !isExpanded && openTooltipId === id,
    onOpenChange: (open: boolean) => {
      if (open) {
        if (!isExpanded) setOpenTooltipId(id);
      } else {
        setOpenTooltipId((current) => (current === id ? null : current));
      }
    },
  });

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
          "flex h-dvh shrink-0 flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
          // Width transition
          isExpanded ? "w-[240px]" : "w-[72px]"
        )}
      >
        {/* ── Header: Logo + Pin Button ───────────────────────────── */}
        <div className="grid h-14 shrink-0 grid-cols-[71px_minmax(0,1fr)] items-center border-b border-sidebar-border">
          <BloomMark className="justify-self-center text-sidebar-primary" />
          <div aria-hidden={!isExpanded} className={cn("flex items-center justify-between pr-4", textClasses)}>
            <span className="font-display text-lg font-bold text-sidebar-foreground">Bloom</span>

            {/* Pin / Unpin button (Desktop only) */}
            {!isMobile && onTogglePin && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onTogglePin}
                  tabIndex={isExpanded ? 0 : -1}
                  className="h-7 w-7 shrink-0 rounded-lg p-1.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  title={isPinned ? t("common.close") : t("common.edit")}
                  aria-label={isPinned ? t("auditUi.unpinMenu") : t("auditUi.pinMenu")}
                >
                  {isPinned ? (
                    <PinOff className="h-4 w-4 text-sidebar-pin fill-sidebar-pin/20" />
                  ) : (
                    <Pin className="h-4 w-4" />
                  )}
                </Button>
              )}
          </div>
        </div>

        {/* ── Navigation Items ───────────────────────────────────── */}
        <nav className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto sidebar-nav px-3 py-3 space-y-5">
          {navSections.map((section) => (
            <div key={section.id}>
              {/* Section Header (the primary workspace section has none, to save vertical space) */}
              {section.id !== "workspace" && (
                <p aria-hidden={!isExpanded} className={cn("mb-1.5 h-[15px] whitespace-nowrap px-2 text-[10px] leading-[15px] font-semibold uppercase tracking-widest text-sidebar-foreground/40", textClasses)}>
                  {t("nav.communitySection", section.label)}
                </p>
              )}

              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = !item.disabled && isActive(item.to);
                  const itemLabel = item.id === "academy" ? t("academy.nav") : t(`nav.${item.id}`, item.label);
                  const badgeLabel = item.id === "academy"
                    ? (!ACADEMY_PUBLISHED && !isSuperAdmin ? t("academy.soonBadge") : null)
                    : item.badge ? t("nav.soon", item.badge) : null;

                  const baseClasses = cn(
                    rowClasses,
                    item.disabled
                      ? "cursor-not-allowed text-sidebar-foreground/40 opacity-60"
                      : active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm font-semibold cursor-pointer"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground cursor-pointer"
                  );

                  const iconClasses = cn(
                    "h-[18px] w-[18px] shrink-0 justify-self-center transition-colors",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                  );

                  const labelSpan = (
                    <span aria-hidden={!isExpanded} className={cn("flex items-center gap-2 overflow-hidden", textClasses)}>
                      <span className={cn("min-w-0 flex-1", item.id === "academy" ? "leading-4" : "truncate")}>
                        {itemLabel}
                      </span>
                      {badgeLabel && (
                        <span className="shrink-0 rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-semibold text-lilac">
                          {badgeLabel}
                        </span>
                      )}
                    </span>
                  );

                  const linkContent = item.disabled ? (
                    <span
                      aria-disabled="true"
                      aria-label={itemLabel}
                      tabIndex={-1}
                      className={baseClasses}
                      onClick={(e) => e.preventDefault()}
                    >
                      <item.icon className={iconClasses} />
                      {labelSpan}
                    </span>
                  ) : (
                    <Link
                      to={item.to}
                      aria-label={itemLabel}
                      onClick={handleLinkClick}
                      className={baseClasses}
                    >
                      <item.icon className={iconClasses} />
                      {labelSpan}
                    </Link>
                  );

                  return (
                    <li key={item.id}>
                        <Tooltip {...tooltipProps(`nav:${item.id}`)}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" sideOffset={10}>
                            <p className="text-xs font-semibold">{itemLabel}</p>
                            {item.id === "academy" && badgeLabel && <p className="mt-1 text-xs">{badgeLabel}</p>}
                          </TooltipContent>
                        </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* ── Bottom Section: Utility Links ───────────────────────── */}
        <div className="shrink-0 border-t border-sidebar-border px-3 py-2 space-y-1">
          {/* Bottom Utility Nav (Administração só aparece para super_admin) */}
          {(isSuperAdmin ? [...bottomNav, adminNavItem] : bottomNav).map((item) => {
            const active = isActive(item.to);
            const itemLabel = t(`nav.${item.id}`, item.label);
            const navLink = (
              <Link
                key={item.id}
                to={item.to}
                aria-label={itemLabel}
                onClick={handleLinkClick}
                className={cn(
                  rowClasses, "cursor-pointer",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
              >
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 justify-self-center transition-colors",
                    active
                      ? "text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"
                  )}
                />
                <span aria-hidden={!isExpanded} className={cn("truncate", textClasses)}>{itemLabel}</span>
              </Link>
            );

            return (
              <Tooltip key={item.id} {...tooltipProps(`bottom:${item.id}`)}>
                <TooltipTrigger asChild>{navLink}</TooltipTrigger>
                <TooltipContent side="right" sideOffset={10}>
                  <p className="text-xs font-semibold">{itemLabel}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </aside>
    </TooltipProvider>
  );
}

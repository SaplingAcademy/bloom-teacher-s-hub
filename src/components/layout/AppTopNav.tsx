import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronsUpDown, Menu } from "lucide-react";
import { BloomMark } from "@/components/bloom/Logo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { AccountMenuPanel } from "@/components/layout/SidebarAccountMenu";
import { TeacherAvatarContent, useTeacherIdentity } from "@/components/layout/TeacherAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { usePlan } from "@/hooks/use-plan";
import { useLanguage } from "@/hooks/use-language";
import { ACADEMY_PUBLISHED } from "@/lib/academy-access";
import { getTopNav, isNavItemActive, type NavItem, type TopNavBreakpoint } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Same container width as the page content, so the bar and the pages line up. */
export const APP_CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8";

// Static class names per breakpoint (Tailwind needs literal strings).
const SHOW_IN_BAR: Record<TopNavBreakpoint, string> = { md: "", lg: "hidden lg:inline-flex", xl: "hidden xl:inline-flex" };
const HIDE_IN_MORE: Record<TopNavBreakpoint, string> = { md: "hidden", lg: "lg:hidden", xl: "xl:hidden" };
const MORE_ACTIVE_BELOW: Record<TopNavBreakpoint, string> = {
  md: "",
  lg: "max-lg:text-foreground max-lg:after:bg-accent",
  xl: "max-xl:text-foreground max-xl:after:bg-accent",
};

/** Label, badge and state of a nav item: one place for the bar, the "Mais" menu and the mobile menu. */
function useNavItemView() {
  const { t } = useLanguage();
  const { isSuperAdmin } = usePlan();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (item: NavItem) => ({
    label: item.id === "academy" ? t("academy.nav") : t(`nav.${item.id}`, item.label),
    badge:
      item.id === "academy"
        ? !ACADEMY_PUBLISHED && !isSuperAdmin
          ? t("academy.soonBadge")
          : null
        : item.badge
          ? t("nav.soon", item.badge)
          : null,
    active: isNavItemActive(item, pathname),
    disabled: Boolean(item.disabled),
  });
}

function Badge({ children }: { children: string }) {
  return (
    <span className="shrink-0 rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-lilac">
      {children}
    </span>
  );
}

const barItemClasses =
  "relative inline-flex h-12 shrink-0 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium transition-colors " +
  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-transparent after:transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring rounded-md cursor-pointer";

/**
 * Main app navigation: a dark-green header (logo, notifications, teacher account) and, from md up, a
 * horizontal bar with the main sections plus a "Mais" menu. Below md the bar is replaced by a menu
 * opened from the header. All three views render the same items from getTopNav().
 */
export function AppTopNav() {
  const { t } = useLanguage();
  const { isSuperAdmin } = usePlan();
  const view = useNavItemView();
  const { primary, more } = getTopNav();
  const [mobileOpen, setMobileOpen] = useState(false);

  const movedToMore = primary.filter((p) => p.showFrom !== "md");
  const activeMoved = movedToMore.find((p) => view(p.item).active);
  const activeInMore = more.some((item) => view(item).active);

  return (
    <div className="relative z-40 shrink-0">
      {/* Row 1 — header */}
      <header className="bg-sidebar text-sidebar-foreground">
        <div className={cn(APP_CONTAINER, "flex h-14 items-center gap-2")}>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="-ml-2 grid h-10 w-10 place-items-center rounded-xl text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:hidden"
            aria-label={t("globalUi.openNavigation")}
            aria-expanded={mobileOpen}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <BloomMark className="text-sidebar-primary" />
            <span className="font-display text-lg font-bold tracking-tight text-sidebar-foreground">Bloom</span>
          </Link>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <NotificationBell className="h-9 w-9 border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:ring-sidebar-ring" />
            <HeaderAccountMenu isAdmin={isSuperAdmin} />
          </div>
        </div>
      </header>

      {/* Row 2 — horizontal navigation (md and up) */}
      <nav aria-label={t("nav.mainNavigation")} className="hidden border-b border-border bg-card md:block">
        <div className={cn(APP_CONTAINER, "flex h-12 items-center gap-0.5")}>
          {/* -ml-3 cancels the items' horizontal padding so the first label lines up with the logo and the content. */}
          <div className="-ml-3 flex items-center gap-0.5">
            {primary.map(({ item, showFrom }) => {
              const v = view(item);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  aria-current={v.active ? "page" : undefined}
                  className={cn(
                    barItemClasses,
                    SHOW_IN_BAR[showFrom],
                    v.active
                      ? "font-semibold text-foreground after:bg-accent"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className={cn("h-4 w-4", v.active ? "text-accent" : "")} aria-hidden="true" />
                  {v.label}
                </Link>
              );
            })}

            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  barItemClasses,
                  "data-[state=open]:text-foreground",
                  activeInMore ? "font-semibold text-foreground after:bg-accent" : "text-muted-foreground hover:text-foreground",
                  !activeInMore && activeMoved && MORE_ACTIVE_BELOW[activeMoved.showFrom],
                )}
              >
                {t("nav.more")}
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-max min-w-64 max-w-[calc(100vw-2rem)] rounded-xl p-1.5">
                {movedToMore.map(({ item, showFrom }) => (
                  <MoreItem key={item.id} item={item} view={view} className={HIDE_IN_MORE[showFrom]} />
                ))}
                {movedToMore.length > 0 && <DropdownMenuSeparator className="xl:hidden" />}
                {more.map((item) => (
                  <MoreItem key={item.id} item={item} view={view} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </nav>

      {/* Mobile menu (below md): same items, full list */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" aria-describedby={undefined} className="w-[min(20rem,85vw)] border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <BloomMark className="text-sidebar-primary" />
            <SheetTitle className="font-display text-lg font-bold text-sidebar-foreground">Bloom</SheetTitle>
          </div>
          <nav aria-label={t("nav.mainNavigation")} className="overflow-y-auto px-3 py-3">
            <ul className="space-y-1">
              {primary.map(({ item }) => (
                <MobileItem key={item.id} item={item} view={view} onNavigate={() => setMobileOpen(false)} />
              ))}
            </ul>
            <p className="mb-1.5 mt-4 px-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/45">
              {t("nav.more")}
            </p>
            <ul className="space-y-1">
              {more.map((item) => (
                <MobileItem key={item.id} item={item} view={view} onNavigate={() => setMobileOpen(false)} />
              ))}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}

type ItemView = ReturnType<typeof useNavItemView>;

function MoreItem({ item, view, className }: { item: NavItem; view: ItemView; className?: string }) {
  const v = view(item);
  const content = (
    <>
      <item.icon className={cn("h-4 w-4 shrink-0", v.active ? "text-accent" : "text-muted-foreground")} aria-hidden="true" />
      <span className="flex-1 whitespace-nowrap">{v.label}</span>
      {v.badge && <Badge>{v.badge}</Badge>}
    </>
  );
  const itemClasses = cn(
    "flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm cursor-pointer",
    v.active ? "bg-accent-soft/60 font-semibold text-foreground" : "font-medium",
    className,
  );
  if (v.disabled) {
    return (
      <DropdownMenuItem disabled className={itemClasses}>
        {content}
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild className={itemClasses}>
      <Link to={item.to} aria-current={v.active ? "page" : undefined}>
        {content}
      </Link>
    </DropdownMenuItem>
  );
}

function MobileItem({ item, view, onNavigate }: { item: NavItem; view: ItemView; onNavigate: () => void }) {
  const v = view(item);
  const classes = cn(
    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm transition-colors",
    v.disabled
      ? "cursor-not-allowed text-sidebar-foreground/40"
      : v.active
        ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
        : "font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
  );
  const content = (
    <>
      <item.icon className={cn("h-[18px] w-[18px] shrink-0", v.active ? "text-sidebar-primary" : "")} aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">{v.label}</span>
      {v.badge && <Badge>{v.badge}</Badge>}
    </>
  );
  return (
    <li>
      {v.disabled ? (
        <span aria-disabled="true" className={classes}>
          {content}
        </span>
      ) : (
        <Link to={item.to} aria-current={v.active ? "page" : undefined} onClick={onNavigate} className={classes}>
          {content}
        </Link>
      )}
    </li>
  );
}

/** Teacher avatar (and name from lg) in the header, opening the shared account menu. */
function HeaderAccountMenu({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useLanguage();
  const { name, email } = useTeacherIdentity();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("sidebarAccount.menu")}
          className={cn(
            "flex h-10 items-center gap-2 rounded-xl px-1 transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:pl-1 lg:pr-2 cursor-pointer",
            open && "bg-sidebar-accent",
          )}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-lilac text-xs font-semibold text-lilac-foreground">
            <TeacherAvatarContent />
          </span>
          <span className="hidden max-w-[11rem] truncate text-sm font-semibold text-sidebar-foreground lg:block">
            {name || email}
          </span>
          <ChevronsUpDown className="hidden h-4 w-4 shrink-0 text-sidebar-foreground/55 lg:block" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-60 rounded-xl border-border p-1.5 shadow-[var(--shadow-lg)]"
      >
        {(name || email) && (
          <div className="px-2.5 pb-2 pt-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{name || email}</p>
            {name && email && <p className="truncate text-[11px] text-muted-foreground">{email}</p>}
          </div>
        )}
        {(name || email) && <div className="my-1 h-px bg-border/60" />}
        <AccountMenuPanel isAdmin={isAdmin} onClose={() => setOpen(false)} onNavigate={() => {}} />
      </PopoverContent>
    </Popover>
  );
}

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, ChevronsUpDown } from "lucide-react";
import { BloomMark } from "@/components/bloom/Logo";
import { NotificationBell } from "@/components/layout/NotificationBell";
import { AccountMenuPanel } from "@/components/layout/SidebarAccountMenu";
import { TeacherAvatarContent, useTeacherIdentity } from "@/components/layout/TeacherAvatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePlan } from "@/hooks/use-plan";
import { useLanguage } from "@/hooks/use-language";
import { ACADEMY_PUBLISHED } from "@/lib/academy-access";
import { getNavGroups, isNavItemActive, type NavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/** Same container width as the page content, so the header and the pages line up. */
export const APP_CONTAINER = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8";

const GROUP_LABEL_KEYS: Record<string, string> = {
  management: "nav.groupManagement",
  business: "nav.groupBusiness",
  resources: "nav.groupResources",
};

/** Label, badge and state of a module, shared by every entry of the panel. */
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

type ItemView = ReturnType<typeof useNavItemView>;

function Badge({ children }: { children: string }) {
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full bg-lilac-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-lilac">
      {children}
    </span>
  );
}

/**
 * Main app navigation: the dark-green header (logo, notifications, teacher account) is always
 * visible; the modules live in a collapsible mega menu opened from the small centred tab under the
 * header. Closed by default; the open panel floats over the page (nothing is pushed down).
 * - Mouse: hovering the tab opens it; it stays open while the pointer is over the tab or the panel
 *   (they touch, no gap) and closes HOVER_CLOSE_DELAY ms after leaving them, unless the pointer
 *   comes back first. Other header areas never open it.
 * - Click/tap/keyboard: the tab toggles it (a click on a hover-opened menu keeps it open, and then
 *   it no longer closes on leave). Touch pointers never trigger the hover behaviour.
 * - Always: Esc, a click outside or choosing a module closes it.
 * - Motion ("awning"): anchored right under the header, the panel's visible height grows from 0 to
 *   its full height on open and shrinks back to 0 on close (PANEL_ANIM_MS, ease-in-out; on hover
 *   close it starts after the tolerance). The content is clipped while it moves, the bottom
 *   border and the tab follow the bottom edge, and nothing fades or slides. It stays mounted while
 *   retracting, so a pointer coming back reverses the transition from the current height. With
 *   prefers-reduced-motion there is no transition and it hides at once.
 * The same panel serves desktop, tablet and mobile (columns adapt to the width).
 */
/** Delay before a hover-opened menu closes after the pointer leaves the tab and the panel. */
export const HOVER_CLOSE_DELAY = 200;
/** Duration of the panel's expand / retract transition (ms). */
export const PANEL_ANIM_MS = 300;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

export function AppTopNav() {
  const { t } = useLanguage();
  const { isSuperAdmin } = usePlan();
  const view = useNavItemView();
  const groups = getNavGroups();
  const [open, setOpen] = useState(false);
  // "hover": opened by the mouse over the tab (auto-closes on leave); "click": opened by click,
  // tap or keyboard (stays until toggled, Esc, outside click or navigation).
  const [openMode, setOpenMode] = useState<"hover" | "click">("click");
  const menuRef = useRef<HTMLDivElement>(null);
  const tabRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // `mounted`: the panel is in the layout (not hidden); `shown`: expanded. Opening mounts it
  // collapsed (height 0) and expands it on the next layout pass, so the transition starts from 0;
  // closing collapses it and unmounts it once retracted.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelUnmount = () => {
    if (unmountTimerRef.current) {
      clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }
  };
  useEffect(() => cancelUnmount, []);

  useEffect(() => {
    if (open) {
      cancelUnmount();
      setMounted(true);
      return;
    }
    setShown(false);
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    // transitionend is not guaranteed (e.g. interrupted styles), so a timer bounds the exit.
    unmountTimerRef.current = setTimeout(() => {
      unmountTimerRef.current = null;
      setMounted(false);
    }, PANEL_ANIM_MS + 20);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !mounted || shown) return;
    void panelRef.current?.offsetHeight; // commit the start styles before switching to shown
    setShown(true);
  }, [open, mounted, shown]);

  const cancelHoverClose = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  useEffect(() => cancelHoverClose, []);

  const isMouse = (event: React.PointerEvent) => event.pointerType === "mouse";
  const onTabPointerEnter = (event: React.PointerEvent) => {
    if (!isMouse(event)) return;
    cancelHoverClose();
    if (!open) {
      setOpenMode("hover");
      setOpen(true);
    }
  };
  const onRegionPointerEnter = (event: React.PointerEvent) => {
    if (!isMouse(event)) return;
    cancelHoverClose();
    // Pointer back on the panel while it is fading out: reopen from where the transition is.
    if (!open && mounted) {
      setOpenMode("hover");
      setOpen(true);
    }
  };
  const onRegionPointerLeave = (event: React.PointerEvent) => {
    if (!isMouse(event) || !open || openMode !== "hover") return;
    cancelHoverClose();
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      setOpen(false);
    }, HOVER_CLOSE_DELAY);
  };
  const onTabClick = () => {
    cancelHoverClose();
    if (!open) {
      setOpenMode("click");
      setOpen(true);
    } else if (openMode === "hover") {
      setOpenMode("click"); // the click confirms the hover-opened menu instead of closing it
    } else {
      setOpen(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        tabRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => {
    cancelHoverClose();
    setOpen(false);
  };

  return (
    <div className="relative z-40 shrink-0">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className={cn(APP_CONTAINER, "flex h-14 items-center gap-2")}>
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

      {/* Mega menu: floats over the page (absolute), so it takes no space while closed. */}
      <div ref={menuRef} className="absolute inset-x-0 top-full flex flex-col items-center">
        {/* DOM order: tab first, then the panel (keyboard Tab goes from the tab into the modules);
            visually the panel sits above the tab, which hangs from its bottom edge. */}
        <button
          ref={tabRef}
          type="button"
          onClick={onTabClick}
          onPointerEnter={onTabPointerEnter}
          onPointerLeave={onRegionPointerLeave}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
          className={cn(
            "relative order-2 -mt-px grid h-6 w-16 place-items-center rounded-b-xl bg-sidebar text-sidebar-foreground/75 shadow-[0_4px_10px_-4px_rgb(0_0_0/0.35)] transition-colors hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring cursor-pointer",
            // While open, an invisible strip above the tab overlaps the panel's bottom edge, so
            // moving the pointer between them never counts as leaving.
            open && "before:absolute before:inset-x-0 before:-top-3 before:h-3 before:content-['']",
          )}
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>

        <div
          ref={panelRef}
          id={panelId}
          hidden={!mounted}
          data-state={shown ? "open" : "closed"}
          onPointerEnter={onRegionPointerEnter}
          onPointerLeave={onRegionPointerLeave}
          className={cn(
            // Height animates via grid rows 0fr ↔ 1fr (to the content's real height, reversible
            // mid-way); the inner wrapper clips the content. The tab (order-2) sits right after
            // this element in the column, so it follows the bottom edge.
            "order-1 grid w-full border-b border-border bg-card shadow-[var(--shadow-lg)] transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none",
            shown ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <nav
              aria-label={t("nav.mainNavigation")}
              className={cn(APP_CONTAINER, "max-h-[calc(100dvh-3.5rem-2.5rem)] overflow-y-auto py-5 sm:py-6")}
            >
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 md:grid-cols-3 lg:gap-x-12">
                {groups.map((group) => {
                  const headingId = `${panelId}-${group.id}`;
                  return (
                    <section key={group.id} aria-labelledby={headingId}>
                      <h2
                        id={headingId}
                        className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80"
                      >
                        {t(GROUP_LABEL_KEYS[group.id] ?? group.id)}
                      </h2>
                      <ul className="space-y-0.5">
                        {group.items.map((item) => (
                          <ModuleItem key={item.id} item={item} view={view} onNavigate={close} />
                        ))}
                      </ul>
                    </section>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModuleItem({ item, view, onNavigate }: { item: NavItem; view: ItemView; onNavigate: () => void }) {
  const v = view(item);
  const classes = cn(
    "relative flex min-h-11 w-full max-w-sm items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
    v.disabled
      ? "cursor-not-allowed text-muted-foreground/60"
      : v.active
        ? "bg-accent-soft/35 font-semibold text-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-accent"
        : "font-medium text-foreground/80 hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  );
  const content = (
    <>
      <item.icon
        className={cn("h-5 w-5 shrink-0", v.active ? "text-accent" : v.disabled ? "text-muted-foreground/50" : "text-muted-foreground")}
        aria-hidden="true"
      />
      <span className="whitespace-nowrap">{v.label}</span>
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
        <Link to={item.to} onClick={onNavigate} aria-current={v.active ? "page" : undefined} className={classes}>
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

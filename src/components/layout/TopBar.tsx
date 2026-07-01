import { Menu, Search, Bell, Plus, Command } from "lucide-react";

type TopBarProps = {
  onOpenMobileNav: () => void;
};

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <button
        onClick={onOpenMobileNav}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5" />
      </button>

      <label className="relative hidden max-w-md flex-1 items-center sm:flex">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search students, lessons, resources…"
          className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <kbd className="absolute right-3 hidden items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>
        <button
          className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-background" />
        </button>
        <button
          className="grid h-10 w-10 place-items-center rounded-full bg-gradient-lilac text-sm font-semibold text-lilac-foreground"
          aria-label="Account"
        >
          MR
        </button>
      </div>
    </header>
  );
}
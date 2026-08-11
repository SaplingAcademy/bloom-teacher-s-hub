import { Menu, Search, Bell, Plus, Command, Globe, ChevronDown } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";

type TopBarProps = {
  onOpenMobileNav: () => void;
};

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  const { lang, setLang, t } = useLanguage();
  const { user, signOut } = useAuth();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (
        profileDropdownRef.current &&
        !profileDropdownRef.current.contains(event.target as Node)
      ) {
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getInitials = () => {
    if (!user) return "U";
    const name = user.user_metadata?.display_name || user.email || "";
    if (!name) return "U";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-header-border bg-header-bg/95 px-4 shadow-[0_2px_8px_rgba(34,28,24,0.035)] dark:shadow-none backdrop-blur-md sm:px-6">
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
          placeholder={t("common.search", "Search students, lessons, resources…")}
          className="h-10 w-full rounded-xl border border-search-border bg-search-bg pl-9 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-[0_1.5px_3px_rgba(34,28,24,0.03)] dark:shadow-none"
        />
        <kbd className="absolute right-3 hidden items-center gap-0.5 rounded-md border border-border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground md:flex">
          <Command className="h-3 w-3" />K
        </kbd>
      </label>

      <div className="ml-auto flex items-center gap-2">
        <button className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-sm)] transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t("common.new", "New")}</span>
        </button>

        {/* Global Language Selector Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-search-border bg-search-bg px-3 text-sm font-semibold text-foreground hover:bg-secondary/80 transition-all cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            aria-label="Select Language"
          >
            <Globe className="h-[18px] w-[18px] text-muted-foreground" />
            <span className="hidden sm:inline">{lang === "en" ? "English" : "Português"}</span>
            <span className="sm:hidden">{lang === "en" ? "EN" : "PT"}</span>
            <ChevronDown
              className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200"
              style={{ transform: dropdownOpen ? "rotate(180deg)" : "none" }}
            />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-lg)] z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <button
                onClick={() => {
                  setLang("en");
                  setDropdownOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-left transition-colors cursor-pointer ${
                  lang === "en"
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <span>🇺🇸</span>
                <span>English</span>
              </button>
              <button
                onClick={() => {
                  setLang("pt");
                  setDropdownOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-left transition-colors cursor-pointer ${
                  lang === "pt"
                    ? "bg-primary/10 text-primary font-bold"
                    : "text-foreground hover:bg-secondary"
                }`}
              >
                <span>🇧🇷</span>
                <span>Português</span>
              </button>

              <div className="border-t border-border/40 my-1"></div>

              <button
                disabled
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-muted-foreground/50 text-left cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <span>🇪🇸</span>
                  <span>Español</span>
                </div>
                <span className="text-[9px] uppercase font-bold text-muted-foreground/40 bg-secondary px-1 py-0.5 rounded">
                  Soon
                </span>
              </button>

              <button
                disabled
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-muted-foreground/50 text-left cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <span>🇫🇷</span>
                  <span>Français</span>
                </div>
                <span className="text-[9px] uppercase font-bold text-muted-foreground/40 bg-secondary px-1 py-0.5 rounded">
                  Soon
                </span>
              </button>

              <button
                disabled
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-muted-foreground/50 text-left cursor-not-allowed"
              >
                <div className="flex items-center gap-2">
                  <span>🇩🇪</span>
                  <span>Deutsch</span>
                </div>
                <span className="text-[9px] uppercase font-bold text-muted-foreground/40 bg-secondary px-1 py-0.5 rounded">
                  Soon
                </span>
              </button>
            </div>
          )}
        </div>

        <button
          className="relative rounded-xl p-2.5 text-muted-foreground transition-colors hover:bg-secondary"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent ring-2 ring-header-bg" />
        </button>

        {/* User Account Dropdown */}
        <div className="relative" ref={profileDropdownRef}>
          <button
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
            className="grid h-10 w-10 place-items-center rounded-full bg-gradient-lilac text-sm font-semibold text-lilac-foreground cursor-pointer transition-transform hover:scale-105"
            aria-label="Account Menu"
          >
            {getInitials()}
          </button>

          {profileDropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-lg)] z-50 animate-in fade-in slide-in-from-top-2 duration-150 font-figtree">
              {/* User details */}
              <div className="px-3 py-2 border-b border-border/40 mb-1.5">
                <p className="text-xs font-bold text-foreground truncate">
                  {user?.user_metadata?.display_name ||
                    (lang === "pt" ? "Professor Bloom" : "Bloom Teacher")}
                </p>
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{user?.email}</p>
              </div>

              {/* Actions */}
              <Link
                to="/profile"
                onClick={() => setProfileDropdownOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                <span>👤</span>
                <span>{lang === "pt" ? "Meu Perfil" : "My Profile"}</span>
              </Link>
              <Link
                to="/settings"
                onClick={() => setProfileDropdownOpen(false)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-foreground hover:bg-secondary transition-colors"
              >
                <span>⚙️</span>
                <span>{lang === "pt" ? "Configurações" : "Settings"}</span>
              </Link>

              <div className="border-t border-border/40 my-1"></div>

              <button
                onClick={async () => {
                  setProfileDropdownOpen(false);
                  await signOut();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-bold text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <span>🚪</span>
                <span>{lang === "pt" ? "Sair" : "Log Out"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

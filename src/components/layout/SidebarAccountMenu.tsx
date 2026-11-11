import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, Globe, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { accountNav, adminNavItem } from "@/lib/navigation";
import { TeacherAvatarContent, useTeacherIdentity } from "@/components/layout/TeacherAvatar";
import { cn } from "@/lib/utils";

const MENU_LABEL_KEYS: Record<string, string> = { profile: "sidebarAccount.myProfile", settings: "sidebarAccount.settings" };
const LANGUAGES = [
  { code: "pt", short: "PT", labelKey: "settingsUi.portugueseBrazil" },
  { code: "en", short: "EN", labelKey: "settingsUi.englishUS" },
] as const;

/**
 * Teacher block fixed in the sidebar footer (avatar, name, e-mail) that opens a small menu above
 * it with "Meu perfil", "Configurações" ("Administração" only for users the existing super_admin
 * check already allows), the platform language (same setLang as Settings) and "Sair". Identity and
 * avatar come from the shared TeacherAvatar module; without a valid name the e-mail is the only line.
 */
export function SidebarAccountMenu({
  isExpanded,
  textClasses,
  open,
  onOpenChange,
  onNavigate,
  isAdmin = false,
}: {
  isExpanded: boolean;
  /** Same reserved-track text classes as the nav rows (keeps geometry stable when collapsing). */
  textClasses: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
  /** Result of the existing super_admin check (usePlan); the database re-verifies the role. */
  isAdmin?: boolean;
}) {
  const { lang, setLang, t } = useLanguage();
  const { signOut } = useAuth();
  const { name: teacherName, email } = useTeacherIdentity();
  const primary = teacherName || email;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("sidebarAccount.menu")}
          className={cn(
            "group grid h-12 w-full min-w-[47px] grid-cols-[47px_minmax(0,1fr)] items-center rounded-xl pr-2 text-left transition-colors duration-150 cursor-pointer",
            "hover:bg-sidebar-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            open && "bg-sidebar-accent/50",
          )}
        >
          <span className="grid h-8 w-8 place-items-center justify-self-center overflow-hidden rounded-full bg-gradient-lilac text-xs font-semibold text-lilac-foreground">
            <TeacherAvatarContent />
          </span>
          <span aria-hidden={!isExpanded} className={cn("flex items-center gap-2 overflow-hidden", textClasses)}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold leading-5 text-sidebar-foreground">{primary}</span>
              {teacherName && email && (
                <span className="block truncate text-[11px] leading-4 text-sidebar-foreground/55">{email}</span>
              )}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-foreground/45 transition-colors group-hover:text-sidebar-foreground/70" aria-hidden="true" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56 rounded-xl border-border p-1.5 shadow-[var(--shadow-lg)]"
      >
        <nav aria-label={t("sidebarAccount.menu")}>
          {accountNav.map((item) => (
            <Link
              key={item.id}
              to={item.to}
              onClick={() => {
                onOpenChange(false);
                onNavigate();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
            >
              <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span>{t(MENU_LABEL_KEYS[item.id] ?? `nav.${item.id}`)}</span>
            </Link>
          ))}
          {isAdmin && (
            <>
              <div role="separator" className="mx-1 my-1 h-px bg-border/60" />
              <Link
                to={adminNavItem.to}
                onClick={() => {
                  onOpenChange(false);
                  onNavigate();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none"
              >
                <adminNavItem.icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{t("nav.admin", adminNavItem.label)}</span>
                <span className="shrink-0 rounded border border-amber-200/80 bg-amber-50 px-1.5 py-px text-[9px] font-bold leading-4 tracking-wider text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
                  {t("sidebarAccount.adminTag")}
                </span>
              </Link>
            </>
          )}
        </nav>
        <div className="my-1 h-px bg-border/60" />
        <div role="group" aria-label={t("sidebarAccount.language")} className="flex items-center gap-2 px-2.5 py-1.5">
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="flex-1 text-xs font-semibold text-foreground">{t("sidebarAccount.language")}</span>
          <div className="flex rounded-lg bg-secondary p-0.5">
            {LANGUAGES.map((option) => (
              <button
                key={option.code}
                type="button"
                aria-pressed={lang === option.code}
                aria-label={t(option.labelKey)}
                title={t(option.labelKey)}
                onClick={() => setLang(option.code)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  lang === option.code ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.short}
              </button>
            ))}
          </div>
        </div>
        <div className="my-1 h-px bg-border/60" />
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            signOut();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("common.logout")}</span>
        </button>
      </PopoverContent>
    </Popover>
  );
}

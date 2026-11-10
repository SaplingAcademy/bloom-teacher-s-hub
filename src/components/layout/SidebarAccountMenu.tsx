import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronsUpDown, User } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { accountNav } from "@/lib/navigation";
import { resolveAccountDisplayName, teacherInitials } from "@/lib/teacher-name";
import { cn } from "@/lib/utils";

const MENU_LABEL_KEYS: Record<string, string> = { profile: "sidebarAccount.myProfile", settings: "sidebarAccount.settings" };

/**
 * Teacher block fixed in the sidebar footer (avatar, name, e-mail) that opens a small menu above
 * it with "Meu perfil" and "Configurações". Uses the authenticated teacher's real data: the name
 * saved in the profile (resolveAccountDisplayName; without a valid name the e-mail is the only line),
 * photo from public.profiles.avatar_url, else the real name's initials, else a neutral user icon.
 */
export function SidebarAccountMenu({
  isExpanded,
  textClasses,
  open,
  onOpenChange,
  onNavigate,
}: {
  isExpanded: boolean;
  /** Same reserved-track text classes as the nav rows (keeps geometry stable when collapsing). */
  textClasses: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
}) {
  const { t, lang } = useLanguage();
  const { user, profile } = useAuth();
  const teacherName = resolveAccountDisplayName(profile, user);
  const email = (user?.email as string | undefined) || "";
  const primary = teacherName || email;
  const avatarUrl = (profile?.avatar_url as string | null | undefined) || null;
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);

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
            {avatarUrl && !avatarFailed ? (
              <img key={avatarUrl} src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setAvatarFailed(true)} />
            ) : (
              teacherName ? teacherInitials(teacherName, lang) : <User className="h-4 w-4" aria-hidden="true" />
            )}
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
        </nav>
      </PopoverContent>
    </Popover>
  );
}

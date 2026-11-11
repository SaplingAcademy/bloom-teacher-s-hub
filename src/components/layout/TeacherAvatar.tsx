import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { resolveAccountDisplayName, teacherInitials } from "@/lib/teacher-name";

/**
 * Single source of the authenticated teacher's identity for the app chrome (sidebar account block),
 * so every place agrees: the name saved in the profile (kept even when it
 * resembles the e-mail, see resolveAccountDisplayName), the auth e-mail and the profile photo.
 */
export function useTeacherIdentity() {
  const { user, profile } = useAuth();
  return {
    name: resolveAccountDisplayName(profile, user),
    email: (user?.email as string | undefined) || "",
    avatarUrl: (profile?.avatar_url as string | null | undefined) || null,
  };
}

/**
 * Avatar content (the parent provides the circle): profile photo → initials of the real name →
 * neutral user icon. A photo that fails to load falls back to the next option.
 */
export function TeacherAvatarContent({ iconClassName = "h-4 w-4" }: { iconClassName?: string }) {
  const { lang } = useLanguage();
  const { name, avatarUrl } = useTeacherIdentity();
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => setAvatarFailed(false), [avatarUrl]);

  if (avatarUrl && !avatarFailed) {
    return <img key={avatarUrl} src={avatarUrl} alt="" className="h-full w-full object-cover" onError={() => setAvatarFailed(true)} />;
  }
  if (name) return <>{teacherInitials(name, lang)}</>;
  return <User className={iconClassName} aria-hidden="true" />;
}

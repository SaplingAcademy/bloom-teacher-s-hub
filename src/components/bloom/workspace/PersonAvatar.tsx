import { cn } from "@/lib/utils";

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

/** Teacher avatar used across Workspace sharing and task assignees: photo or initials. */
export function PersonAvatar({ name, photo, className }: { name: string; photo?: string | null; className?: string }) {
  return photo
    ? <img src={photo} alt="" className={cn("h-8 w-8 shrink-0 rounded-full object-cover", className)} />
    : <span aria-hidden className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lilac-soft text-xs font-semibold text-foreground", className)}>{initials(name)}</span>;
}

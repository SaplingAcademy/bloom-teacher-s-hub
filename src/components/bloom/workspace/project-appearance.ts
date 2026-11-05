import { BookOpen, CalendarDays, Folder, GraduationCap, Lightbulb, Megaphone, Palette, Target, type LucideIcon } from "lucide-react";
import type { ProjectColor } from "@/lib/workspace-projects";

export const projectColorVar: Record<ProjectColor, string> = {
  forest: "var(--primary)", terracotta: "var(--accent)", lilac: "var(--lilac)",
  sky: "var(--project-sky)", amber: "var(--project-amber)", slate: "var(--project-slate)",
};
export const projectIcons: Record<string, LucideIcon> = {
  folder: Folder, "book-open": BookOpen, "graduation-cap": GraduationCap, lightbulb: Lightbulb,
  calendar: CalendarDays, megaphone: Megaphone, target: Target, palette: Palette,
};
export const projectIcon = (icon: string) => projectIcons[icon] ?? Folder;
export const colorOf = (color: string) => projectColorVar[color as ProjectColor] ?? projectColorVar.forest;

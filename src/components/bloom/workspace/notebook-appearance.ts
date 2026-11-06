import { BookOpen, CalendarDays, Folder, GraduationCap, Lightbulb, Megaphone, Palette, Target, type LucideIcon } from "lucide-react";
export const notebookColors: Record<string, string> = {
  forest: "bg-primary/10 text-primary border-primary/25", terracotta: "bg-accent-soft text-accent border-accent/25", lilac: "bg-lilac-soft text-lilac border-lilac/25",
  sky: "bg-project-sky/10 text-project-sky border-project-sky/25", amber: "bg-project-amber/10 text-project-amber border-project-amber/25", slate: "bg-project-slate/10 text-project-slate border-project-slate/25",
};
export const notebookSwatches: Record<string, string> = { forest: "bg-primary", terracotta: "bg-accent", lilac: "bg-lilac", sky: "bg-project-sky", amber: "bg-project-amber", slate: "bg-project-slate" };
const icons: Record<string, LucideIcon> = { "book-open": BookOpen, calendar: CalendarDays, folder: Folder, "graduation-cap": GraduationCap, lightbulb: Lightbulb, megaphone: Megaphone, palette: Palette, target: Target };
export const notebookIcon = (id: string) => icons[id] ?? BookOpen;
export const notebookColor = (id: string) => notebookColors[id] ?? notebookColors.forest;
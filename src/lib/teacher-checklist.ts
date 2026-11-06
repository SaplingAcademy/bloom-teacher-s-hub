export const CHECKLIST_DEADLINE_TYPES = ["none", "today", "specific"] as const;
export type ChecklistDeadlineType = (typeof CHECKLIST_DEADLINE_TYPES)[number];

export interface ChecklistDeadline {
  deadline_type: ChecklistDeadlineType;
  due_date: string | null;
}

export interface TeacherChecklistItem extends ChecklistDeadline {
  id: string;
  teacher_id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export type ChecklistCommand =
  | { type: "create"; id: string; title: string; deadline: ChecklistDeadline }
  | { type: "edit"; id: string; title: string; deadline: ChecklistDeadline }
  | { type: "complete"; id: string; completed: boolean }
  | { type: "recover"; id: string; deadline: ChecklistDeadline }
  | { type: "delete"; id: string }
  | { type: "clear"; ids: readonly string[] };

export function checklistTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("checklist_title_required");
  return title;
}

export function isChecklistDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isChecklistDeadlineType(value: unknown): value is ChecklistDeadlineType {
  return typeof value === "string" && CHECKLIST_DEADLINE_TYPES.includes(value as ChecklistDeadlineType);
}

/** Local calendar fields are intentional: a due date is a teacher's day, not a UTC instant. */
export function localChecklistDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function checklistDeadline(
  type: ChecklistDeadlineType, specificDate: string | null, localToday: string,
): ChecklistDeadline {
  if (!isChecklistDateKey(localToday)) throw new Error("checklist_invalid_today");
  if (type === "none") return { deadline_type: "none", due_date: null };
  if (type === "today") return { deadline_type: "today", due_date: localToday };
  if (!isChecklistDateKey(specificDate)) throw new Error("checklist_due_date_required");
  return { deadline_type: "specific", due_date: specificDate };
}

function validDeadline(deadline: ChecklistDeadline): ChecklistDeadline {
  if (!isChecklistDeadlineType(deadline.deadline_type)) throw new Error("checklist_invalid_deadline");
  if (deadline.deadline_type === "none") {
    if (deadline.due_date !== null) throw new Error("checklist_invalid_deadline");
    return { deadline_type: "none", due_date: null };
  }
  if (!isChecklistDateKey(deadline.due_date)) throw new Error("checklist_due_date_required");
  return { deadline_type: deadline.deadline_type, due_date: deadline.due_date };
}

export function isChecklistOverdue(item: TeacherChecklistItem, localToday: string): boolean {
  return !item.completed && item.deadline_type !== "none" && item.due_date !== null && item.due_date < localToday;
}

export function sortChecklist(items: readonly TeacherChecklistItem[]): TeacherChecklistItem[] {
  return [...items].sort((a, b) => Number(a.completed) - Number(b.completed)
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function splitChecklist(items: readonly TeacherChecklistItem[], localToday: string): {
  current: TeacherChecklistItem[];
  history: TeacherChecklistItem[];
} {
  return {
    current: sortChecklist(items.filter((item) => !isChecklistOverdue(item, localToday))),
    history: items.filter((item) => isChecklistOverdue(item, localToday)).sort((a, b) =>
      (a.due_date ?? "").localeCompare(b.due_date ?? "") || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)),
  };
}

export function pendingChecklistCount(items: readonly TeacherChecklistItem[]): number {
  return items.filter((item) => !item.completed).length;
}

export function checklistCommandIds(command: ChecklistCommand): readonly string[] {
  return command.type === "clear" ? [...new Set(command.ids)] : [command.id];
}

export function applyChecklistCommand(
  items: readonly TeacherChecklistItem[], command: ChecklistCommand, owner: string, now: string,
): TeacherChecklistItem[] {
  if (!owner || items.some((item) => item.teacher_id !== owner)) throw new Error("authentication_changed");
  if (command.type === "create") {
    if (items.some((item) => item.id === command.id)) throw new Error("checklist_item_exists");
    return sortChecklist([...items, { id: command.id, teacher_id: owner, title: checklistTitle(command.title),
      ...validDeadline(command.deadline), completed: false, created_at: now, updated_at: now }]);
  }
  if (command.type === "clear") {
    const ids = new Set(command.ids);
    return sortChecklist(items.filter((item) => !ids.has(item.id) || !item.completed));
  }
  if (!items.some((item) => item.id === command.id)) throw new Error("checklist_item_not_found");
  if (command.type === "delete") return items.filter((item) => item.id !== command.id);
  return sortChecklist(items.map((item) => {
    if (item.id !== command.id) return item;
    if (command.type === "complete") return { ...item, completed: command.completed, updated_at: now };
    if (command.type === "recover") {
      if (item.completed) throw new Error("checklist_item_completed");
      return { ...item, ...validDeadline(command.deadline), updated_at: now };
    }
    return { ...item, title: checklistTitle(command.title), ...validDeadline(command.deadline), updated_at: now };
  }));
}

/** Restore only this operation's rows; unrelated concurrent changes stay visible. */
export function restoreChecklistItems(
  current: readonly TeacherChecklistItem[], before: readonly TeacherChecklistItem[], ids: readonly string[],
): TeacherChecklistItem[] {
  const targets = new Set(ids);
  return sortChecklist([...current.filter((item) => !targets.has(item.id)), ...before.filter((item) => targets.has(item.id))]);
}

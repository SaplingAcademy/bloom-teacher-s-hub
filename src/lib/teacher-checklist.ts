export interface TeacherChecklistItem {
  id: string;
  teacher_id: string;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string;
}

export type ChecklistCommand =
  | { type: "create"; id: string; title: string }
  | { type: "edit"; id: string; title: string }
  | { type: "complete"; id: string; completed: boolean }
  | { type: "delete"; id: string }
  | { type: "clear"; ids: readonly string[] };

export function checklistTitle(value: string): string {
  const title = value.trim();
  if (!title) throw new Error("checklist_title_required");
  return title;
}

export function sortChecklist(items: readonly TeacherChecklistItem[]): TeacherChecklistItem[] {
  return [...items].sort((a, b) => Number(a.completed) - Number(b.completed)
    || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
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
      completed: false, created_at: now, updated_at: now }]);
  }
  if (command.type === "clear") {
    const ids = new Set(command.ids);
    return sortChecklist(items.filter((item) => !ids.has(item.id) || !item.completed));
  }
  if (!items.some((item) => item.id === command.id)) throw new Error("checklist_item_not_found");
  if (command.type === "delete") return items.filter((item) => item.id !== command.id);
  return sortChecklist(items.map((item) => item.id !== command.id ? item : {
    ...item, ...(command.type === "edit" ? { title: checklistTitle(command.title) } : { completed: command.completed }), updated_at: now,
  }));
}

/** Restore only this operation's rows; unrelated concurrent changes stay visible. */
export function restoreChecklistItems(
  current: readonly TeacherChecklistItem[], before: readonly TeacherChecklistItem[], ids: readonly string[],
): TeacherChecklistItem[] {
  const targets = new Set(ids);
  return sortChecklist([...current.filter((item) => !targets.has(item.id)), ...before.filter((item) => targets.has(item.id))]);
}
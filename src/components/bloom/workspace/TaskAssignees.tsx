import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { PersonAvatar } from "./PersonAvatar";

/** An eligible assignee: the project owner or an accepted participant. */
export interface Person { id: string; name: string; photo: string | null }

/**
 * Multi-select of assignees (Responsáveis) for the task form: every eligible teacher with avatar
 * and name. The database re-validates eligibility; readOnly (archived project) only shows them.
 */
export function AssigneePicker({ people, value, onChange, currentUserId, readOnly = false, disabled = false }: {
  people: Person[]; value: string[]; onChange: (next: string[]) => void; currentUserId?: string; readOnly?: boolean; disabled?: boolean;
}) {
  const { t } = useLanguage();
  const selected = new Set(value);
  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <fieldset className="space-y-1.5" data-testid="assignee-picker">
      <legend className="text-sm font-medium">{t("workspace.project.assignees.label")}</legend>
      {readOnly && <p className="text-xs text-muted-foreground">{t("workspace.project.assignees.readOnly")}</p>}
      <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        {people.map((person) => {
          const id = `assignee-${person.id}`;
          return (
            <li key={person.id} className="flex items-center gap-3 px-3 py-2">
              <Checkbox id={id} checked={selected.has(person.id)} disabled={readOnly || disabled} onCheckedChange={() => toggle(person.id)} />
              <PersonAvatar name={person.name} photo={person.photo} className="h-6 w-6 text-[10px]" />
              <label htmlFor={id} className={cn("min-w-0 flex-1 truncate text-sm", !(readOnly || disabled) && "cursor-pointer")}>
                {person.name}{person.id === currentUserId && ` ${t("workspace.share.you")}`}
              </label>
            </li>
          );
        })}
      </ul>
      {value.length === 0 && <p className="text-xs text-muted-foreground" data-testid="assignee-none">{t("workspace.project.assignees.none")}</p>}
    </fieldset>
  );
}

/** Compact avatars of a task's assignees (name on hover/focus); more than max collapse into +N. */
export function AssigneeAvatars({ people, max = 3 }: { people: Person[]; max?: number }) {
  const { t } = useLanguage();
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const rest = people.slice(max);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex shrink-0 items-center -space-x-1.5" data-testid="assignee-avatars" aria-label={`${t("workspace.project.assignees.label")}: ${people.map((p) => p.name).join(", ")}`}>
        {shown.map((person) => (
          <Tooltip key={person.id}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded-full ring-2 ring-card focus-visible:outline-none focus-visible:ring-ring">
                <PersonAvatar name={person.name} photo={person.photo} className="h-6 w-6 text-[10px]" />
              </span>
            </TooltipTrigger>
            <TooltipContent>{person.name}</TooltipContent>
          </Tooltip>
        ))}
        {rest.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold ring-2 ring-card focus-visible:outline-none focus-visible:ring-ring" data-testid="assignee-more">+{rest.length}</span>
            </TooltipTrigger>
            <TooltipContent>{rest.map((p) => p.name).join(", ")}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

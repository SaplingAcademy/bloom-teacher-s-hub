import { useState } from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LESSON_QUICK_TAGS } from "@/lib/manual-lesson-scheduling";
type Translate = (key: string) => string;

export function LessonStudentsSelect({ students, selected, onChange, t }: {
  students: Array<{ id: string; full_name: string }>; selected: string[]; onChange: (ids: string[]) => void; t: Translate;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]);
  return <div className="space-y-2">
    <Label htmlFor="lesson-students">{t("manualLesson.students")}</Label>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button id="lesson-students" type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
        <span className="truncate">{t("manualLesson.searchStudents")}</span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </Button></PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command><CommandInput placeholder={t("manualLesson.searchStudents")} /><CommandList className="max-h-48">
          <CommandEmpty>{t("manualLesson.noResults")}</CommandEmpty><CommandGroup>
            {students.map(student => <CommandItem key={student.id} value={`${student.full_name} ${student.id}`} onSelect={() => toggle(student.id)} aria-selected={selected.includes(student.id)}>
              <Check className={`size-4 ${selected.includes(student.id) ? "opacity-100" : "opacity-0"}`} /><span>{student.full_name}</span>
            </CommandItem>)}
          </CommandGroup>
        </CommandList></Command>
      </PopoverContent>
    </Popover>
    <div className="flex flex-wrap gap-1.5">{selected.map(id => {
      const student = students.find(value => value.id === id);
      return <Badge key={id} variant="secondary" className="max-w-full gap-1 pl-2 pr-0.5"><span className="truncate">{student?.full_name}</span>
        <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`${t("manualLesson.remove")} ${student?.full_name || ""}`} onClick={() => toggle(id)}><X className="size-3" /></Button>
      </Badge>;
    })}</div>
  </div>;
}

export function LessonTagsSelect({ tags, onChange, t }: { tags: string[]; onChange: (tags: string[]) => void; t: Translate }) {
  const [custom, setCustom] = useState("");
  const label = (tag: string) => LESSON_QUICK_TAGS.some(value => value === tag) ? t(`manualLesson.tag_${tag}`) : tag;
  const toggle = (tag: string) => onChange(tags.includes(tag) ? tags.filter(value => value !== tag) : [...tags, tag]);
  const add = () => {
    const value = custom.trim();
    if (value && !tags.some(tag => label(tag).toLocaleLowerCase() === value.toLocaleLowerCase())) onChange([...tags, value]);
    setCustom("");
  };
  return <div className="space-y-2 border-t border-border pt-4">
    <Label htmlFor="lesson-custom-tag">{t("manualLesson.tags")}</Label>
    <div className="flex flex-wrap gap-2">{LESSON_QUICK_TAGS.map(tag => <Button key={tag} type="button" variant={tags.includes(tag) ? "secondary" : "outline"} size="sm" aria-pressed={tags.includes(tag)} onClick={() => toggle(tag)}>
      {tags.includes(tag) && <Check className="size-3.5" />}{label(tag)}
    </Button>)}</div>
    <div className="flex gap-2"><Input id="lesson-custom-tag" value={custom} onChange={event => setCustom(event.target.value)} placeholder={t("manualLesson.customTag")} maxLength={100} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} />
      <Button type="button" variant="outline" size="icon" aria-label={t("manualLesson.addTag")} disabled={!custom.trim()} onClick={add}><Plus className="size-4" /></Button>
    </div>
    <div className="flex flex-wrap gap-1.5">{tags.map(tag => <Badge key={tag} variant="secondary" className="max-w-full gap-1 pl-2 pr-0.5"><span className="break-words">{label(tag)}</span>
      <Button type="button" variant="ghost" size="icon" className="size-6 shrink-0" aria-label={`${t("manualLesson.remove")} ${label(tag)}`} onClick={() => toggle(tag)}><X className="size-3" /></Button>
    </Badge>)}</div>
  </div>;
}
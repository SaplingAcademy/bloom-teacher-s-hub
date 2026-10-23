import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StudentQueryItem } from "@/hooks/use-students-query";

type Props = {
  students: Pick<StudentQueryItem, "id" | "name" | "status">[];
  value: string | null;
  onChange: (studentId: string | null) => void;
  isLoading: boolean;
  error: unknown;
  t: (key: string) => string;
};

const searchName = (name: string | null | undefined) => (name ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

export function ReceivablesStudentCombobox({ students, value, onChange, isLoading, error, t }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const selected = students.find(student => student.id === value);
  const options = error ? [] : students.filter(student => searchName(student.name).includes(searchName(search.trim())));
  const activeStudent = options[activeIndex];

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open && activeStudent) document.getElementById(`${listId}-${activeStudent.id}`)?.scrollIntoView({ block: "nearest" });
  }, [open, listId, activeStudent?.id]);

  const showOptions = () => {
    if (open) return;
    setSearch("");
    setActiveIndex(-1);
    setOpen(true);
  };
  const select = (studentId: string) => {
    onChange(studentId);
    setSearch("");
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className="relative w-full min-w-0 sm:max-w-xs" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="relative">
        <Input
          ref={inputRef}
          role="combobox"
          aria-label={t("financeStudents.placeholder")}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={open ? listId : undefined}
          aria-activedescendant={open && activeStudent ? `${listId}-${activeStudent.id}` : undefined}
          autoComplete="off"
          value={open ? search : selected?.name || ""}
          placeholder={t("financeStudents.placeholder")}
          className="h-9 rounded-xl pr-16 text-xs"
          onClick={showOptions}
          onChange={event => { setSearch(event.target.value); setActiveIndex(-1); setOpen(true); }}
          onKeyDown={event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!open) {
                showOptions();
                setActiveIndex(event.key === "ArrowDown" ? 0 : students.length - 1);
              } else {
                setActiveIndex(index => event.key === "ArrowDown"
                  ? Math.min(index + 1, options.length - 1)
                  : index < 0 ? options.length - 1 : Math.max(index - 1, 0));
              }
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (open && activeStudent) select(activeStudent.id);
              else if (!open) showOptions();
            } else if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          }}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {(value || (open && search)) && <Button
            type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground"
            aria-label={t("financeStudents.clear")}
            onMouseDown={event => event.preventDefault()}
            onClick={() => { onChange(null); setSearch(""); setActiveIndex(-1); setOpen(true); inputRef.current?.focus(); }}
          ><X className="size-3.5" aria-hidden="true" /></Button>}
          <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground"
            aria-label={t("financeStudents.open")}
            aria-expanded={open} aria-controls={open ? listId : undefined}
            onMouseDown={event => event.preventDefault()}
            onClick={() => { if (open) setOpen(false); else showOptions(); inputRef.current?.focus(); }}
          ><ChevronDown className="size-3.5" aria-hidden="true" /></Button>
        </div>
      </div>
      {open && <div className="absolute top-full z-50 mt-1 w-full rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
        <div id={listId} role="listbox" aria-label={t("financeStudents.placeholder")} aria-busy={isLoading} className="max-h-60 overflow-y-auto overscroll-contain">
          {!isLoading && options.map((student, index) => <Button
            key={student.id} id={`${listId}-${student.id}`} type="button" variant="ghost"
            role="option" aria-selected={value === student.id} tabIndex={-1}
            className={`h-auto min-h-9 w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left text-xs font-normal ${activeIndex === index ? "bg-accent text-accent-foreground" : ""}`}
            onMouseDown={event => event.preventDefault()}
            onPointerMove={() => setActiveIndex(index)} onClick={() => select(student.id)}
          >
            <Check className={`size-3.5 shrink-0 ${value === student.id ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 break-words">{student.name}</span>
            {student.status === "Inactive" && <span className="shrink-0 text-[10px] text-muted-foreground">{t("financeStudents.inactive")}</span>}
          </Button>)}
        </div>
        {(isLoading || error || options.length === 0) && <p role={error ? "alert" : "status"} className="flex items-center justify-center gap-2 px-2 py-4 text-xs text-muted-foreground">
          {isLoading && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
          {isLoading ? t("financeStudents.loading") : error ? t("financeStudents.loadError") : t("financeStudents.empty")}
        </p>}
      </div>}
    </div>
  );
}
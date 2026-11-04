import { useState } from "react";
import { SlidersHorizontal, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";
import { useCatalogOptions } from "@/hooks/use-catalog-options";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import { sortCatalogOptions, type CatalogCategory } from "@/lib/catalog-options";
import { countActiveLeadFilters, EMPTY_LEAD_FILTERS, isTaskFilterUnavailable, pendingContactAge, type LeadFilters } from "@/lib/lead-filters";
import type { Lead } from "@/lib/automation-engine";

const ALL = "__all__";
const SOURCES = [
  ["whatsapp", "sourceWhatsapp"],
  ["instagram", "sourceInstagram"],
  ["website", "sourceWebsite"],
  ["referral", "sourceReferral"],
  ["other", "sourceOther"],
] as const;

interface Props {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  stages: { id: string; labelKey: string }[];
  leads: Lead[];
  resultCount: number;
  hasSearch: boolean;
  onClearSearch: () => void;
  /** True when the pending-task read failed; task filters then show an explicit error instead of zero results. */
  tasksError: boolean;
  onRetryTasks: () => Promise<void> | void;
}

export function LeadFiltersBar({ filters, onChange, stages, leads, resultCount, hasSearch, onClearSearch }: Props) {
  const { t, lang } = useLanguage();
  const { catalogOptions } = useCatalogOptions();
  const { languages, formatLanguageLabel } = useTeacherLanguages();
  const [open, setOpen] = useState(false);
  const F = (k: string) => t(`leadFilters.${k}`);
  const P = (k: string) => t(`leadPanel.${k}`);
  const set = <K extends keyof LeadFilters>(k: K, v: LeadFilters[K]) => onChange({ ...filters, [k]: v });
  const active = countActiveLeadFilters(filters);

  const langs = Array.from(new Set([...languages, ...leads.map((l) => l.language_studied).filter((v): v is string => !!v)]));
  const sourceExtra = Array.from(new Set(leads.map((l) => l.source).filter((v): v is string => !!v && !SOURCES.some(([s]) => s === v))));
  const tags = Array.from(new Set(leads.flatMap((l) => l.tags ?? []))).sort((a, b) => a.localeCompare(b, lang));

  const pick = (id: string, key: keyof LeadFilters, items: { value: string; label: string }[], allLabel = F("all")) => (
    <Select value={(filters[key] as string) || ALL} onValueChange={(v) => set(key, (v === ALL ? EMPTY_LEAD_FILTERS[key] : v) as any)}>
      <SelectTrigger id={id} className="h-9 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
  const catalogItems = (cat: CatalogCategory) =>
    catalogOptions ? sortCatalogOptions(catalogOptions[cat] as any[]).map((o: any) => ({ value: o.id, label: o.label })) : [];
  const field = (id: string, label: string, control: React.ReactNode) => (
    <div className="space-y-1 min-w-0">
      <Label htmlFor={id} className="text-xs text-muted-foreground">{label}</Label>
      {control}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <SlidersHorizontal className="w-3.5 h-3.5" /> {F("filters")}
          {active > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{active}</Badge>}
        </Button>
        <Button
          variant={filters.contact === "pending" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 gap-1.5"
          onClick={() => set("contact", filters.contact === "pending" ? "all" : "pending")}
        >
          <Clock className="w-3.5 h-3.5" /> {F("onlyPending")}
        </Button>
        {(active > 0 || hasSearch) && (
          <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => { onChange(EMPTY_LEAD_FILTERS); onClearSearch(); }}>
            <X className="w-3.5 h-3.5" /> {F("clearAll")}
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {resultCount === 1 ? F("oneFound") : F("manyFound").replace("{count}", String(resultCount))}
        </span>
      </div>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 border-t border-border pt-3">
          {field("f-stage", F("stage"), pick("f-stage", "stage", stages.map((s) => ({ value: s.id, label: t(s.labelKey) }))))}
          {field("f-contact", F("contact"), (
            <Select value={filters.contact} onValueChange={(v) => set("contact", v as LeadFilters["contact"])}>
              <SelectTrigger id="f-contact" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F("all")}</SelectItem>
                <SelectItem value="pending">{P("contactPending")}</SelectItem>
                <SelectItem value="done">{P("contactDone")}</SelectItem>
              </SelectContent>
            </Select>
          ))}
          {field("f-source", F("source"), pick("f-source", "source", [
            ...SOURCES.map(([v, k]) => ({ value: v, label: P(k) })),
            ...sourceExtra.map((v) => ({ value: v, label: v })),
          ]))}
          {field("f-campaign", F("campaign"), (
            <Input id="f-campaign" className="h-9 text-sm" value={filters.campaign} onChange={(e) => set("campaign", e.target.value)} />
          ))}
          {field("f-tag", F("tag"), pick("f-tag", "tag", tags.map((v) => ({ value: v, label: v }))))}
          {field("f-language", F("language"), pick("f-language", "language", langs.map((v) => ({ value: v, label: formatLanguageLabel(v, lang) }))))}
          {field("f-level", F("level"), pick("f-level", "level", catalogItems("levels")))}
          {field("f-focus", F("focus"), pick("f-focus", "focus", catalogItems("focuses")))}
          {field("f-modality", F("modality"), pick("f-modality", "modality", catalogItems("modalities")))}
          {field("f-tasks", F("tasks"), (
            <Select value={filters.tasks} onValueChange={(v) => set("tasks", v as LeadFilters["tasks"])}>
              <SelectTrigger id="f-tasks" className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{F("all")}</SelectItem>
                <SelectItem value="pending">{F("tasksPending")}</SelectItem>
                <SelectItem value="overdue">{F("tasksOverdue")}</SelectItem>
              </SelectContent>
            </Select>
          ))}
          {field("f-from", F("createdFrom"), (
            <Input id="f-from" type="date" className="h-9 text-sm" value={filters.createdFrom} onChange={(e) => set("createdFrom", e.target.value)} />
          ))}
          {field("f-to", F("createdTo"), (
            <Input id="f-to" type="date" className="h-9 text-sm" value={filters.createdTo} onChange={(e) => set("createdTo", e.target.value)} />
          ))}
          {field("f-min", F("valueMin"), (
            <Input id="f-min" inputMode="decimal" className="h-9 text-sm" value={filters.valueMin} onChange={(e) => set("valueMin", e.target.value)} />
          ))}
          {field("f-max", F("valueMax"), (
            <Input id="f-max" inputMode="decimal" className="h-9 text-sm" value={filters.valueMax} onChange={(e) => set("valueMax", e.target.value)} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Discreet "no first contact yet" indicator shared by Kanban and Table. */
export function PendingContactBadge({ lead, now }: { lead: Lead; now: Date }) {
  const { t } = useLanguage();
  const age = pendingContactAge(lead, now);
  if (!age && lead.contacted_at) return null;
  if (!lead.contacted_at && !age) {
    return <Badge variant="outline" className="text-[10px] gap-1 border-accent/40 text-accent-foreground"><Clock className="w-3 h-3" />{t("leadPanel.contactPending")}</Badge>;
  }
  const elapsed = age!.days >= 1
    ? t("leadFilters.daysAgo").replace("{count}", String(age!.days))
    : t("leadFilters.hoursAgo").replace("{count}", String(age!.hours));
  return (
    <Badge variant="outline" className="text-[10px] gap-1 border-accent/40 bg-accent/10 text-foreground">
      <Clock className="w-3 h-3" /> {t("leadPanel.contactPending")} · {elapsed}
    </Badge>
  );
}

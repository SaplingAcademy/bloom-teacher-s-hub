import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CatalogOptionSelect } from "@/components/bloom/CatalogOptionSelect";
import { useCatalogOptions } from "@/hooks/use-catalog-options";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import { useLanguage } from "@/hooks/use-language";
import type { LeadProfileDraft } from "@/lib/lead-profile";

const NONE = "__none__";
const SOURCES = [
  ["whatsapp", "sourceWhatsapp"],
  ["instagram", "sourceInstagram"],
  ["website", "sourceWebsite"],
  ["referral", "sourceReferral"],
  ["other", "sourceOther"],
] as const;

interface Props {
  draft: LeadProfileDraft;
  onChange: (draft: LeadProfileDraft) => void;
  packages: { id: string; name?: string }[];
  showLostReason: boolean;
}

/** Shared lead profile fields; pedagogical fields store stable catalog IDs and never default. */
export function LeadProfileFields({ draft, onChange, packages, showLostReason }: Props) {
  const { t, lang } = useLanguage();
  const { catalogOptions } = useCatalogOptions();
  const { languages, formatLanguageLabel } = useTeacherLanguages();
  const set = <K extends keyof LeadProfileDraft>(key: K, value: LeadProfileDraft[K]) =>
    onChange({ ...draft, [key]: value });
  const L = (k: string) => t(`leadPanel.${k}`);

  const languageOptions = [...languages];
  if (draft.language_studied && !languageOptions.includes(draft.language_studied)) {
    languageOptions.push(draft.language_studied);
  }
  const sourceKnown = SOURCES.some(([v]) => v === draft.source);

  const simpleSelect = (
    id: string,
    value: string,
    onValue: (v: string) => void,
    items: { value: string; label: string }[],
  ) => (
    <Select value={value === "" ? NONE : value} onValueChange={(v) => onValue(v === NONE ? "" : v)}>
      <SelectTrigger id={id}>
        <SelectValue placeholder={L("select")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{L("none")}</SelectItem>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="lead-name">{L("name")} *</Label>
        <Input id="lead-name" value={draft.full_name} onChange={(e) => set("full_name", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="lead-phone">{L("phone")}</Label>
          <Input id="lead-phone" value={draft.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-email">{L("email")}</Label>
          <Input id="lead-email" type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-language">{L("language")}</Label>
          {simpleSelect(
            "lead-language",
            draft.language_studied,
            (v) => set("language_studied", v),
            languageOptions.map((l) => ({ value: l, label: formatLanguageLabel(l, lang) })),
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-level">{L("level")}</Label>
          <CatalogOptionSelect id="lead-level" catalog={catalogOptions} category="levels" value={draft.level}
            onChange={(v) => set("level", v)} placeholder={L("select")} noneLabel={L("none")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-focus">{L("focus")}</Label>
          <CatalogOptionSelect id="lead-focus" catalog={catalogOptions} category="focuses" value={draft.focus}
            onChange={(v) => set("focus", v)} placeholder={L("select")} noneLabel={L("none")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-modality">{L("modality")}</Label>
          <CatalogOptionSelect id="lead-modality" catalog={catalogOptions} category="modalities" value={draft.modality}
            onChange={(v) => set("modality", v)} placeholder={L("select")} noneLabel={L("none")} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-source">{L("source")}</Label>
          {simpleSelect("lead-source", draft.source, (v) => set("source", v), [
            ...SOURCES.map(([v, k]) => ({ value: v, label: L(k) })),
            ...(draft.source && !sourceKnown ? [{ value: draft.source, label: draft.source }] : []),
          ])}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-campaign">{L("campaign")}</Label>
          <Input id="lead-campaign" value={draft.campaign} onChange={(e) => set("campaign", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lead-tags">{L("tags")}</Label>
          <Input id="lead-tags" placeholder={L("tagsHint")} value={draft.tags} onChange={(e) => set("tags", e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="lead-schedule">{L("schedule")}</Label>
          <Input id="lead-schedule" value={draft.preferred_schedule} onChange={(e) => set("preferred_schedule", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-package">{L("package")}</Label>
          {simpleSelect(
            "lead-package",
            draft.package_id,
            (v) => set("package_id", v),
            [
              ...packages.map((p) => ({ value: p.id, label: p.name || p.id })),
              ...(draft.package_id && !packages.some((p) => p.id === draft.package_id)
                ? [{ value: draft.package_id, label: draft.package_id }]
                : []),
            ],
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lead-value">{L("value")}</Label>
          <Input id="lead-value" inputMode="decimal" value={draft.potential_value}
            onChange={(e) => set("potential_value", e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lead-notes">{L("notes")}</Label>
        <Textarea id="lead-notes" rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
      {showLostReason && (
        <div className="space-y-1.5">
          <Label htmlFor="lead-lost">{L("lostReason")}</Label>
          <Textarea id="lead-lost" rows={2} value={draft.lost_reason} onChange={(e) => set("lost_reason", e.target.value)} />
        </div>
      )}
    </div>
  );
}

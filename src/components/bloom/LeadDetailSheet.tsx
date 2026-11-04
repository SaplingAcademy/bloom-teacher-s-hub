import { useEffect, useState, type ReactNode } from "react";
import { Calendar, FileText, MessageSquare, Pencil, UserCheck, Workflow, CircleCheck, CircleDashed } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LeadProfileFields } from "@/components/bloom/LeadProfileFields";
import { LeadTasksPanel } from "@/components/bloom/LeadTasksPanel";
import { useLanguage } from "@/hooks/use-language";
import { useCatalogOptions } from "@/hooks/use-catalog-options";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import { resolveCatalogLabel, type CatalogCategory } from "@/lib/catalog-options";
import {
  buildLeadProfilePatch,
  leadToProfileDraft,
  validateLeadProfileDraft,
  type LeadProfileDraft,
} from "@/lib/lead-profile";
import type { AutomationActivity, Lead } from "@/lib/automation-engine";

interface Props {
  lead: Lead | null;
  packages: { id: string; name?: string }[];
  activities: AutomationActivity[];
  onClose: () => void;
  /** Persists only the changed columns; resolves false on failure so the draft is kept. */
  onSaveProfile: (lead: Lead, patch: Record<string, unknown>) => Promise<boolean>;
  onRegisterInteraction: (lead: Lead) => void;
  onScheduleTrial: (lead: Lead) => void;
  onRecordProposal: (lead: Lead) => void;
  onConvert: (lead: Lead) => void;
  teacherId?: string;
  onTasksChanged?: () => void;
}

const SOURCE_KEYS: Record<string, string> = {
  whatsapp: "sourceWhatsapp",
  instagram: "sourceInstagram",
  website: "sourceWebsite",
  referral: "sourceReferral",
  other: "sourceOther",
};

export function LeadDetailSheet(props: Props) {
  const { lead, onClose } = props;
  return (
    <Sheet open={!!lead} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto p-0">
        {lead ? <LeadDetailBody key={lead.id} {...props} lead={lead} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function LeadDetailBody({
  lead,
  packages,
  activities,
  onSaveProfile,
  onRegisterInteraction,
  onScheduleTrial,
  onRecordProposal,
  onConvert,
  teacherId,
  onTasksChanged,
}: Props & { lead: Lead }) {
  const { t, lang, formatStatus } = useLanguage();
  const { catalogOptions } = useCatalogOptions();
  const { formatLanguageLabel } = useTeacherLanguages();
  const L = (k: string) => t(`leadPanel.${k}`);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeadProfileDraft>(() => leadToProfileDraft(lead));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(leadToProfileDraft(lead));
  }, [lead, editing]);

  const locale = lang === "pt" ? "pt-BR" : "en-US";
  const fmtDate = (v?: string | null) =>
    v ? new Date(v).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : null;
  const catalogLabel = (cat: CatalogCategory, v?: string | null) =>
    v ? (catalogOptions ? resolveCatalogLabel(catalogOptions, cat, v) : v) : null;
  const pkg = lead.package_id ? packages.find((p) => p.id === lead.package_id) : undefined;
  const money = (v?: number | null) =>
    v === null || v === undefined
      ? null
      : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v));

  const handleSave = async () => {
    const issue = validateLeadProfileDraft(draft);
    if (issue) {
      setError(L(issue));
      return;
    }
    const patch = buildLeadProfilePatch(lead, draft);
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await onSaveProfile(lead, patch);
    setSaving(false);
    if (ok) setEditing(false);
    else setError(L("saveError"));
  };

  const isLost = lead.stage === "Perdido";

  return (
    <div className="flex flex-col">
      <SheetHeader className="p-5 pb-3 pr-12 text-left space-y-2 border-b border-border">
        <SheetTitle className="text-xl font-display">{lead.full_name}</SheetTitle>
        <SheetDescription asChild>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{formatStatus(lead.stage)}</Badge>
            {lead.contacted_at ? (
              <Badge variant="secondary" className="gap-1">
                <CircleCheck className="w-3 h-3" /> {L("contactDone")}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <CircleDashed className="w-3 h-3" /> {L("contactPending")}
              </Badge>
            )}
          </div>
        </SheetDescription>
      </SheetHeader>

      <div className="p-5 pt-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" className="justify-start gap-2 text-xs" onClick={() => onRegisterInteraction(lead)}>
            <MessageSquare className="w-4 h-4" /> {t("leadsUi.registerInteraction")}
          </Button>
          <Button size="sm" variant="outline" className="justify-start gap-2 text-xs" onClick={() => onScheduleTrial(lead)}>
            <Calendar className="w-4 h-4" /> {t("leadsUi.scheduleTrial")}
          </Button>
          <Button size="sm" variant="outline" className="justify-start gap-2 text-xs" onClick={() => onRecordProposal(lead)}>
            <FileText className="w-4 h-4" /> {t("leads.recordProposal")}
          </Button>
          <Button size="sm" className="justify-start gap-2 text-xs" onClick={() => onConvert(lead)}>
            <UserCheck className="w-4 h-4" /> {t("leads.convertToStudent")}
          </Button>
        </div>

        <Tabs defaultValue="profile">
          <TabsList className="w-full flex overflow-x-auto justify-start">
            {["profile", "tasks", "history", "files", "proposals"].map((k) => (
              <TabsTrigger key={k} value={k} className="text-xs flex-1">
                {L(k)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="profile" className="pt-3">
            {editing ? (
              <div className="space-y-4">
                <LeadProfileFields draft={draft} onChange={setDraft} packages={packages} showLostReason={isLost || !!lead.lost_reason} />
                {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" disabled={saving} onClick={() => { setEditing(false); setError(null); setDraft(leadToProfileDraft(lead)); }}>
                    {L("cancel")}
                  </Button>
                  <Button disabled={saving} onClick={handleSave}>{saving ? L("saving") : L("save")}</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditing(true)}>
                    <Pencil className="w-3.5 h-3.5" /> {L("edit")}
                  </Button>
                </div>
                <Section title={L("contact")}>
                  <Field label={L("phone")} value={lead.phone} empty={L("empty")} />
                  <Field label={L("email")} value={lead.email} empty={L("empty")} />
                </Section>
                <Section title={L("pedagogical")}>
                  <Field label={L("language")} value={lead.language_studied ? formatLanguageLabel(lead.language_studied, lang) : null} empty={L("empty")} />
                  <Field label={L("level")} value={catalogLabel("levels", lead.level)} empty={L("empty")} />
                  <Field label={L("focus")} value={catalogLabel("focuses", lead.focus)} empty={L("empty")} />
                  <Field label={L("modality")} value={catalogLabel("modalities", lead.modality)} empty={L("empty")} />
                  <Field label={L("schedule")} value={lead.preferred_schedule} empty={L("empty")} />
                </Section>
                <Section title={L("commercial")}>
                  <Field label={L("source")} value={lead.source ? (SOURCE_KEYS[lead.source] ? L(SOURCE_KEYS[lead.source]) : lead.source) : null} empty={L("empty")} />
                  <Field label={L("campaign")} value={lead.campaign} empty={L("empty")} />
                  <Field label={L("tags")} empty={L("empty")} value={lead.tags?.length ? (
                    <span className="flex flex-wrap gap-1">{lead.tags.map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>)}</span>
                  ) : null} />
                  <Field label={L("package")} value={pkg?.name ?? (lead.package_id ? lead.package_id : null)} empty={L("empty")} />
                  <Field label={L("value")} value={money(lead.potential_value)} empty={L("empty")} />
                </Section>
                {(lead.notes || isLost || lead.lost_reason) && (
                  <Section title={L("notes")} single>
                    {lead.notes && <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>}
                    {(isLost || lead.lost_reason) && (
                      <Field label={L("lostReason")} value={lead.lost_reason} empty={L("empty")} />
                    )}
                  </Section>
                )}
                <Section title={L("dates")}>
                  <Field label={L("createdAt")} value={fmtDate(lead.created_at)} empty={L("empty")} />
                  <Field label={L("contactedAt")} value={fmtDate(lead.contacted_at)} empty={L("empty")} />
                  <Field label={L("lastContact")} value={fmtDate(lead.last_interaction_at)} empty={L("empty")} />
                  {lead.converted_at && <Field label={L("convertedAt")} value={fmtDate(lead.converted_at)} empty={L("empty")} />}
                </Section>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="pt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{L("comingSoon")}</p>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Workflow className="w-3.5 h-3.5" /> {t("leadsUi.automationHistory")}
            </h4>
            {activities.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">{t("leadsUi.noAutomation")}</p>
            ) : (
              activities.map((act) => (
                <div key={act.id} className="p-3 rounded-lg border border-border text-xs flex justify-between gap-2">
                  <span>{act.description}</span>
                  <span className="text-muted-foreground shrink-0">{fmtDate(act.created_at)}</span>
                </div>
              ))
            )}
          </TabsContent>
          <TabsContent value="tasks" className="pt-3">
            <LeadTasksPanel teacherId={teacherId} leadId={lead.id} onTasksChanged={onTasksChanged} />
          </TabsContent>
          {["files", "proposals"].map((k) => (
            <TabsContent key={k} value={k} className="pt-3">
              <p className="text-sm text-muted-foreground border border-dashed border-border rounded-lg p-4 text-center">
                {L("comingSoon")}
              </p>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function Section({ title, children, single }: { title: string; children: ReactNode; single?: boolean }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      <div className={single ? "space-y-2" : "grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-border bg-muted/30 p-3"}>
        {children}
      </div>
    </section>
  );
}

function Field({ label, value, empty }: { label: string; value?: ReactNode | null; empty: string }) {
  const isEmpty = value === null || value === undefined || value === "";
  return (
    <div className="min-w-0">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className={isEmpty ? "text-sm text-muted-foreground italic" : "text-sm font-medium break-words"}>
        {isEmpty ? empty : value}
      </span>
    </div>
  );
}

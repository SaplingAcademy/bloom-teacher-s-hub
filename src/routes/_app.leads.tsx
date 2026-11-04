import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  UserPlus,
  Search,
  Plus,
  ChevronRight,
  Phone,
  Mail,
  Calendar,
  Clock,
  BookOpen,
  DollarSign,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Filter,
  Kanban,
  Table as TableIcon,
  Trash2,
  FileText,
  UserCheck,
  Tag,
  RefreshCw,
  Send,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { LeadDetailSheet } from "@/components/bloom/LeadDetailSheet";
import { LeadProfileFields } from "@/components/bloom/LeadProfileFields";
import { useCatalogOptions } from "@/hooks/use-catalog-options";
import { resolveCatalogLabel } from "@/lib/catalog-options";
import {
  buildNewLeadInsert,
  emptyLeadProfileDraft,
  leadPedagogyParts,
  validateLeadProfileDraft,
  type LeadProfileDraft,
} from "@/lib/lead-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatReaisToBRL(value: number | string | undefined | null): string {
  if (value === undefined || value === null || isNaN(Number(value))) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value));
}
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lead,
  normalizeLeadStage,
  processNewLeadAutomation,
  processLeadInteractionAutomation,
  processTrialLessonScheduledAutomation,
  processProposalRecordedAutomation,
  convertLeadToStudentAutomation,
  fetchAutomationActivity,
  AutomationActivity,
} from "@/lib/automation-engine";

export const Route = createFileRoute("/_app/leads")({
  head: () => ({
    meta: [
      { title: "Leads · Bloom" },
      {
        name: "description",
        content: "Turn inquiries into paying students with automated pipeline and follow-ups.",
      },
      { property: "og:title", content: "Leads · Bloom" },
      { property: "og:description", content: "Turn inquiries into paying students with automated pipeline and follow-ups." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LeadsPage,
});

const KANBAN_STAGES = [
  { id: "Novo contato", labelKey: "leads.stageNew", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { id: "Em conversa", labelKey: "leads.stageContacted", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { id: "Aula experimental agendada", labelKey: "leads.stageTrialScheduled", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { id: "Proposta enviada", labelKey: "leads.stageProposalSent", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { id: "Convertido", labelKey: "leads.stageWon", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
  { id: "Perdido", labelKey: "leads.stageLost", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
];

function LeadsPage() {
  const { user } = useAuth();
  const { lang, t, formatStatus } = useLanguage();
  const { languages: teacherLanguages, hasConfiguredLanguages, formatLanguageLabel } = useTeacherLanguages();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activities, setActivities] = useState<AutomationActivity[]>([]);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTrialOpen, setIsTrialOpen] = useState(false);
  const [isProposalOpen, setIsProposalOpen] = useState(false);
  const [isConvertOpen, setIsConvertOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form inputs
  const [newLeadForm, setNewLeadForm] = useState<LeadProfileDraft>(emptyLeadProfileDraft);
  const [createError, setCreateError] = useState<string | null>(null);

  const [trialForm, setTrialForm] = useState({
    date: "",
    time: "14:00",
    duration: 60,
  });

  const [proposalForm, setProposalForm] = useState({
    package_id: "",
    potential_value: "",
  });

  const [convertForm, setConvertForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    language_studied: "English",
    level: "A1",
    focus: "General English",
    modality: "Online",
    package_id: "",
    schedule_weekday: "Monday",
    schedule_start_time: "10:00",
    notes: "",
  });

  const teacherId = user?.id;
  const { catalogOptions } = useCatalogOptions();
  const pedagogyLabel = (lead: Lead) =>
    leadPedagogyParts(lead, {
      language: (v) => formatLanguageLabel(v, lang),
      catalog: (cat, v) => (catalogOptions ? resolveCatalogLabel(catalogOptions, cat, v) : v),
    }).join(" • ");

  const loadData = async () => {
    if (!teacherId) return;
    setLoading(true);
    try {
      // 1. Fetch leads
      const { data: leadsData, error: leadsErr } = await supabase
        .from("leads")
        .select("*")
        .eq("teacher_id", teacherId)
        .order("created_at", { ascending: false });

      if (leadsErr) {
        console.error("Error fetching leads:", leadsErr);
      } else {
        const normalized = (leadsData || []).map((l: any) => ({
          ...l,
          stage: normalizeLeadStage(l.stage),
        }));
        setLeads(normalized);
      }

      // 2. Fetch packages for proposals and conversions
      const { data: pkgsData } = await supabase
        .from("packages")
        .select("*")
        .eq("teacher_id", teacherId);
      setPackages(pkgsData || []);
    } catch (err) {
      console.error("Failed loading leads page data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [teacherId]);

  // Load automation activity when lead is selected
  useEffect(() => {
    if (selectedLead && teacherId) {
      fetchAutomationActivity(teacherId, 30).then((acts) => {
        setActivities(acts.filter((a) => a.target_id === selectedLead.id));
      });
    }
  }, [selectedLead, teacherId]);

  // 1. Handle New Lead Creation (Rule A)
  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherId) return;
    const issue = validateLeadProfileDraft(newLeadForm);
    if (issue) {
      setCreateError(t(`leadPanel.${issue}`));
      return;
    }
    setCreateError(null);

    setSubmitting(true);
    try {
      const { data: insertedLead, error } = await supabase
        .from("leads")
        .insert(buildNewLeadInsert(teacherId, newLeadForm) as any)
        .select("*")
        .single();

      if (error || !insertedLead) {
        toast.error(t("leads.toastCreateError"));
        setSubmitting(false);
        return;
      }

      // Execute Rule A Automation
      await processNewLeadAutomation(insertedLead as Lead);
      toast.success(t("leads.toastCreateSuccess"));

      setIsCreateOpen(false);
      setNewLeadForm(emptyLeadProfileDraft());
      loadData();
    } catch (err: any) {
      console.error("[Leads] Create error:", err);
      toast.error(t("leads.toastCreateError"));
    } finally {
      setSubmitting(false);
    }
  };

  // 2. Handle First Interaction (Rule B)
  const handleRegisterInteraction = async (lead: Lead) => {
    if (!lead) return;
    try {
      const res = await processLeadInteractionAutomation(lead);
      if (res.success) {
        toast.success(t("leads.toastInteractionSuccess"));
        loadData();
        setSelectedLead((prev) => (prev ? { ...prev, stage: "Em conversa" } : null));
      } else {
        console.error("[Leads] Interaction error:", res.error);
        toast.error(t("leads.toastInteractionError"));
      }
    } catch (err: any) {
      console.error("[Leads] Interaction catch:", err);
      toast.error(t("leads.toastInteractionError"));
    }
  };

  // Profile edit: owner-scoped update of only the changed columns, then read-back.
  const handleSaveLeadProfile = async (lead: Lead, patch: Record<string, unknown>): Promise<boolean> => {
    if (!teacherId) return false;
    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", lead.id)
      .eq("teacher_id", teacherId)
      .select("*")
      .maybeSingle();
    if (error || !data) {
      console.error("Failed to save lead profile:", error);
      return false;
    }
    const saved = { ...(data as Lead), stage: normalizeLeadStage((data as Lead).stage) };
    setLeads((prev) => prev.map((l) => (l.id === saved.id ? saved : l)));
    setSelectedLead((prev) => (prev && prev.id === saved.id ? saved : prev));
    toast.success(t("leadPanel.saved"));
    return true;
  };

  // 3. Handle Schedule Trial Lesson (Rule C)
  const handleScheduleTrial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !trialForm.date) return;

    setSubmitting(true);
    try {
      const res = await processTrialLessonScheduledAutomation(
        selectedLead,
        trialForm.date,
        trialForm.time,
        trialForm.duration
      );

      if (res.success) {
        toast.success(t("leads.toastTrialSuccess"));
        setIsTrialOpen(false);
        loadData();
        setSelectedLead((prev) =>
          prev ? { ...prev, stage: "Aula experimental agendada", trial_scheduled_at: `${trialForm.date}T${trialForm.time}` } : null
        );
      } else {
        console.error("[Leads] Trial schedule error:", res.error);
        toast.error(t("leads.toastTrialError"));
      }
    } catch (err: any) {
      console.error("[Leads] Trial schedule catch:", err);
      toast.error(t("leads.toastTrialError"));
    } finally {
      setSubmitting(false);
    }
  };

  // 4. Handle Proposal Record (Rule D)
  const handleRecordProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    setSubmitting(true);
    try {
      const valueNum = parseFloat(proposalForm.potential_value) || 0;
      const res = await processProposalRecordedAutomation(selectedLead, proposalForm.package_id || undefined, valueNum);

      if (res.success) {
        toast.success(t("leads.toastProposalSuccess"));
        setIsProposalOpen(false);
        loadData();
        setSelectedLead((prev) =>
          prev ? { ...prev, stage: "Proposta enviada", potential_value: valueNum } : null
        );
      } else {
        console.error("[Leads] Proposal error:", res.error);
        toast.error(t("leads.toastProposalError"));
      }
    } catch (err: any) {
      console.error("[Leads] Proposal catch:", err);
      toast.error(t("leads.toastProposalError"));
    } finally {
      setSubmitting(false);
    }
  };

  // 5. Open Conversion Modal & Prefill
  const openConvertModal = (lead: Lead) => {
    setSelectedLead(lead);
    setConvertForm({
      full_name: lead.full_name,
      email: lead.email || "",
      phone: lead.phone || "",
      language_studied: lead.language_studied || "English",
      level: lead.level || "A1",
      focus: lead.focus || "General English",
      modality: lead.modality || "Online",
      package_id: lead.package_id || (packages[0]?.id || ""),
      schedule_weekday: "Monday",
      schedule_start_time: "10:00",
      notes: lead.notes || "",
    });
    setIsConvertOpen(true);
  };

  // 6. Handle Lead-to-Student Conversion (Rule F & G)
  const handleConvertLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !teacherId) return;

    setSubmitting(true);
    try {
      const res = await convertLeadToStudentAutomation({
        leadId: selectedLead.id,
        teacherId,
        fullName: convertForm.full_name,
        email: convertForm.email,
        phone: convertForm.phone,
        languageStudied: convertForm.language_studied,
        level: convertForm.level,
        focus: convertForm.focus,
        modality: convertForm.modality,
        packageId: convertForm.package_id || undefined,
        notes: convertForm.notes,
        scheduleText: `${convertForm.schedule_weekday} às ${convertForm.schedule_start_time}`,
        schedules: [
          {
            weekday: convertForm.schedule_weekday,
            startTime: convertForm.schedule_start_time,
            duration: 60,
          },
        ],
      });

      if (res.success) {
        toast.success(t("leads.toastConvertSuccess"));
        setIsConvertOpen(false);
        setSelectedLead(null);
        loadData();
      } else {
        console.error("[Leads] Conversion error:", res.error);
        toast.error(t("leads.toastConvertError"));
      }
    } catch (err: any) {
      console.error("[Leads] Conversion catch:", err);
      toast.error(t("leads.toastConvertError"));
    } finally {
      setSubmitting(false);
    }
  };

  // Filter leads
  const filteredLeads = leads.filter((l) =>
    l.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.phone?.includes(searchQuery)
  );

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow={t("auditUi.salesPipeline")}
        title={t("leads.title")}
        description={t("leads.subtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> {t("globalUi.refresh")}
            </Button>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="w-4 h-4" /> {t("leads.newLead")}
            </Button>
          </div>
        }
      />

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("leads.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border">
            <Button
              variant={viewMode === "kanban" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("kanban")}
              className="h-7 text-xs gap-1"
            >
              <Kanban className="w-3.5 h-3.5" /> Kanban
            </Button>
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="h-7 text-xs gap-1"
            >
              <TableIcon className="w-3.5 h-3.5" /> {t("auditUi.table")}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" /> {t("auditUi.loadingLeadPipeline")}
        </div>
      ) : viewMode === "kanban" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {KANBAN_STAGES.map((stage) => {
            const stageLeads = filteredLeads.filter((l) => l.stage === stage.id);
            return (
              <div key={stage.id} className="bg-card/50 border border-border rounded-xl p-3 flex flex-col min-w-[260px] min-h-[400px]">
                <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
                  <span className="font-semibold text-xs text-card-foreground flex items-center gap-1.5">
                    <Badge variant="outline" className={`${stage.color} border font-medium text-[11px]`}>
                      {t(stage.labelKey)}
                    </Badge>
                  </span>
                  <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {stageLeads.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {stageLeads.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      {t("leads.noLeads")}
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className="bg-card border border-border hover:border-primary/50 transition-all rounded-lg p-3.5 shadow-sm cursor-pointer space-y-2 group"
                      >
                        <div className="flex items-start justify-between">
                          <h4 className="font-semibold text-sm text-card-foreground group-hover:text-primary transition-colors">
                            {lead.full_name}
                          </h4>
                          {lead.potential_value && lead.potential_value > 0 && (
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              {formatReaisToBRL(lead.potential_value)}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground space-y-1">
                          {lead.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-muted-foreground" /> {lead.phone}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {pedagogyLabel(lead) && (
                              <Badge variant="outline" className="text-[10px] bg-muted/50 border-none">
                                {pedagogyLabel(lead)}
                              </Badge>
                            )}
                            {lead.source && (
                              <Badge variant="outline" className="text-[10px] capitalize bg-muted/40">
                                {lead.source}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {lead.stage === "Novo contato" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-full h-7 text-[11px] mt-2 gap-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRegisterInteraction(lead);
                            }}
                          >
                            <MessageSquare className="w-3 h-3" /> {t("leadsUi.registerInteraction")}
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-xs text-muted-foreground font-semibold border-b border-border">
                <tr>
                  <th className="p-3.5">{t("leadsUi.leadName")}</th>
                  <th className="p-3.5">{t("leadsUi.contact")}</th>
                  <th className="p-3.5">{t("leadsUi.stage")}</th>
                  <th className="p-3.5">{t("leadsUi.languageAndLevel")}</th>
                  <th className="p-3.5">{t("leads.potentialValueLabel")}</th>
                  <th className="p-3.5">{t("leadsUi.source")}</th>
                  <th className="p-3.5 text-right">{t("leadsUi.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} onClick={() => setSelectedLead(lead)} className="hover:bg-muted/30 transition-colors cursor-pointer">
                    <td className="p-3.5 font-medium text-card-foreground">{lead.full_name}</td>
                    <td className="p-3.5 text-xs text-muted-foreground">
                      <div>{lead.phone || "-"}</div>
                      <div>{lead.email || "-"}</div>
                    </td>
                    <td className="p-3.5">
                      <Badge variant="outline" className="text-xs">
                        {formatStatus(lead.stage)}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-xs">
                      {pedagogyLabel(lead) || "-"}
                    </td>
                    <td className="p-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {lead.potential_value ? formatReaisToBRL(lead.potential_value) : "-"}
                    </td>
                    <td className="p-3.5 text-xs capitalize">{lead.source || "-"}</td>
                    <td className="p-3.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedLead(lead)} className="h-8 text-xs">
                        {t("leadsUi.viewDetails")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create New Lead */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> {t("leads.createNewLeadTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("leadsUi.createDescription")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLead} className="space-y-4 pt-2">
            <LeadProfileFields draft={newLeadForm} onChange={setNewLeadForm} packages={packages} showLostReason={false} />
            {createError && <p role="alert" className="text-sm text-destructive">{createError}</p>}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("leadsUi.creating") : t("leads.saveLeadBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Side panel: Lead details & profile editing */}
      <LeadDetailSheet
        lead={selectedLead}
        packages={packages}
        activities={activities}
        onClose={() => setSelectedLead(null)}
        onSaveProfile={handleSaveLeadProfile}
        onRegisterInteraction={handleRegisterInteraction}
        onScheduleTrial={() => {
          setTrialForm({ date: new Date().toISOString().split("T")[0], time: "14:00", duration: 60 });
          setIsTrialOpen(true);
        }}
        onRecordProposal={(lead) => {
          setProposalForm({ package_id: lead.package_id || "", potential_value: lead.potential_value?.toString() || "" });
          setIsProposalOpen(true);
        }}
        onConvert={openConvertModal}
      />

      {/* Modal: Schedule Trial Lesson */}
      <Dialog open={isTrialOpen} onOpenChange={setIsTrialOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" /> {t("leads.trialLesson")}
            </DialogTitle>
            <DialogDescription>
              Agende a aula experimental para {selectedLead?.full_name}. Isso criará o evento na Agenda e gerará as tarefas de confirmação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleScheduleTrial} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="trial_date">{t("leads.trialDateLabel")} *</Label>
                <Input
                  id="trial_date"
                  type="date"
                  required
                  value={trialForm.date}
                  onChange={(e) => setTrialForm({ ...trialForm, date: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trial_time">{t("leads.trialTimeLabel")} *</Label>
                <Input
                  id="trial_time"
                  type="time"
                  required
                  value={trialForm.time}
                  onChange={(e) => setTrialForm({ ...trialForm, time: e.target.value })}
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsTrialOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("leadsUi.scheduling") : t("leads.confirmTrialBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Record Proposal */}
      <Dialog open={isProposalOpen} onOpenChange={setIsProposalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" /> {t("leads.recordProposal")}
            </DialogTitle>
            <DialogDescription>
              Selecione o pacote ou insira o valor potencial oferecido a {selectedLead?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordProposal} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t("leads.packageLabel")}</Label>
              <Select
                value={proposalForm.package_id}
                onValueChange={(val) => {
                  const pkg = packages.find((p) => p.id === val);
                  setProposalForm({
                    package_id: val,
                    potential_value: pkg ? pkg.price.toString() : proposalForm.potential_value,
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder={t("leadsUi.selectPackage")} /></SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => {
                    const isTotal = pkg.frequency === "total" || pkg.frequency === "Valor total do curso" || (pkg.frequency && pkg.frequency.toLowerCase().includes("total"));
                    const priceFormatted = formatReaisToBRL(pkg.price);
                    const suffix = isTotal ? " (valor total)" : "/mês";
                    return (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} — {priceFormatted}{suffix}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {(() => {
              const selectedPkg = packages.find((p) => p.id === proposalForm.package_id);
              const isTotal = selectedPkg && (selectedPkg.frequency === "total" || selectedPkg.frequency === "Valor total do curso" || (selectedPkg.frequency && selectedPkg.frequency.toLowerCase().includes("total")));
              const inputLabel = isTotal ? "Valor total da proposta (R$)" : "Valor mensal (R$)";
              return (
                <div className="space-y-1.5">
                  <Label htmlFor="potential_value">{inputLabel}</Label>
                  <Input
                    id="potential_value"
                    type="number"
                    step="0.01"
                    placeholder="Ex: 350.00"
                    value={proposalForm.potential_value}
                    onChange={(e) => setProposalForm({ ...proposalForm, potential_value: e.target.value })}
                  />
                </div>
              );
            })()}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsProposalOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("availabilityUi.saving") : t("leads.saveProposalBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal: Convert Lead to Student (Rule F & G) */}
      <Dialog open={isConvertOpen} onOpenChange={setIsConvertOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-5 h-5" /> {t("leads.convertToStudent")}
            </DialogTitle>
            <DialogDescription>
              Bloom preencheu os dados com base no lead. Ao confirmar, o aluno será cadastrado, os horários e a Agenda dos próximos 2 meses serão gerados de forma transacional.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConvertLead} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convert_name">{t("leads.fullNameLabel")} *</Label>
                <Input
                  id="convert_name"
                  required
                  value={convertForm.full_name}
                  onChange={(e) => setConvertForm({ ...convertForm, full_name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_email">{t("leads.emailLabel")}</Label>
                <Input
                  id="convert_email"
                  type="email"
                  value={convertForm.email}
                  onChange={(e) => setConvertForm({ ...convertForm, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convert_phone">{t("leads.phoneLabel")}</Label>
                <Input
                  id="convert_phone"
                  value={convertForm.phone}
                  onChange={(e) => setConvertForm({ ...convertForm, phone: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_language">{t("leadsUi.languageStudied")}</Label>
                <Select
                  value={convertForm.language_studied}
                  onValueChange={(val) => setConvertForm({ ...convertForm, language_studied: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["English", "Spanish", "French", "German", "Italian", "Portuguese"] as const).map((language) => (
                      <SelectItem key={language} value={language}>{formatLanguageLabel(language, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convert_level">{t("leadsUi.cefrLevel")}</Label>
                <Select
                  value={convertForm.level}
                  onValueChange={(val) => setConvertForm({ ...convertForm, level: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["A1", "A2", "B1", "B2", "C1", "C2"] as const).map((level) => (
                      <SelectItem key={level} value={level}>{formatStatus(level)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_focus">{t("leadsUi.courseFocus")}</Label>
                <Select
                  value={convertForm.focus}
                  onValueChange={(val) => setConvertForm({ ...convertForm, focus: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["General English", "Business", "Conversation", "Exam Prep", "Travel", "Kids / Teens"] as const).map((focus) => (
                      <SelectItem key={focus} value={focus}>{formatStatus(focus)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t("leadsUi.studentPackage")}</Label>
              <Select
                value={convertForm.package_id}
                onValueChange={(val) => setConvertForm({ ...convertForm, package_id: val })}
              >
                <SelectTrigger><SelectValue placeholder={t("leadsUi.selectPackage")} /></SelectTrigger>
                <SelectContent>
                  {packages.map((pkg) => {
                    const isTotal = pkg.frequency === "total" || pkg.frequency === "Valor total do curso" || (pkg.frequency && pkg.frequency.toLowerCase().includes("total"));
                    const priceFormatted = formatReaisToBRL(pkg.price);
                    const suffix = isTotal ? " (valor total)" : "/mês";
                    return (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        {pkg.name} ({priceFormatted}{suffix})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsConvertOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? t("leadsUi.converting") : t("leads.confirmConvertBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

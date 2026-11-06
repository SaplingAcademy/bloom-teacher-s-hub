import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useTeacherLanguages } from "@/hooks/use-teacher-languages";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { advanceLeadStageAfterInteraction, shouldAdvanceStageOnInteraction, type LeadInteraction } from "@/lib/lead-interactions";
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
import { KanbanSkeleton, ListRowsSkeleton } from "@/components/bloom/skeletons";
import { LeadDetailSheet } from "@/components/bloom/LeadDetailSheet";
import { LeadInteractionDialog } from "@/components/bloom/LeadInteractionDialog";
import { LeadStageConfirmationDialog } from "@/components/bloom/LeadStageConfirmationDialog";
import { useLeadStageConfirmation } from "@/hooks/use-lead-stage-confirmation";
import { LeadProfileFields } from "@/components/bloom/LeadProfileFields";
import { CatalogOptionSelect } from "@/components/bloom/CatalogOptionSelect";
import { conversionLanguageOptions, leadToConversionDraft } from "@/lib/lead-conversion";
import { LeadFiltersBar, PendingContactBadge } from "@/components/bloom/LeadFiltersBar";
import {
  applyLeadFilters,
  EMPTY_LEAD_FILTERS,
  findDuplicateLeads,
  summarizeLeadTasks,
  type LeadFilters,
} from "@/lib/lead-filters";
import { useCatalogOptions } from "@/hooks/use-catalog-options";
import { resolveCatalogLabel, resolveCatalogValue } from "@/lib/catalog-options";
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
  processTrialLessonScheduledAutomation,
  processProposalRecordedAutomation,
  convertLeadToStudentAutomation,
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
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_LEAD_FILTERS);
  const [leadTasks, setLeadTasks] = useState<{ lead_id: string | null; status: string | null; due_date: string | null; activity_type: string | null }[]>([]);
  const [tasksError, setTasksError] = useState(false);
  const [duplicates, setDuplicates] = useState<Lead[]>([]);
  const [duplicateAckKey, setDuplicateAckKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"kanban" | "table">("kanban");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [interactionLead, setInteractionLead] = useState<Lead | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

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
    language_studied: "",
    level: "",
    focus: "",
    modality: "",
    package_id: "",
    schedule_weekday: "Monday",
    schedule_start_time: "10:00",
    notes: "",
  });

  const teacherId = user?.id;
  const stageConfirmation = useLeadStageConfirmation(teacherId, (fresh) => {
    setHistoryRefreshKey((key) => key + 1);
    if (!fresh) return;
    const saved = { ...fresh, stage: normalizeLeadStage(fresh.stage) };
    setLeads((prev) => prev.map((lead) => lead.id === saved.id ? saved : lead));
    setSelectedLead((prev) => prev?.id === saved.id ? saved : prev);
  });
  const { catalogOptions } = useCatalogOptions();
  const convertLanguages = conversionLanguageOptions(teacherLanguages, convertForm.language_studied);
  const pedagogyLabel = (lead: Lead) =>
    leadPedagogyParts(lead, {
      language: (v) => formatLanguageLabel(v, lang),
      catalog: (cat, v) => (catalogOptions ? resolveCatalogLabel(catalogOptions, cat, v) : v),
    }).join(" • ");

  // Pending lead tasks (teacher-scoped) for the task filters. Kept separate from
  // loadData so a retry refetches only the tasks without touching filters or leads.
  const loadLeadTasks = async () => {
    if (!teacherId) return;
    const { data: tasksData, error: tasksErr } = await supabase
      .from("tasks")
      .select("lead_id, status, due_date, activity_type")
      .eq("teacher_id", teacherId)
      .not("lead_id", "is", null);
    if (tasksErr) {
      console.error("Error fetching lead tasks:", tasksErr);
      // Keep previously loaded tasks and flag the failure: an empty task-filter
      // result is not a valid conclusion while the data is unavailable.
      setTasksError(true);
      return;
    }
    setLeadTasks(tasksData || []);
    setTasksError(false);
  };

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

      // 3. Pending lead tasks for task filters
      await loadLeadTasks();
    } catch (err) {
      console.error("Failed loading leads page data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [teacherId]);


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

    // Duplicate check: same teacher only; never modifies existing records.
    const dupKey = `${newLeadForm.phone}|${newLeadForm.email}`;
    if (duplicateAckKey !== dupKey && (newLeadForm.phone.trim() || newLeadForm.email.trim())) {
      const { data: existing, error: dupErr } = await supabase
        .from("leads")
        .select("*")
        .eq("teacher_id", teacherId);
      if (dupErr) {
        setCreateError(t("leadFilters.dupCheckError"));
        return;
      }
      const found = findDuplicateLeads(teacherId, (existing || []) as Lead[], newLeadForm);
      if (found.length > 0) {
        setDuplicates(found.map((l) => ({ ...l, stage: normalizeLeadStage(l.stage) })));
        setDuplicateAckKey(dupKey);
        return;
      }
    }
    setDuplicates([]);
    setDuplicateAckKey(null);

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
      setDuplicates([]);
      setDuplicateAckKey(null);
      loadData();
    } catch (err: any) {
      console.error("[Leads] Create error:", err);
      toast.error(t("leads.toastCreateError"));
    } finally {
      setSubmitting(false);
    }
  };

  // Manual interaction: opens the form; DB triggers update contacted_at/last_interaction_at.
  // No stage change, no tasks, no Rule B call.
  const handleRegisterInteraction = (lead: Lead) => {
    if (lead) setInteractionLead(lead);
  };

  const handleInteractionSaved = async (interaction: LeadInteraction) => {
    const target = interactionLead;
    setHistoryRefreshKey((k) => k + 1);
    if (!target || !teacherId) { toast.success(t("leadInteractions.saved")); return; }
    if (shouldAdvanceStageOnInteraction(target.stage, interaction.type)) {
      try {
        await advanceLeadStageAfterInteraction(teacherId, target.id);
        toast.success(t("leadInteractions.saved"));
      } catch (err) {
        console.error("[Leads] Stage advance after interaction failed:", err);
        toast.warning(t("leadInteractions.stageError"));
      }
    } else {
      toast.success(t("leadInteractions.saved"));
    }
    const { data, error } = await supabase
      .from("leads").select("*").eq("id", target.id).eq("teacher_id", teacherId).maybeSingle();
    if (error || !data) { loadData(); return; }
    const fresh = { ...data, stage: normalizeLeadStage(data.stage) } as Lead;
    setLeads((prev) => prev.map((l) => (l.id === fresh.id ? fresh : l)));
    setSelectedLead((prev) => (prev && prev.id === fresh.id ? fresh : prev));
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
      const confirmedLead = await stageConfirmation.confirmBefore(selectedLead, "Aula experimental agendada");
      if (!confirmedLead) return;
      const res = await processTrialLessonScheduledAutomation(
        confirmedLead,
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
      const confirmedLead = await stageConfirmation.confirmBefore(selectedLead, "Proposta enviada");
      if (!confirmedLead) return;
      const valueNum = parseFloat(proposalForm.potential_value) || 0;
      const res = await processProposalRecordedAutomation(confirmedLead, proposalForm.package_id || undefined, valueNum);

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
    setConvertForm(leadToConversionDraft(lead));
    setIsConvertOpen(true);
  };

  // 6. Handle Lead-to-Student Conversion (Rule F & G)
  const handleConvertLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !teacherId) return;

    setSubmitting(true);
    try {
      const confirmedLead = await stageConfirmation.confirmBefore(selectedLead, "Convertido");
      if (!confirmedLead) return;
      const res = await convertLeadToStudentAutomation({
        leadId: confirmedLead.id,
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
  const now = new Date();
  const taskSummary = summarizeLeadTasks(leadTasks, now);
  const filteredLeads = applyLeadFilters(leads, filters, {
    search: searchQuery,
    now,
    tasks: taskSummary,
    catalogId: (cat, v) => (catalogOptions ? resolveCatalogValue(catalogOptions, cat, v)?.id ?? v : v),
  });

  return (
    <div className="space-y-6 pb-12">
      {stageConfirmation.error && !stageConfirmation.request && <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{stageConfirmation.error}</p>}
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

      <div className="bg-card p-4 rounded-xl border border-border">
        <LeadFiltersBar
          filters={filters}
          onChange={setFilters}
          stages={KANBAN_STAGES}
          leads={leads}
          resultCount={filteredLeads.length}
          hasSearch={searchQuery.trim() !== ""}
          onClearSearch={() => setSearchQuery("")}
          tasksError={tasksError}
          onRetryTasks={loadLeadTasks}
        />
      </div>

      {/* Main Content Area */}
      {loading ? (
        viewMode === "kanban" ? (
          <KanbanSkeleton label={t("auditUi.loadingLeadPipeline")} />
        ) : (
          <ListRowsSkeleton label={t("auditUi.loadingLeadPipeline")} rows={6} />
        )
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
                        className="bg-card border border-border hover:border-muted-foreground/30 hover:bg-card min-w-0 break-words hover:relative hover:z-20 hover:-translate-y-[3px] hover:scale-[1.02] hover:shadow-[0_12px_28px_-10px_oklch(0_0_0/0.28),0_2px_6px_-2px_oklch(0_0_0/0.12)] transition-all duration-[180ms] motion-reduce:transition-none motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 rounded-lg p-3.5 shadow-sm cursor-pointer space-y-2 group"
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
                            <PendingContactBadge lead={lead} now={now} />
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
                    <td className="p-3.5 font-medium text-card-foreground">
                      <div>{lead.full_name}</div>
                      <div className="mt-1"><PendingContactBadge lead={lead} now={now} /></div>
                    </td>
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
            {duplicates.length > 0 && (
              <div role="alert" className="rounded-lg border border-accent/40 bg-accent/10 p-3 space-y-2">
                <p className="text-sm font-semibold">{t("leadFilters.dupTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("leadFilters.dupBody")}</p>
                <ul className="space-y-1.5">
                  {duplicates.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{d.full_name}</span>
                        {" · "}{[d.phone, d.email].filter(Boolean).join(" · ")}
                        {" · "}{formatStatus(d.stage)}
                      </span>
                      <Button type="button" size="sm" variant="outline" className="h-7 text-xs shrink-0"
                        onClick={() => { setIsCreateOpen(false); setSelectedLead(d); }}>
                        {t("leadFilters.dupOpen")}
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? t("leadsUi.creating") : duplicates.length > 0 ? t("leadFilters.dupContinue") : t("leads.saveLeadBtn")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Side panel: Lead details & profile editing */}
      <LeadDetailSheet
        lead={selectedLead}
        packages={packages}
        historyRefreshKey={historyRefreshKey}
        onClose={() => setSelectedLead(null)}
        onSaveProfile={handleSaveLeadProfile}
        teacherId={teacherId}
        onTasksChanged={loadLeadTasks}
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

      <LeadInteractionDialog
        open={!!interactionLead}
        teacherId={teacherId}
        leadId={interactionLead?.id}
        leadName={interactionLead?.full_name}
        onClose={() => setInteractionLead(null)}
        onSaved={handleInteractionSaved}
      />

      {stageConfirmation.request && <LeadStageConfirmationDialog
        key={`${teacherId}:${stageConfirmation.request.lead.id}:${stageConfirmation.request.target}`}
        steps={stageConfirmation.request.steps}
        leadName={stageConfirmation.request.lead.full_name}
        saving={stageConfirmation.saving}
        started={stageConfirmation.started}
        error={stageConfirmation.error}
        onCancel={stageConfirmation.cancel}
        onConfirm={stageConfirmation.submit}
      />}

      {/* Modal: Schedule Trial Lesson */}
      <Dialog open={isTrialOpen && !stageConfirmation.request} onOpenChange={(open) => { if (!submitting) setIsTrialOpen(open); }}>
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
      <Dialog open={isProposalOpen && !stageConfirmation.request} onOpenChange={(open) => { if (!submitting) setIsProposalOpen(open); }}>
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
      <Dialog open={isConvertOpen && !stageConfirmation.request} onOpenChange={(open) => { if (!submitting) setIsConvertOpen(open); }}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <UserCheck className="w-5 h-5" /> {t("leads.convertToStudent")}
            </DialogTitle>
            <DialogDescription>
              {t("leadsUi.convertDescription")}
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
                  value={convertForm.language_studied || "__none__"}
                  onValueChange={(val) => setConvertForm({ ...convertForm, language_studied: val === "__none__" ? "" : val })}
                >
                  <SelectTrigger id="convert_language"><SelectValue placeholder={t("leadPanel.select")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t("leadPanel.none")}</SelectItem>
                    {convertLanguages.map((language) => (
                      <SelectItem key={language} value={language}>{formatLanguageLabel(language, lang)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convert_level">{t("leadPanel.level")}</Label>
                <CatalogOptionSelect
                  id="convert_level"
                  catalog={catalogOptions}
                  category="levels"
                  value={convertForm.level}
                  onChange={(val) => setConvertForm({ ...convertForm, level: val })}
                  placeholder={t("leadPanel.select")}
                  noneLabel={t("leadPanel.none")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_focus">{t("leadsUi.courseFocus")}</Label>
                <CatalogOptionSelect
                  id="convert_focus"
                  catalog={catalogOptions}
                  category="focuses"
                  value={convertForm.focus}
                  onChange={(val) => setConvertForm({ ...convertForm, focus: val })}
                  placeholder={t("leadPanel.select")}
                  noneLabel={t("leadPanel.none")}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="convert_modality">{t("leadPanel.modality")}</Label>
              <CatalogOptionSelect
                id="convert_modality"
                catalog={catalogOptions}
                category="modalities"
                value={convertForm.modality}
                onChange={(val) => setConvertForm({ ...convertForm, modality: val })}
                placeholder={t("leadPanel.select")}
                noneLabel={t("leadPanel.none")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>{t("leadsUi.studentPackage")}</Label>
              <Select
                value={convertForm.package_id || "__none__"}
                onValueChange={(val) => setConvertForm({ ...convertForm, package_id: val === "__none__" ? "" : val })}
              >
                <SelectTrigger><SelectValue placeholder={t("leadsUi.selectPackage")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("leadPanel.none")}</SelectItem>
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

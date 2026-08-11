import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
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
  Sparkles,
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
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
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
import { AttentionQueueWidget } from "@/components/bloom/AttentionQueueWidget";
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
    ],
  }),
  component: LeadsPage,
});

const KANBAN_STAGES = [
  { id: "Novo contato", label: "Novo contato", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  { id: "Em conversa", label: "Em conversa", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { id: "Aula experimental agendada", label: "Aula experimental", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  { id: "Proposta enviada", label: "Proposta enviada", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { id: "Convertido", label: "Convertido", color: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20" },
  { id: "Perdido", label: "Perdido", color: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
];

function LeadsPage() {
  const { user } = useAuth();
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
  const [newLeadForm, setNewLeadForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    source: "whatsapp",
    language_studied: "English",
    level: "A1",
    focus: "General English",
    modality: "Online",
    notes: "",
  });

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
    if (!teacherId || !newLeadForm.full_name.trim()) return;

    setSubmitting(true);
    try {
      const { data: insertedLead, error } = await supabase
        .from("leads")
        .insert({
          teacher_id: teacherId,
          full_name: newLeadForm.full_name.trim(),
          email: newLeadForm.email.trim() || null,
          phone: newLeadForm.phone.trim() || null,
          source: newLeadForm.source,
          language_studied: newLeadForm.language_studied,
          level: newLeadForm.level,
          focus: newLeadForm.focus,
          modality: newLeadForm.modality,
          notes: newLeadForm.notes.trim() || null,
          stage: "Novo contato",
        })
        .select("*")
        .single();

      if (error || !insertedLead) {
        toast.error("Erro ao criar lead: " + (error?.message || ""));
        setSubmitting(false);
        return;
      }

      // Execute Rule A Automation
      await processNewLeadAutomation(insertedLead as Lead);
      toast.success("Lead criado com sucesso! Automações Bloom ativadas.");

      setIsCreateOpen(false);
      setNewLeadForm({
        full_name: "",
        email: "",
        phone: "",
        source: "whatsapp",
        language_studied: "English",
        level: "A1",
        focus: "General English",
        modality: "Online",
        notes: "",
      });
      loadData();
    } catch (err: any) {
      toast.error("Falha ao criar lead: " + err.message);
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
        toast.success("Interação registrada! Stage atualizado.");
        loadData();
        setSelectedLead((prev) => (prev ? { ...prev, stage: "Em conversa" } : null));
      } else {
        toast.error("Erro: " + res.error);
      }
    } catch (err: any) {
      toast.error("Falha ao registrar interação.");
    }
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
        toast.success("Aula experimental agendada! Criado evento na Agenda e tarefas de acompanhamento.");
        setIsTrialOpen(false);
        loadData();
        setSelectedLead((prev) =>
          prev ? { ...prev, stage: "Aula experimental agendada", trial_scheduled_at: `${trialForm.date}T${trialForm.time}` } : null
        );
      } else {
        toast.error("Erro ao agendar aula experimental: " + res.error);
      }
    } catch (err: any) {
      toast.error("Falha ao agendar aula experimental.");
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
        toast.success("Proposta registrada! Stage atualizado para 'Proposta enviada'.");
        setIsProposalOpen(false);
        loadData();
        setSelectedLead((prev) =>
          prev ? { ...prev, stage: "Proposta enviada", potential_value: valueNum } : null
        );
      } else {
        toast.error("Erro ao registrar proposta: " + res.error);
      }
    } catch (err: any) {
      toast.error("Falha ao registrar proposta.");
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
        toast.success("Lead convertido em aluno com sucesso! Aluno, horários e Agenda gerados.");
        setIsConvertOpen(false);
        setSelectedLead(null);
        loadData();
      } else {
        toast.error("Erro na conversão: " + res.error);
      }
    } catch (err: any) {
      toast.error("Falha na conversão do lead: " + err.message);
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
        eyebrow="Pipeline Comercial"
        title="Leads & Oportunidades"
        description="Transforme interessados do WhatsApp e Instagram em alunos matriculados de forma automatizada."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5 shadow-sm">
              <Plus className="w-4 h-4" /> Novo Lead
            </Button>
          </div>
        }
      />

      {/* Attention Queue Widget */}
      {teacherId && (
        <AttentionQueueWidget
          teacherId={teacherId}
          onNavigateToLead={(leadId) => {
            const l = leads.find((item) => item.id === leadId);
            if (l) setSelectedLead(l);
          }}
        />
      )}

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-4 rounded-xl border border-border">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, email ou WhatsApp..."
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
              <TableIcon className="w-3.5 h-3.5" /> Tabela
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" /> Carregando pipeline de leads...
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
                      {stage.label}
                    </Badge>
                  </span>
                  <span className="text-xs font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {stageLeads.length}
                  </span>
                </div>

                <div className="space-y-3 flex-1 overflow-y-auto">
                  {stageLeads.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                      Nenhum lead
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
                            <Badge variant="outline" className="text-[10px] bg-muted/50 border-none">
                              {lead.language_studied || "Inglês"} • {lead.level || "A1"}
                            </Badge>
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
                            <MessageSquare className="w-3 h-3" /> Registrar Interação
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
                  <th className="p-3.5">Nome do Lead</th>
                  <th className="p-3.5">Contato</th>
                  <th className="p-3.5">Estágio</th>
                  <th className="p-3.5">Idioma / Nível</th>
                  <th className="p-3.5">Valor Potencial</th>
                  <th className="p-3.5">Origem</th>
                  <th className="p-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3.5 font-medium text-card-foreground">{lead.full_name}</td>
                    <td className="p-3.5 text-xs text-muted-foreground">
                      <div>{lead.phone || "-"}</div>
                      <div>{lead.email || "-"}</div>
                    </td>
                    <td className="p-3.5">
                      <Badge variant="outline" className="text-xs">
                        {lead.stage}
                      </Badge>
                    </td>
                    <td className="p-3.5 text-xs">
                      {lead.language_studied || "Inglês"} ({lead.level || "A1"})
                    </td>
                    <td className="p-3.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      {lead.potential_value ? formatReaisToBRL(lead.potential_value) : "-"}
                    </td>
                    <td className="p-3.5 text-xs capitalize">{lead.source || "-"}</td>
                    <td className="p-3.5 text-right">
                      <Button size="sm" variant="outline" onClick={() => setSelectedLead(lead)} className="h-8 text-xs">
                        Ver Detalhes
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" /> Adicionar Novo Lead
            </DialogTitle>
            <DialogDescription>
              Cadastre um novo contato. A automação Bloom criará tarefas de acompanhamento automaticamente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateLead} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                required
                placeholder="Ex: Mariana Silva"
                value={newLeadForm.full_name}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, full_name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone">WhatsApp / Telefone</Label>
                <Input
                  id="phone"
                  placeholder="(11) 99999-9999"
                  value={newLeadForm.phone}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="mariana@email.com"
                  value={newLeadForm.email}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Origem do Contato</Label>
                <Select
                  value={newLeadForm.source}
                  onValueChange={(val) => setNewLeadForm({ ...newLeadForm, source: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="website">Site / Form</SelectItem>
                    <SelectItem value="referral">Indicação</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Idioma de Interesse</Label>
                <Select
                  value={newLeadForm.language_studied}
                  onValueChange={(val) => setNewLeadForm({ ...newLeadForm, language_studied: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {hasConfiguredLanguages ? (
                      teacherLanguages.map((langItem) => (
                        <SelectItem key={langItem} value={langItem}>
                          {formatLanguageLabel(langItem, "pt")}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value={newLeadForm.language_studied || "English"}>
                        {formatLanguageLabel(newLeadForm.language_studied || "English", "pt")}
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações Iniciais</Label>
              <Textarea
                id="notes"
                placeholder="Ex: Quer aprender inglês para negócios e viagem em outubro."
                rows={2}
                value={newLeadForm.notes}
                onChange={(e) => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Criando..." : "Salvar Lead"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Drawer / Modal: Lead Details & Automation Actions */}
      {selectedLead && (
        <Dialog open={!!selectedLead} onOpenChange={() => setSelectedLead(null)}>
          <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl font-bold">{selectedLead.full_name}</DialogTitle>
                <Badge variant="outline" className="text-xs px-2.5 py-0.5">
                  {selectedLead.stage}
                </Badge>
              </div>
              <DialogDescription>
                Criado em {selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleDateString("pt-BR") : "recentemente"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 pt-2">
              {/* Quick Info Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-muted/40 p-3.5 rounded-lg border border-border text-xs">
                <div>
                  <span className="text-muted-foreground block">Telefone</span>
                  <span className="font-medium text-card-foreground">{selectedLead.phone || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">E-mail</span>
                  <span className="font-medium text-card-foreground truncate block">{selectedLead.email || "Não informado"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Idioma / Nível</span>
                  <span className="font-medium text-card-foreground">{selectedLead.language_studied || "Inglês"} ({selectedLead.level || "A1"})</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Valor Potencial</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {selectedLead.potential_value ? formatReaisToBRL(selectedLead.potential_value) : "Pendente"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Origem</span>
                  <span className="font-medium text-card-foreground capitalize">{selectedLead.source || "Manual"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Modalidade</span>
                  <span className="font-medium text-card-foreground">{selectedLead.modality || "Online"}</span>
                </div>
              </div>

              {/* Action Buttons Bar */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações de Automação Interna</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs justify-start gap-2"
                    onClick={() => handleRegisterInteraction(selectedLead)}
                  >
                    <MessageSquare className="w-4 h-4 text-amber-500" /> Registrar Interação
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs justify-start gap-2"
                    onClick={() => {
                      setTrialForm({ date: new Date().toISOString().split("T")[0], time: "14:00", duration: 60 });
                      setIsTrialOpen(true);
                    }}
                  >
                    <Calendar className="w-4 h-4 text-purple-500" /> Agendar Exp. na Agenda
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 text-xs justify-start gap-2"
                    onClick={() => {
                      setProposalForm({ package_id: selectedLead.package_id || "", potential_value: selectedLead.potential_value?.toString() || "" });
                      setIsProposalOpen(true);
                    }}
                  >
                    <FileText className="w-4 h-4 text-blue-500" /> Registrar Proposta
                  </Button>

                  <Button
                    size="sm"
                    variant="default"
                    className="h-9 text-xs justify-start gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => openConvertModal(selectedLead)}
                  >
                    <UserCheck className="w-4 h-4" /> Converter em Aluno
                  </Button>
                </div>
              </div>

              {/* Bloom Activity History */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" /> Histórico de Automação Bloom
                </h4>

                {activities.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic bg-muted/20 p-3 rounded-lg border border-dashed border-border">
                    Nenhuma ação de automação registrada para este lead ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activities.map((act) => (
                      <div key={act.id} className="p-3 rounded-lg bg-card border border-border text-xs space-y-1">
                        <div className="flex items-center justify-between font-medium text-card-foreground">
                          <span className="text-primary flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> {act.description}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(act.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Modal: Schedule Trial Lesson */}
      <Dialog open={isTrialOpen} onOpenChange={setIsTrialOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-500" /> Agendar Aula Experimental
            </DialogTitle>
            <DialogDescription>
              Agende a aula experimental para {selectedLead?.full_name}. Isso criará o evento na Agenda e gerará as tarefas de confirmação.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleScheduleTrial} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="trial_date">Data *</Label>
                <Input
                  id="trial_date"
                  type="date"
                  required
                  value={trialForm.date}
                  onChange={(e) => setTrialForm({ ...trialForm, date: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trial_time">Horário *</Label>
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
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Agendando..." : "Confirmar Agendamento"}
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
              <FileText className="w-5 h-5 text-blue-500" /> Registrar Proposta
            </DialogTitle>
            <DialogDescription>
              Selecione o pacote ou insira o valor potencial oferecido a {selectedLead?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordProposal} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Pacote Selecionado</Label>
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
                <SelectTrigger><SelectValue placeholder="Selecione um pacote..." /></SelectTrigger>
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
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Salvando..." : "Salvar Proposta"}
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
              <UserCheck className="w-5 h-5" /> Converter Lead em Aluno
            </DialogTitle>
            <DialogDescription>
              Bloom preencheu os dados com base no lead. Ao confirmar, o aluno será cadastrado, os horários e a Agenda dos próximos 2 meses serão gerados de forma transacional.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConvertLead} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convert_name">Nome Completo *</Label>
                <Input
                  id="convert_name"
                  required
                  value={convertForm.full_name}
                  onChange={(e) => setConvertForm({ ...convertForm, full_name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_email">E-mail</Label>
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
                <Label htmlFor="convert_phone">Telefone / WhatsApp</Label>
                <Input
                  id="convert_phone"
                  value={convertForm.phone}
                  onChange={(e) => setConvertForm({ ...convertForm, phone: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_language">Idioma Estudado</Label>
                <Select
                  value={convertForm.language_studied}
                  onValueChange={(val) => setConvertForm({ ...convertForm, language_studied: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="English">Inglês (English)</SelectItem>
                    <SelectItem value="Spanish">Espanhol (Español)</SelectItem>
                    <SelectItem value="French">Francês (Français)</SelectItem>
                    <SelectItem value="German">Alemão (Deutsch)</SelectItem>
                    <SelectItem value="Italian">Italiano</SelectItem>
                    <SelectItem value="Portuguese">Português (para estrangeiros)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="convert_level">Nível (CEFR)</Label>
                <Select
                  value={convertForm.level}
                  onValueChange={(val) => setConvertForm({ ...convertForm, level: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A1">A1 - Iniciante</SelectItem>
                    <SelectItem value="A2">A2 - Básico</SelectItem>
                    <SelectItem value="B1">B1 - Intermediário</SelectItem>
                    <SelectItem value="B2">B2 - Usuário Independente</SelectItem>
                    <SelectItem value="C1">C1 - Avançado</SelectItem>
                    <SelectItem value="C2">C2 - Proficiente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="convert_focus">Foco do Curso</Label>
                <Select
                  value={convertForm.focus}
                  onValueChange={(val) => setConvertForm({ ...convertForm, focus: val })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General English">Inglês Geral</SelectItem>
                    <SelectItem value="Business">Business / Profissional</SelectItem>
                    <SelectItem value="Conversation">Conversação</SelectItem>
                    <SelectItem value="Exam Prep">Preparatório para Exames</SelectItem>
                    <SelectItem value="Travel">Viagens</SelectItem>
                    <SelectItem value="Kids / Teens">Kids & Teens</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Pacote do Aluno</Label>
              <Select
                value={convertForm.package_id}
                onValueChange={(val) => setConvertForm({ ...convertForm, package_id: val })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione um pacote..." /></SelectTrigger>
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
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {submitting ? "Convertendo..." : "Confirmar Conversão"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useTeacherLanguages, CANONICAL_LANGUAGES } from "@/hooks/use-teacher-languages";
import { toast } from "sonner";
import {
  Settings,
  Sparkles,
  Clock,
  CheckCircle2,
  Sliders,
  Shield,
  RefreshCw,
  Save,
  Bell,
  User,
  Globe,
  Check,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { PanelCard } from "@/components/bloom/PanelCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AutomationSettings,
  getOrCreateAutomationSettings,
  saveAutomationSettings,
} from "@/lib/automation-engine";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Bloom" },
      { name: "description", content: "Manage your Bloom workspace and internal automation preferences." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [automationSettings, setAutomationSettings] = useState<AutomationSettings>({
    teacher_id: user?.id || "",
    lead_followup_delay_days: 1,
    proposal_followup_delay_days: 2,
    trial_confirmation_lead_hours: 24,
    inactivity_period_days: 7,
    auto_stage_transitions_enabled: true,
    auto_task_creation_enabled: true,
  });

  const loadSettings = async () => {
    if (!user?.id) return;
    setLoading(true);
    const data = await getOrCreateAutomationSettings(user.id);
    setAutomationSettings(data);
    setLoading(false);
  };

  useEffect(() => {
    loadSettings();
  }, [user?.id]);

  const handleSaveAutomationSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setSaving(true);
    const res = await saveAutomationSettings(user.id, automationSettings);
    setSaving(false);

    if (res.success) {
      toast.success(t("settings.savedSuccessfully"));
    } else {
      console.error("[Settings] Save error:", res.error);
      toast.error(t("settings.saveError"));
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        eyebrow={t("settings.title")}
        title={t("settings.title")}
        description={t("settings.subtitle")}
      />

      <Tabs defaultValue="automations" className="space-y-6">
        <TabsList className="bg-card border border-border p-1 rounded-xl">
          <TabsTrigger value="automations" className="gap-2 text-xs font-semibold">
            <Sparkles className="w-4 h-4 text-primary" /> {t("settings.tabAutomations")}
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2 text-xs font-semibold">
            <User className="w-4 h-4" /> {t("settings.tabProfilePreferences")}
          </TabsTrigger>
        </TabsList>

        {/* AUTOMATION SETTINGS TAB */}
        <TabsContent value="automations">
          <form onSubmit={handleSaveAutomationSettings} className="space-y-6">
            <PanelCard
              title={t("settings.automationRulesTitle")}
              description={t("settings.automationRulesSubtitle")}
            >
              {loading ? (
                <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-primary" /> Carregando configurações...
                </div>
              ) : (
                <div className="space-y-6 pt-2">
                  {/* Toggles */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4 border-b border-border">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">{t("settings.autoStageTitle")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.autoStageSubtitle")}
                        </p>
                      </div>
                      <Switch
                        checked={automationSettings.auto_stage_transitions_enabled}
                        onCheckedChange={(val) =>
                          setAutomationSettings({ ...automationSettings, auto_stage_transitions_enabled: val })
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-semibold">{t("settings.autoTaskTitle")}</Label>
                        <p className="text-xs text-muted-foreground">
                          {t("settings.autoTaskSubtitle")}
                        </p>
                      </div>
                      <Switch
                        checked={automationSettings.auto_task_creation_enabled}
                        onCheckedChange={(val) =>
                          setAutomationSettings({ ...automationSettings, auto_task_creation_enabled: val })
                        }
                      />
                    </div>
                  </div>

                  {/* Delay Configuration Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="lead_delay">Atraso para 1º Contato com Lead (dias)</Label>
                      <Input
                        id="lead_delay"
                        type="number"
                        min={1}
                        max={30}
                        value={automationSettings.lead_followup_delay_days}
                        onChange={(e) =>
                          setAutomationSettings({
                            ...automationSettings,
                            lead_followup_delay_days: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Dias até o vencimento da tarefa "Entrar em contato com {`{lead}`}".
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="proposal_delay">Atraso para Follow-up de Proposta (dias)</Label>
                      <Input
                        id="proposal_delay"
                        type="number"
                        min={1}
                        max={30}
                        value={automationSettings.proposal_followup_delay_days}
                        onChange={(e) =>
                          setAutomationSettings({
                            ...automationSettings,
                            proposal_followup_delay_days: parseInt(e.target.value) || 2,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Dias após o envio da proposta para a tarefa de acompanhamento.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="trial_hours">Antecedência da Confirmação de Aula Exp. (horas)</Label>
                      <Input
                        id="trial_hours"
                        type="number"
                        min={1}
                        max={72}
                        value={automationSettings.trial_confirmation_lead_hours}
                        onChange={(e) =>
                          setAutomationSettings({
                            ...automationSettings,
                            trial_confirmation_lead_hours: parseInt(e.target.value) || 24,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Horas de antecedência para enviar lembrete ao professor.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="inactivity_days">Período de Inatividade do Lead (dias)</Label>
                      <Input
                        id="inactivity_days"
                        type="number"
                        min={1}
                        max={60}
                        value={automationSettings.inactivity_period_days}
                        onChange={(e) =>
                          setAutomationSettings({
                            ...automationSettings,
                            inactivity_period_days: parseInt(e.target.value) || 7,
                          })
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Dias sem interação para o lead aparecer em "Precisa de atenção".
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end">
                    <Button type="submit" disabled={saving} className="gap-2 shadow-sm">
                      {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      Salvar Preferências de Automação
                    </Button>
                  </div>
                </div>
              )}
            </PanelCard>
          </form>
        </TabsContent>

        {/* PROFILE TAB / TEACHING LANGUAGES MANAGER & PLATFORM LANGUAGE */}
        <TabsContent value="profile" className="space-y-6">
          <PlatformLanguageManager />
          <TeachingLanguagesManager />

          <PanelCard title="Perfil de Professor" description="Suas informações cadastrais e dados da conta.">
            <div className="space-y-4 text-sm text-muted-foreground">
              <p>ID do Professor: <code className="text-card-foreground font-mono bg-muted px-2 py-0.5 rounded">{user?.id || "Conectado"}</code></p>
              <p>Email: <span className="font-semibold text-card-foreground">{user?.email || "professor@bloom.com"}</span></p>
            </div>
          </PanelCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlatformLanguageManager() {
  const { lang, setLang } = useLanguage();

  return (
    <PanelCard
      title={lang === "pt" ? "Idioma da Plataforma" : "Platform Language"}
      description={
        lang === "pt"
          ? "Escolha o idioma em que deseja visualizar os menus, botões e telas do Bloom."
          : "Choose the language in which you want to view Bloom menus, buttons, and pages."
      }
    >
      <div className="flex flex-wrap items-center gap-4 pt-1">
        <button
          type="button"
          onClick={() => setLang("pt")}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            lang === "pt"
              ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
              : "bg-card text-stone-700 hover:bg-secondary/40 border-border"
          }`}
        >
          <span className="text-base">🇧🇷</span>
          <span>Português (Brasil)</span>
          {lang === "pt" && <Check className="h-4 w-4 text-emerald-400" />}
        </button>

        <button
          type="button"
          onClick={() => setLang("en")}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
            lang === "en"
              ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm"
              : "bg-card text-stone-700 hover:bg-secondary/40 border-border"
          }`}
        >
          <span className="text-base">🇺🇸</span>
          <span>English (US)</span>
          {lang === "en" && <Check className="h-4 w-4 text-emerald-400" />}
        </button>
      </div>
    </PanelCard>
  );
}

function TeachingLanguagesManager() {
  const { languages, formatLanguageLabel, updateTeacherLanguages, checkLanguageInUse } = useTeacherLanguages();
  const { lang } = useLanguage();
  const [selectedLangs, setSelectedLangs] = useState<string[]>([]);
  const [warningLang, setWarningLang] = useState<{ id: string; details: string[] } | null>(null);

  useEffect(() => {
    setSelectedLangs(languages);
  }, [languages]);

  const handleToggleLanguage = async (langId: string) => {
    if (selectedLangs.includes(langId)) {
      // Removing a language — check if in use
      const usage = await checkLanguageInUse(langId);
      if (usage.inUse) {
        setWarningLang({ id: langId, details: usage.details });
        return;
      }
      const updated = selectedLangs.filter((l) => l !== langId);
      setSelectedLangs(updated);
      await updateTeacherLanguages(updated);
    } else {
      // Adding a language
      const updated = [...selectedLangs, langId];
      setSelectedLangs(updated);
      await updateTeacherLanguages(updated);
    }
  };

  const handleConfirmRemoval = async () => {
    if (!warningLang) return;
    const updated = selectedLangs.filter((l) => l !== warningLang.id);
    setSelectedLangs(updated);
    setWarningLang(null);
    await updateTeacherLanguages(updated);
  };

  return (
    <div className="space-y-4">
      <PanelCard
        title={lang === "pt" ? "Idiomas de Ensino" : "Teaching Languages"}
        description={
          lang === "pt"
            ? "Selecione os idiomas que você ensina. Estes idiomas definirão as opções nos filtros de alunos, cadastro de turmas e leads em toda a Bloom."
            : "Select the languages you teach. These languages will populate options across student filters, classes, and leads in Bloom."
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2.5 pt-1">
            {CANONICAL_LANGUAGES.map((opt) => {
              const isSelected = selectedLangs.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleToggleLanguage(opt.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-[#163020] text-[#F4EBE1] border-[#163020] shadow-sm scale-[1.02]"
                      : "bg-card text-stone-700 hover:bg-secondary/40 border-border"
                  }`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>{lang === "pt" ? opt.labelPt : opt.labelEn}</span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </button>
              );
            })}
          </div>

          <p className="text-xs text-muted-foreground pt-2 border-t border-border">
            {lang === "pt"
              ? "Idiomas selecionados aqui aparecem automaticamente nos seletores da plataforma."
              : "Languages selected here will automatically populate selectors across your workspace."}
          </p>
        </div>
      </PanelCard>

      {/* WARNING MODAL FOR IN-USE LANGUAGE REMOVAL */}
      {warningLang && (
        <Dialog open={true} onOpenChange={() => setWarningLang(null)}>
          <DialogContent className="max-w-md rounded-2xl p-6 text-center space-y-4">
            <DialogHeader>
              <div className="h-12 w-12 rounded-2xl bg-amber-100 text-amber-800 mx-auto flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-amber-800" />
              </div>
              <DialogTitle className="text-lg font-bold font-outfit text-stone-900 pt-2">
                {lang === "pt" ? "Quer mesmo remover este idioma?" : "Remove this language?"}
              </DialogTitle>
            </DialogHeader>

            <p className="text-sm text-stone-600 leading-relaxed font-medium">
              {lang === "pt"
                ? "Este idioma ainda está sendo usado em alunos, turmas ou outros registros da Bloom."
                : "This language is currently associated with active students, classes, or other records in Bloom."}
            </p>

            {warningLang.details.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 font-semibold">
                {lang === "pt" ? "Registros afetados: " : "Affected records: "}
                {warningLang.details.join(", ")}
              </div>
            )}

            <div className="flex flex-col gap-2 pt-2">
              <Button
                type="button"
                onClick={() => setWarningLang(null)}
                className="w-full h-11 rounded-xl bg-[#163020] text-[#F4EBE1] hover:bg-[#1a3825] font-bold text-xs"
              >
                {lang === "pt" ? "Manter idioma" : "Keep language"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleConfirmRemoval}
                className="w-full h-11 rounded-xl border-stone-300 text-stone-700 hover:bg-stone-100 font-bold text-xs"
              >
                {lang === "pt" ? "Remover mesmo assim" : "Remove anyway"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

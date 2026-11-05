import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLibraryAccess } from "@/hooks/use-library-access";
import { LIBRARY_CATALOG, librarySourceId, type LibraryResource, type ResourceTemplate } from "@/lib/library-catalog";
import { accessLibraryResource } from "@/lib/library-content.functions";
import { isLibraryPremiumError, LIBRARY_ACCESS_QUERY_KEY, type LibraryClassification } from "@/lib/library-access";
import { PremiumBenefitsDialog } from "@/components/bloom/PremiumGate";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/use-language";
import { toast } from "sonner";
import {
  FileText,
  Wallet,
  Megaphone,
  Briefcase,
  Target,
  GraduationCap,
  UserCheck,
  Compass,
  Award,
  Search,
  Bookmark,
  BookmarkCheck,
  History,
  Plus,
  Trash2,
  Eye,
  Copy,
  Download,
  Send,
  Link2,
  ArrowLeft,
  ChevronRight,
  FileSpreadsheet,
  Check,
  X,
  Lock,
} from "lucide-react";
import { PageHeader } from "@/components/bloom/PageHeader";
import { PanelCard } from "@/components/bloom/PanelCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/_app/resources")({
  head: () => ({
    meta: [
      { title: "Resources · Bloom" },
      { name: "description", content: "Bloom's administrative and pedagogical business toolkit." },
      { property: "og:title", content: "Resources · Bloom" },
      { property: "og:description", content: "Bloom's administrative and pedagogical business toolkit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResourcesPage,
});

const TRANSLATIONS = {
  en: {
    title: "Resources & Templates",
    subtitle: "Bloom's administrative and pedagogical business toolkit.",
    searchPlaceholder: "Search contracts, policies, evaluations...",
    quickActions: "Quick Actions",
    adminTitle: "Administrative Resources",
    adminSubtitle: "Contracts, billing, client communications, and policies.",
    pedagogicalTitle: "Pedagogical Resources",
    pedagogicalSubtitle: "Placement, student goals, planners, and course reports.",
    recentTitle: "Recently Used",
    favoritesTitle: "Favorites",
    noRecent: "No recently used templates yet.",
    noFavorites: "Mark templates as favorites for quick access.",
    useTemplate: "Use Template",
    preview: "Preview",
    duplicate: "Duplicate",
    favorite: "Favorite",
    unfavorite: "Unfavorite",
    backToDashboard: "Back to Resources",
    categoryTemplates: "templates",
    exportPdf: "Export PDF",
    sendStudent: "Send to Student",
    attachProfile: "Attach to Profile",
    copiedToast: "Template copied to clipboard!",
    duplicateToast: "Template duplicated successfully!",
    fillPlaceholders: "Fill Placeholders",
    documentPreview: "Document Preview",
    soon: "Soon",
    close: "Close",
    newContract: "New Contract",
    newPlacement: "New Placement Test",
    newReport: "New Progress Report",
    newCertificate: "New Certificate",
    contracts: "Contracts",
    finance: "Finance",
    communication: "Communication",
    business: "Business Policies",
    placement: "Placement",
    assessment: "Assessment",
    records: "Student Records",
    planning: "Planning",
    certificates: "Certificates",
    cancel: "Cancel",
    save: "Save",
    copy: "Copy Document",
  },
  pt: {
    title: "Recursos e Modelos",
    subtitle: "Kit de ferramentas administrativas e pedagógicas do Bloom.",
    searchPlaceholder: "Buscar contratos, políticas, avaliações...",
    quickActions: "Ações Rápidas",
    adminTitle: "Recursos Administrativos",
    adminSubtitle: "Contratos, cobrança, comunicados e políticas comerciais.",
    pedagogicalTitle: "Recursos Pedagógicos",
    pedagogicalSubtitle: "Nivelamento, objetivos dos alunos, cronogramas e relatórios.",
    recentTitle: "Usados Recentemente",
    favoritesTitle: "Favoritos",
    noRecent: "Nenhum modelo usado recentemente.",
    noFavorites: "Marque modelos como favoritos para acesso rápido.",
    useTemplate: "Usar Modelo",
    preview: "Visualizar",
    duplicate: "Duplicar",
    favorite: "Favoritar",
    unfavorite: "Desfavoritar",
    backToDashboard: "Voltar para Recursos",
    categoryTemplates: "modelos",
    exportPdf: "Exportar PDF",
    sendStudent: "Enviar ao Aluno",
    attachProfile: "Anexar ao Perfil",
    copiedToast: "Modelo copiado para a área de transferência!",
    duplicateToast: "Modelo duplicado com sucesso!",
    fillPlaceholders: "Preencher Campos",
    documentPreview: "Pré-visualização do Documento",
    soon: "Em breve",
    close: "Fechar",
    newContract: "Novo Contrato",
    newPlacement: "Novo Teste de Nivelamento",
    newReport: "Novo Relatório de Progresso",
    newCertificate: "Novo Certificado",
    contracts: "Contratos",
    finance: "Finanças",
    communication: "Comunicação",
    business: "Políticas Comerciais",
    placement: "Nivelamento",
    assessment: "Avaliação",
    records: "Fichas de Aluno",
    planning: "Planejamento",
    certificates: "Certificados",
    cancel: "Cancelar",
    save: "Salvar",
    copy: "Copiar Documento",
  },
};

function ResourcesPage() {
  const { lang, t: translate } = useLanguage();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const library = useLibraryAccess();
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [accessBusy, setAccessBusy] = useState(false);
  const accessAttempt = useRef(0);
  const userRef = useRef(user?.id);
  userRef.current = user?.id;
  const [loadedLevel, setLoadedLevel] = useState<"free" | "pro" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // States for dynamic additions
  const [favorites, setFavorites] = useState<string[]>([]);
  const [recentOpened, setRecentOpened] = useState<string[]>([]);
  const [customTemplates, setCustomTemplates] = useState<ResourceTemplate[]>([]);

  // Modals state
  const [previewTemplate, setPreviewTemplate] = useState<ResourceTemplate | null>(null);
  const [builderTemplate, setBuilderTemplate] = useState<ResourceTemplate | null>(null);
  const [builderForm, setBuilderForm] = useState<Record<string, string>>({});

  useEffect(() => {
    // Load states
    const savedFavorites = localStorage.getItem("bloom.resources.favorites");
    if (savedFavorites) setFavorites(JSON.parse(savedFavorites));

    const savedRecent = localStorage.getItem("bloom.resources.recent");
    if (savedRecent) setRecentOpened(JSON.parse(savedRecent));

    const savedCustom = localStorage.getItem("bloom.resources.custom");
    if (savedCustom) setCustomTemplates(JSON.parse(savedCustom));
  }, []);

  const t = TRANSLATIONS[lang];

  // Helper to persist Favorites
  const toggleFavorite = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const newFavorites = favorites.includes(id)
      ? favorites.filter((favId) => favId !== id)
      : [...favorites, id];
    setFavorites(newFavorites);
    localStorage.setItem("bloom.resources.favorites", JSON.stringify(newFavorites));
  };

  // Helper to persist Recently Used
  const recordRecentOpened = (id: string) => {
    const updated = [id, ...recentOpened.filter((item) => item !== id)].slice(0, 5);
    setRecentOpened(updated);
    localStorage.setItem("bloom.resources.recent", JSON.stringify(updated));
  };

  // No visual/default classification ever substitutes for this authenticated assertion.
  const loadTemplate = async (template: LibraryResource): Promise<ResourceTemplate | null> => {
    const owner = user?.id;
    if (!owner) return null;
    const attempt = ++accessAttempt.current;
    setAccessBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || session.user.id !== owner || userRef.current !== owner) return null;
      const result = await accessLibraryResource({ data: {
        accessToken: session.access_token, resourceId: librarySourceId(template.id), operation: "open",
      } });
      if (attempt !== accessAttempt.current || userRef.current !== owner || !result.template) return null;
      setLoadedLevel(result.accessLevel);
      queryClient.setQueryData<LibraryClassification[]>(LIBRARY_ACCESS_QUERY_KEY(owner), (rows) => rows
        ? [...rows.filter((row) => row.resource_id !== librarySourceId(template.id)), { resource_id: librarySourceId(template.id), access_level: result.accessLevel }]
        : undefined);
      const custom = customTemplates.find((item) => item.id === template.id);
      return custom ? { ...result.template, ...custom } : result.template;
    } catch (error) {
      if (isLibraryPremiumError(error)) setPremiumOpen(true);
      else toast.error(translate("libraryAccess.accessError"));
      return null;
    } finally {
      if (attempt === accessAttempt.current) setAccessBusy(false);
    }
  };

  // Classification refresh revokes an open Premium document without changing preferences.
  useEffect(() => {
    const openTemplate = previewTemplate ?? builderTemplate;
    if (!openTemplate) return;
    const level = library.level(librarySourceId(openTemplate.id));
    if (!library.fullAccess && (level === "pro" || (level === null && loadedLevel !== "free"))) {
      setPreviewTemplate(null);
      setBuilderTemplate(null);
      setBuilderForm({});
    }
  }, [library.data, library.isError, library.fullAccess, previewTemplate, builderTemplate, loadedLevel]);

  useEffect(() => {
    accessAttempt.current += 1;
    setPreviewTemplate(null);
    setBuilderTemplate(null);
    setBuilderForm({});
  }, [user?.id]);

  const accessBadge = (id: string) => {
    if (library.level(librarySourceId(id)) !== "pro") return null;
    return <Badge variant="secondary" className="gap-1 text-xs"><Lock className="h-3 w-3" />{translate("libraryAccess.premium")}</Badge>;
  };

  // Duplicates keep their source classification and reauthorize before copying content.
  const handleDuplicateTemplate = async (template: ResourceTemplate, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const authorized = await loadTemplate(template);
    if (!authorized) return;
    const newId = `${template.id}-copy-${Date.now()}`;
    const duplicated: ResourceTemplate = {
      ...authorized,
      id: newId,
      title: `${template.title} (${lang === "pt" ? "Cópia" : "Copy"})`,
    };
    const updatedCustom = [...customTemplates, duplicated];
    setCustomTemplates(updatedCustom);
    localStorage.setItem("bloom.resources.custom", JSON.stringify(updatedCustom));
    toast.success(t.duplicateToast);
  };

  // Trigger template builder modal
  const handleUseTemplate = async (template: LibraryResource, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const authorized = await loadTemplate(template);
    if (!authorized) return;
    setPreviewTemplate(null);
    setBuilderTemplate(authorized);
    recordRecentOpened(template.id);

    // Initialize placeholders
    const initialForm: Record<string, string> = {};
    authorized.placeholders.forEach((p) => {
      initialForm[p] = "";
    });
    setBuilderForm(initialForm);
  };

  const handleOpenPreview = async (template: LibraryResource) => {
    const authorized = await loadTemplate(template);
    if (!authorized) return;
    setBuilderTemplate(null);
    setPreviewTemplate(authorized);
    recordRecentOpened(template.id);
  };

  // Combine static and custom user templates
  const allTemplates = [...LIBRARY_CATALOG, ...customTemplates];

  // Helper to search and filter templates
  const filteredTemplates = allTemplates.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedCategory) {
      return item.category === selectedCategory && matchesSearch;
    }
    return matchesSearch;
  });

  // Category counts
  const getCategoryCount = (cat: string) => {
    return allTemplates.filter((t) => t.category === cat).length;
  };

  // Render template content replacing placeholders
  const getRenderedContent = () => {
    if (!builderTemplate) return "";
    let content = builderTemplate.content;
    Object.entries(builderForm).forEach(([key, val]) => {
      const placeholder = `[${key}]`;
      const replacement = val.trim() !== "" ? val : placeholder;
      content = content.replaceAll(placeholder, replacement);
    });
    return content;
  };

  const copyToClipboard = async () => {
    if (!builderTemplate) return;
    const owner = user?.id;
    setAccessBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!owner || !session || session.user.id !== owner || userRef.current !== owner) return;
      const custom = customTemplates.find((item) => item.id === builderTemplate.id);
      const result = await accessLibraryResource({ data: {
        accessToken: session.access_token, resourceId: librarySourceId(builderTemplate.id),
        operation: "generate", fields: builderForm, customContent: custom?.content,
      } });
      if (result.rendered === null || userRef.current !== owner) return;
      await navigator.clipboard.writeText(result.rendered);
      toast.success(t.copiedToast);
    } catch (error) {
      if (isLibraryPremiumError(error)) {
        setBuilderTemplate(null);
        setPreviewTemplate(null);
        setPremiumOpen(true);
      } else toast.error(translate("libraryAccess.accessError"));
    } finally { setAccessBusy(false); }
  };

  // Get matching category display name & icon
  const getCategoryMeta = (cat: string) => {
    switch (cat) {
      case "contracts":
        return {
          label: t.contracts,
          icon: FileText,
          color: "text-primary bg-primary-soft border-primary/20",
        };
      case "finance":
        return {
          label: t.finance,
          icon: Wallet,
          color: "text-warning bg-warning/15 border-warning/20",
        };
      case "communication":
        return {
          label: t.communication,
          icon: Megaphone,
          color: "text-lilac bg-lilac-soft border-lilac/20",
        };
      case "business":
        return {
          label: t.business,
          icon: Briefcase,
          color: "text-accent bg-accent/15 border-accent/20",
        };
      case "placement":
        return {
          label: t.placement,
          icon: Target,
          color: "text-primary bg-primary-soft border-primary/20",
        };
      case "assessment":
        return {
          label: t.assessment,
          icon: GraduationCap,
          color: "text-lilac bg-lilac-soft border-lilac/20",
        };
      case "records":
        return {
          label: t.records,
          icon: UserCheck,
          color: "text-warning bg-warning/15 border-warning/20",
        };
      case "planning":
        return {
          label: t.planning,
          icon: Compass,
          color: "text-accent bg-accent/15 border-accent/20",
        };
      case "certificates":
        return {
          label: t.certificates,
          icon: Award,
          color: "text-primary bg-primary-soft border-primary/20",
        };
      default:
        return {
          label: cat,
          icon: FileText,
          color: "text-muted-foreground bg-muted border-border/20",
        };
    }
  };

  return (
    <div className="space-y-7">
      {/* Page Header */}
      <PageHeader
        eyebrow={lang === "pt" ? "Kit de Ferramentas" : "Business Toolkit"}
        title={t.title}
        description={t.subtitle}
        actions={
          <div className="relative w-64 md:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 shadow-sm transition-all"
            />
          </div>
        }
      />

      {selectedCategory ? (
        /* CATEGORY DETAILED VIEW */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <Button variant="ghost"
              onClick={() => setSelectedCategory(null)}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.backToDashboard}
            </Button>
            <h2 className="text-xl font-bold font-display text-foreground capitalize">
              {getCategoryMeta(selectedCategory).label}
            </h2>
            <Badge variant="secondary" className="text-xs font-medium px-2 py-0.5 rounded-full">
              {filteredTemplates.length} {t.categoryTemplates}
            </Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {filteredTemplates.map((template) => {
              const isFav = favorites.includes(template.id);
              const catMeta = getCategoryMeta(template.category);
              return (
                <PanelCard
                  key={template.id}
                  title={template.title}
                  description={template.description}
                  icon={<catMeta.icon className="h-4 w-4" />}
                  className="hover:shadow-md transition-shadow relative"
                  contentClassName="p-5 flex flex-col justify-between min-h-[140px]"
                >
                  <div className="flex-1">{accessBadge(template.id)}</div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-border/40">
                    <Button variant="ghost"
                      onClick={(e) => toggleFavorite(template.id, e)}
                      className={`h-auto w-auto p-1.5 rounded-lg border transition-colors hover:bg-secondary cursor-pointer ${
                        isFav
                          ? "text-amber-500 border-amber-200 bg-amber-500/5"
                          : "text-muted-foreground border-border"
                      }`}
                      title={isFav ? t.unfavorite : t.favorite}
                    >
                      {isFav ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                    </Button>

                    <div className="flex items-center gap-1.5">
                      <Button variant="ghost"
                        onClick={() => handleOpenPreview(template)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t.preview}
                      </Button>
                      <Button variant="ghost"
                        disabled={accessBusy}
                        onClick={(e) => handleUseTemplate(template, e)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                      >
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        {t.useTemplate}
                      </Button>
                    </div>
                  </div>
                </PanelCard>
              );
            })}
          </div>
        </div>
      ) : (
        /* MAIN DASHBOARD */
        <div className="space-y-8 animate-in fade-in duration-200">
          {/* SECTION 1: QUICK ACTIONS */}
          <div className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              {t.quickActions}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Button variant="ghost"
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "admin-student-contract");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="h-auto whitespace-normal flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-primary-soft p-2.5 text-primary border border-primary/10">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-primary transition-colors">
                    {t.newContract}
                  </h3>
                  {accessBadge("admin-student-contract")}
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Criar contrato de prestação de aulas"
                      : "Draft student agreement policies"}
                  </p>
                </div>
              </Button>

              <Button variant="ghost"
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "ped-placement-test");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="h-auto whitespace-normal flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-warning/10 p-2.5 text-warning border border-warning/10">
                  <Target className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-warning transition-colors">
                    {t.newPlacement}
                  </h3>
                  {accessBadge("ped-placement-test")}
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Iniciar teste de nivelamento"
                      : "Begin onboarding oral interview"}
                  </p>
                </div>
              </Button>

              <Button variant="ghost"
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "ped-progress-report");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="h-auto whitespace-normal flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-lilac-soft p-2.5 text-lilac border border-lilac/10">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-lilac transition-colors">
                    {t.newReport}
                  </h3>
                  {accessBadge("ped-progress-report")}
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Criar relatório de desempenho"
                      : "Generate mid-term student reviews"}
                  </p>
                </div>
              </Button>

              <Button variant="ghost"
                onClick={(e) => {
                  const temp = allTemplates.find((x) => x.id === "ped-course-certificate");
                  if (temp) handleUseTemplate(temp, e);
                }}
                className="h-auto whitespace-normal flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-5 text-left hover:border-primary/45 hover:shadow-md transition-all group cursor-pointer"
              >
                <div className="rounded-xl bg-accent/15 p-2.5 text-accent border border-accent/10">
                  <Award className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-foreground text-sm group-hover:text-accent transition-colors">
                    {t.newCertificate}
                  </h3>
                  {accessBadge("ped-course-certificate")}
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                    {lang === "pt"
                      ? "Emitir certificado de conclusão"
                      : "Award certificate of achievement"}
                  </p>
                </div>
              </Button>
            </div>
          </div>

          {/* SECTION 2: ADMINISTRATIVE RESOURCES */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t.adminTitle}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t.adminSubtitle}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  id: "contracts",
                  label: t.contracts,
                  icon: FileText,
                  color: "from-emerald-500/10 to-teal-500/10 hover:border-emerald-500/30",
                },
                {
                  id: "finance",
                  label: t.finance,
                  icon: Wallet,
                  color: "from-amber-500/10 to-orange-500/10 hover:border-amber-500/30",
                },
                {
                  id: "communication",
                  label: t.communication,
                  icon: Megaphone,
                  color: "from-indigo-500/10 to-purple-500/10 hover:border-indigo-500/30",
                },
                {
                  id: "business",
                  label: t.business,
                  icon: Briefcase,
                  color: "from-pink-500/10 to-rose-500/10 hover:border-pink-500/30",
                },
              ].map((cat) => {
                const count = getCategoryCount(cat.id);
                return (
                  <Button variant="ghost"
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`h-auto whitespace-normal flex items-center justify-between p-5 rounded-2xl border border-border bg-card hover:shadow-sm transition-all text-left cursor-pointer ${cat.color}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-secondary p-2.5 text-foreground border border-border/55">
                        <cat.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-foreground text-sm">
                          {cat.label}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {count} {t.categoryTemplates}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
                  </Button>
                );
              })}
            </div>
          </div>

          {/* SECTION 3: PEDAGOGICAL RESOURCES */}
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {t.pedagogicalTitle}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t.pedagogicalSubtitle}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                {
                  id: "placement",
                  label: t.placement,
                  icon: Target,
                  color: "from-sky-500/10 to-blue-500/10 hover:border-sky-500/30",
                },
                {
                  id: "assessment",
                  label: t.assessment,
                  icon: GraduationCap,
                  color: "from-violet-500/10 to-fuchsia-500/10 hover:border-violet-500/30",
                },
                {
                  id: "records",
                  label: t.records,
                  icon: UserCheck,
                  color: "from-yellow-500/10 to-amber-500/10 hover:border-yellow-500/30",
                },
                {
                  id: "planning",
                  label: t.planning,
                  icon: Compass,
                  color: "from-teal-500/10 to-cyan-500/10 hover:border-teal-500/30",
                },
                {
                  id: "certificates",
                  label: t.certificates,
                  icon: Award,
                  color: "from-red-500/10 to-orange-500/10 hover:border-red-500/30",
                },
              ].map((cat) => {
                const count = getCategoryCount(cat.id);
                return (
                  <Button variant="ghost"
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`h-auto whitespace-normal flex flex-col justify-between p-5 rounded-2xl border border-border bg-card hover:shadow-sm transition-all text-left cursor-pointer min-h-[120px] ${cat.color}`}
                  >
                    <div className="rounded-xl bg-secondary p-2.5 text-foreground border border-border/55 w-fit">
                      <cat.icon className="h-4 w-4" />
                    </div>
                    <div className="mt-3">
                      <h3 className="font-display font-bold text-foreground text-sm truncate">
                        {cat.label}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {count} {t.categoryTemplates}
                      </p>
                    </div>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* SECTION 4: RECENTLY USED & FAVORITES */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Favorites Column */}
            <PanelCard
              title={t.favoritesTitle}
              icon={<Bookmark className="h-4 w-4 text-amber-500" />}
              contentClassName="p-4 space-y-2.5"
            >
              {favorites.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t.noFavorites}</p>
              ) : (
                favorites.map((favId) => {
                  const template = allTemplates.find((x) => x.id === favId);
                  if (!template) return null;
                  const catMeta = getCategoryMeta(template.category);
                  return (
                    <div
                      key={template.id}
                      onClick={() => handleOpenPreview(template)}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <catMeta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">
                          {template.title}
                        </span>
                        {accessBadge(template.id)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost"
                          onClick={(e) => handleUseTemplate(template, e)}
                          className="h-auto w-auto p-1 text-primary hover:bg-primary-soft rounded transition-colors cursor-pointer"
                          title={t.useTemplate}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost"
                          onClick={(e) => toggleFavorite(template.id, e)}
                          className="h-auto w-auto p-1 text-amber-500 hover:bg-secondary rounded transition-colors cursor-pointer"
                          title={t.unfavorite}
                        >
                          <BookmarkCheck className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </PanelCard>

            {/* Recently Used Column */}
            <PanelCard
              title={t.recentTitle}
              icon={<History className="h-4 w-4 text-muted-foreground" />}
              contentClassName="p-4 space-y-2.5"
            >
              {recentOpened.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t.noRecent}</p>
              ) : (
                recentOpened.map((recId) => {
                  const template = allTemplates.find((x) => x.id === recId);
                  if (!template) return null;
                  const catMeta = getCategoryMeta(template.category);
                  const isFav = favorites.includes(template.id);
                  return (
                    <div
                      key={template.id}
                      onClick={() => handleOpenPreview(template)}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20 hover:bg-secondary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <catMeta.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold text-foreground truncate">
                          {template.title}
                        </span>
                        {accessBadge(template.id)}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost"
                          onClick={(e) => handleUseTemplate(template, e)}
                          className="h-auto w-auto p-1 text-primary hover:bg-primary-soft rounded transition-colors cursor-pointer"
                          title={t.useTemplate}
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost"
                          onClick={(e) => toggleFavorite(template.id, e)}
                          className={`h-auto w-auto p-1 rounded transition-colors cursor-pointer ${
                            isFav ? "text-amber-500" : "text-muted-foreground hover:bg-secondary"
                          }`}
                        >
                          {isFav ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </PanelCard>
          </div>
        </div>
      )}

      {accessBusy && (
        <div role="status" aria-label={translate("libraryAccess.checking")} className="space-y-2">
          <span className="sr-only">{translate("libraryAccess.checking")}</span>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      )}
      <PremiumBenefitsDialog open={premiumOpen} onOpenChange={setPremiumOpen} />

      {/* TEMPLATE PREVIEW MODAL */}
      <Dialog
        open={previewTemplate !== null}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      >
        <DialogContent className="max-w-xl rounded-2xl p-6">
          {previewTemplate && (
            <>
              <DialogHeader className="flex flex-row items-center justify-between pb-3 border-b border-border">
                <div>
                  <DialogTitle className="font-display text-lg font-bold text-foreground">
                    {previewTemplate.title}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    {getCategoryMeta(previewTemplate.category).label} ·{" "}
                    {previewTemplate.section === "administrative"
                      ? t.adminTitle
                      : t.pedagogicalTitle}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="py-4">
                <p className="text-xs text-muted-foreground mb-3 font-medium bg-secondary/80 px-3 py-2 rounded-xl border border-border/50">
                  {previewTemplate.description}
                </p>
                <div className="rounded-xl border border-border/80 p-4 bg-muted/15 max-h-[300px] overflow-y-auto font-mono text-[11px] whitespace-pre-wrap leading-relaxed text-foreground select-all">
                  {previewTemplate.content}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <Button variant="ghost"
                  onClick={(e) => handleDuplicateTemplate(previewTemplate, e)}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {t.duplicate}
                </Button>

                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost" className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer">
                      {t.close}
                    </Button>
                  </DialogClose>
                  <Button variant="ghost"
                    onClick={(e) => handleUseTemplate(previewTemplate, e)}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    {t.useTemplate}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* INTERACTIVE BUILDER / USE TEMPLATE MODAL */}
      <Dialog
        open={builderTemplate !== null}
        onOpenChange={(open) => !open && setBuilderTemplate(null)}
      >
        <DialogContent className="max-w-4xl rounded-2xl p-6 lg:max-h-[90vh] lg:overflow-y-auto">
          {builderTemplate && (
            <>
              <DialogHeader className="pb-3 border-b border-border">
                <DialogTitle className="font-display text-lg font-bold text-foreground">
                  {t.useTemplate}: {builderTemplate.title}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {lang === "pt"
                    ? "Preencha os campos abaixo para gerar o documento personalizado."
                    : "Fill in the placeholders below to generate your personalized document."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] py-4">
                {/* Form Controls Column */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pb-1 border-b border-border/60">
                    {t.fillPlaceholders}
                  </h3>
                  <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                    {builderTemplate.placeholders.map((p) => (
                      <div key={p} className="space-y-1">
                        <Label
                          htmlFor={`placeholder-${p}`}
                          className="text-xs font-semibold text-foreground"
                        >
                          {p}
                        </Label>
                        <Input
                          id={`placeholder-${p}`}
                          value={builderForm[p] || ""}
                          onChange={(e) =>
                            setBuilderForm((prev) => ({
                              ...prev,
                              [p]: e.target.value,
                            }))
                          }
                          placeholder={`e.g. [${p}]`}
                          className="h-9 rounded-xl text-xs bg-card"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live Preview Column */}
                <div className="space-y-3 flex flex-col">
                  <div className="flex items-center justify-between pb-1 border-b border-border/60">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {t.documentPreview}
                    </h3>
                    <Button variant="ghost"
                      disabled={accessBusy}
                      onClick={copyToClipboard}
                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-2 text-[11px] font-semibold text-primary transition-all hover:bg-primary-soft cursor-pointer"
                    >
                      <Copy className="h-3 w-3" />
                      {t.copy}
                    </Button>
                  </div>

                  {/* Generated Document Content Preview */}
                  <div className="flex-1 rounded-xl border border-border bg-card p-4 font-mono text-xs whitespace-pre-wrap leading-relaxed text-foreground select-all max-h-[350px] overflow-y-auto shadow-inner">
                    {getRenderedContent()}
                  </div>
                </div>
              </div>

              {/* Action Buttons Row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border mt-2">
                {/* Future Roadmap Actions - Styled but disabled */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost"
                    disabled
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-65"
                    title={`${t.exportPdf} (${t.soon})`}
                  >
                    <Download className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t.exportPdf}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 px-1 border-border/80 ml-1 rounded"
                    >
                      {t.soon}
                    </Badge>
                  </Button>

                  <Button variant="ghost"
                    disabled
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground cursor-not-allowed opacity-65"
                    title={`${t.sendStudent} (${t.soon})`}
                  >
                    <Send className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{t.sendStudent}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] py-0 px-1 border-border/80 ml-1 rounded"
                    >
                      {t.soon}
                    </Badge>
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <DialogClose asChild>
                    <Button variant="ghost" className="inline-flex h-9 items-center justify-center rounded-xl border border-border bg-card px-4 text-xs font-semibold text-foreground transition-all hover:bg-secondary cursor-pointer">
                      {t.close}
                    </Button>
                  </DialogClose>
                  <Button variant="ghost"
                    disabled={accessBusy}
                    onClick={copyToClipboard}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/95 cursor-pointer shadow-sm"
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t.copy}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
